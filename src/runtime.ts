import { parse } from "./parser.js";
import {
  ProgramNode,
  StatementNode,
  ExpressionNode,
  FunctionDefNode,
  ProcessNode,
  OutputNode,
  AssignmentNode,
  ExpressionStatementNode,
  RouteNode
} from "./ast.js";
import { KevError } from "./errors.js";
import {
  UnitValue,
  asNumber,
  unitAdd,
  unitSubtract,
  unitMultiply,
  unitDivide,
  unitPow,
  approxEqual,
  formatNumber
} from "./units.js";
import { combineChemistry, Substance, Mixture, trySubstance } from "./chemistry.js";
import { FoodProcess, GenericStep, getProcessSymbol } from "./food.js";
import { KNOWN_SYMBOLS, PROCESS_SYMBOLS } from "./symbols.js";
import { animateProcess } from "./animation.js";
import { Backend, KevHttpResponse } from "./backend.js";

export interface RunOptions {
  animation?: boolean;
  print?: (line: string) => void;
}

export interface RunResult {
  outputs: string[];
  lastResult?: any;
}

export function formatValue(value: any): string {
  if (value === undefined || value === null) return "";

  if (typeof value === "string") return value;
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "✓" : "✗";

  if (value instanceof UnitValue) return value.format();
  if (value instanceof Substance) return value.display;
  if (value instanceof Mixture) return value.toString();
  if (value instanceof FoodProcess) return value.symbol;
  if (value instanceof GenericStep) return value.name;
  if (value instanceof KevHttpResponse) {
    return `📤 HTTP ${value.status}`;
  }

  if (value?.type === "FunctionDef") {
    return `ƒ ${value.name}`;
  }

  if (Array.isArray(value)) {
    return value.map((v) => formatValue(v)).join(", ");
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function isSymbolicValue(v: any): boolean {
  return (
    typeof v === "string" ||
    v instanceof FoodProcess ||
    v instanceof GenericStep
  );
}

function applyBinary(operator: string, left: any, right: any): any {
  if (operator === "⊕") {
    const chem = combineChemistry(left, right);
    if (chem) return chem;

    if (isSymbolicValue(left) || isSymbolicValue(right)) {
      return `${formatValue(left)} ⊕ ${formatValue(right)}`;
    }

    return unitAdd(left, right);
  }

  if (operator === "+") {
    const chem = combineChemistry(left, right);
    if (chem) return chem;

    if (typeof left === "string" || typeof right === "string") {
      return String(left) + String(right);
    }

    if (isSymbolicValue(left) || isSymbolicValue(right)) {
      return `${formatValue(left)} + ${formatValue(right)}`;
    }

    return unitAdd(left, right);
  }

  if (operator === "−" || operator === "-") {
    return unitSubtract(left, right);
  }

  if (operator === "×" || operator === "*" || operator === "⊗") {
    return unitMultiply(left, right);
  }

  if (operator === "÷" || operator === "/") {
    return unitDivide(left, right);
  }

  if (operator === "^") {
    return unitPow(left, right);
  }

  if (operator === "≈") {
    return approxEqual(left, right);
  }

  if (operator === "≡") {
    if (left instanceof UnitValue && right instanceof UnitValue) {
      return left.format() === right.format();
    }

    if (typeof left === "object" || typeof right === "object") {
      return formatValue(left) === formatValue(right);
    }

    return left === right;
  }

  throw new KevError(`Unsupported operator: ${operator}`, {
    kind: "runtime"
  });
}

export class Runtime {
  animation: boolean;
  print?: (line: string) => void;

  outputs: string[] = [];
  lastResult: any = undefined;

  backend = new Backend();

  private env = new Map<string, any>();
  private functions = new Map<string, FunctionDefNode>();
  private symbolHandlers = new Map<string, (rt: Runtime) => any>();

  constructor(options: RunOptions = {}) {
    this.animation = Boolean(options.animation);
    this.print = options.print;
  }

  registerSymbol(name: string, handler: (rt: Runtime) => any): void {
    this.symbolHandlers.set(name, handler);
  }

  log(line: string): void {
    this.outputs.push(line);
    this.print?.(line);
  }

  async execute(source: string): Promise<RunResult> {
    this.outputs = [];
    this.lastResult = undefined;

    const program: ProgramNode = parse(source);

    for (const statement of program.statements) {
      await this.execStatement(statement);
    }

    return {
      outputs: this.outputs,
      lastResult: this.lastResult
    };
  }

  async evaluateRoute(handler: ExpressionNode, req: any): Promise<any> {
    const vars: Record<string, any> = {
      "📥": req,
      req,
      request: req,
      params: req.params,
      query: req.query,
      body: req.body,
      headers: req.headers,
      path: req.path,
      method: req.method
    };

    const oldValues = new Map<string, any>();
    const hadValues = new Map<string, boolean>();

    for (const [key, value] of Object.entries(vars)) {
      hadValues.set(key, this.env.has(key));
      oldValues.set(key, this.env.get(key));
      this.env.set(key, value);
    }

    try {
      let result = await this.eval(handler, false);

      if (result?.type === "FunctionDef") {
        result = await this.invokeFunction(result, [req]);
      }

      return result;
    } finally {
      for (const key of Object.keys(vars)) {
        if (hadValues.get(key)) {
          this.env.set(key, oldValues.get(key));
        } else {
          this.env.delete(key);
        }
      }
    }
  }

  private async execStatement(stmt: StatementNode): Promise<void> {
    switch (stmt.type) {
      case "FunctionDef": {
        this.functions.set(stmt.name, stmt);
        this.env.set(stmt.name, stmt);
        return;
      }

      case "Assignment": {
        await this.execAssignment(stmt);
        return;
      }

      case "Output": {
        await this.execOutput(stmt);
        return;
      }

      case "Process": {
        await this.execProcess(stmt);
        return;
      }

      case "ExpressionStatement": {
        await this.execExpressionStatement(stmt);
        return;
      }

      case "Route": {
        this.execRoute(stmt);
        return;
      }
    }
  }

  private execRoute(stmt: RouteNode): void {
    this.backend.addRoute(stmt.method, stmt.path, stmt.handler);
    this.lastResult = undefined;
  }

  private async execAssignment(stmt: AssignmentNode): Promise<void> {
    const value = await this.eval(stmt.value, false);
    const target = stmt.target.name;

    if (target.includes(".")) {
      this.setPath(target, value);
    } else {
      this.env.set(target, value);
    }

    this.lastResult = undefined;
  }

  private async execOutput(stmt: OutputNode): Promise<void> {
    const value = await this.eval(stmt.value, false);
    const formatted = formatValue(value);

    const line = stmt.label
      ? `${stmt.label} ${formatted}`.trim()
      : formatted;

    this.log(line);
    this.lastResult = value;
  }

  private async execExpressionStatement(
    stmt: ExpressionStatementNode
  ): Promise<void> {
    this.lastResult = await this.eval(stmt.expression, false);
  }

  private async execProcess(stmt: ProcessNode): Promise<void> {
    const values: any[] = [];

    for (const step of stmt.steps) {
      values.push(await this.eval(step, true));
    }

    const compact = values.map((v) =>
      v instanceof FoodProcess ? v.symbol : formatValue(v)
    );

    let line = compact[0] ?? "";
    for (let i = 1; i < compact.length; i++) {
      line += ` ${stmt.operators[i - 1] ?? "→"} ${compact[i]}`;
    }

    if (!this.animation) {
      this.log(line);
      this.lastResult = values[values.length - 1];
      return;
    }

    const verbose = values.map((v) =>
      v instanceof FoodProcess ? `${v.symbol} ${v.label}` : formatValue(v)
    );

    await animateProcess(verbose, stmt.operators, (l) => this.log(l));
    this.lastResult = values[values.length - 1];
  }

  async eval(node: ExpressionNode, processContext: boolean): Promise<any> {
    switch (node.type) {
      case "NumberLiteral":
        return node.unit ? new UnitValue(node.value, node.unit) : node.value;

      case "StringLiteral":
        return node.value;

      case "Identifier":
        return this.resolve(node.name, processContext);

      case "Unary": {
        const value = await this.eval(node.operand, processContext);

        if (node.operator === "-" || node.operator === "−") {
          if (value instanceof UnitValue) {
            return new UnitValue(-value.value, value.unit);
          }
          return -asNumber(value);
        }

        return value;
      }

      case "Binary": {
        const left = await this.eval(node.left, processContext);
        const right = await this.eval(node.right, processContext);
        return applyBinary(node.operator, left, right);
      }

      case "Call": {
        const args: any[] = [];
        for (const arg of node.args) {
          args.push(await this.eval(arg, false));
        }
        return this.call(node.callee, args);
      }

      case "ObjectLiteral": {
        const obj: Record<string, any> = {};

        for (const prop of node.properties) {
          obj[prop.key] = await this.eval(prop.value, processContext);
        }

        return obj;
      }

      case "ArrayLiteral": {
        const arr: any[] = [];

        for (const element of node.elements) {
          arr.push(await this.eval(element, processContext));
        }

        return arr;
      }

      default:
        throw new KevError("Unknown AST node", { kind: "runtime" });
    }
  }

  private resolve(name: string, processContext: boolean): any {
    if (name.includes(".")) {
      return this.resolvePath(name, processContext);
    }

    if (this.env.has(name)) {
      return this.env.get(name);
    }

    const fn = this.functions.get(name);
    if (fn) return fn;

    const handler = this.symbolHandlers.get(name);
    if (handler) return handler(this);

    const processSymbol = getProcessSymbol(name);
    if (processSymbol) return processSymbol;

    const substance = trySubstance(name);
    if (substance) return substance;

    if (processContext) {
      return new GenericStep(name);
    }

    throw this.unknownSymbol(name);
  }

  private resolvePath(fullName: string, processContext: boolean): any {
    const parts = fullName.split(".");
    const rootName = parts[0];

    let value: any;

    if (this.env.has(rootName)) {
      value = this.env.get(rootName);
    } else if (this.functions.has(rootName)) {
      value = this.functions.get(rootName);
    } else {
      const processSymbol = getProcessSymbol(rootName);
      if (processSymbol) {
        value = processSymbol;
      } else {
        const substance = trySubstance(rootName);
        if (substance) {
          value = substance;
        } else if (processContext) {
          value = new GenericStep(rootName);
        } else {
          throw this.unknownSymbol(rootName);
        }
      }
    }

    for (let i = 1; i < parts.length; i++) {
      if (value === undefined || value === null) {
        return undefined;
      }

      value = value[parts[i]];
    }

    return value;
  }

  private setPath(path: string, value: any): void {
    const parts = path.split(".");

    if (parts.length === 1) {
      this.env.set(parts[0], value);
      return;
    }

    const root = parts[0];

    if (!this.env.has(root) || typeof this.env.get(root) !== "object") {
      this.env.set(root, {});
    }

    let current = this.env.get(root);

    for (let i = 1; i < parts.length - 1; i++) {
      const key = parts[i];

      if (
        current[key] === undefined ||
        current[key] === null ||
        typeof current[key] !== "object"
      ) {
        current[key] = {};
      }

      current = current[key];
    }

    current[parts[parts.length - 1]] = value;
  }

  private async call(name: string, args: any[]): Promise<any> {
    if (name === "Σ" || name === "sum") {
      return args.reduce((acc, v) => unitAdd(acc, v), 0);
    }

    if (name === "⚡" || name === "serve") {
      return this.startServer(args);
    }

    if (name === "📤" || name === "response") {
      return new KevHttpResponse(
        args[0],
        args[1] !== undefined ? Math.floor(asNumber(args[1])) : 200,
        args[2] ?? {}
      );
    }

    if (name === "json") {
      return new KevHttpResponse(args[0], 200, {
        "Content-Type": "application/json; charset=utf-8"
      });
    }

    if (name === "text") {
      return new KevHttpResponse(String(args[0] ?? ""), 200, {
        "Content-Type": "text/plain; charset=utf-8"
      });
    }

    if (name === "html") {
      return new KevHttpResponse(String(args[0] ?? ""), 200, {
        "Content-Type": "text/html; charset=utf-8"
      });
    }

    if (name === "env") {
      return this.envVar(args[0]);
    }

    if (name === "delay") {
      const ms = Math.max(0, Math.floor(asNumber(args[0] ?? 0)));
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
      return undefined;
    }

    if (name === "file") {
      return this.readFile(String(args[0] ?? ""));
    }

    const fn = this.functions.get(name);

    if (fn) {
      return this.invokeFunction(fn, args);
    }

    const envValue = this.env.get(name);
    if (typeof envValue === "function") {
      return envValue(...args);
    }

    throw this.unknownSymbol(name);
  }

  private async invokeFunction(
    fn: FunctionDefNode,
    args: any[]
  ): Promise<any> {
    const oldValues = new Map<string, any>();
    const hadValues = new Map<string, boolean>();

    fn.params.forEach((param, i) => {
      hadValues.set(param, this.env.has(param));
      oldValues.set(param, this.env.get(param));
      this.env.set(param, args[i]);
    });

    try {
      return await this.eval(fn.body, false);
    } finally {
      fn.params.forEach((param) => {
        if (hadValues.get(param)) {
          this.env.set(param, oldValues.get(param));
        } else {
          this.env.delete(param);
        }
      });
    }
  }

  private startServer(args: any[]): any {
    if (this.backend.started) {
      return this.backend.server;
    }

    const port =
      args.length > 0
        ? Math.floor(asNumber(args[0]))
        : 3000;

    this.backend.start(port, this);
    this.log(`🌐 listening on http://localhost:${port}`);
    return this.backend.server;
  }

  private envVar(name: any): string | undefined {
    const key = String(name ?? "");
    const env =
      (globalThis as any).Bun?.env ??
      (globalThis as any).process?.env ??
      {};

    return env[key];
  }

  private async readFile(path: string): Promise<string> {
    const g = globalThis as any;

    if (g.Bun?.file) {
      return await g.Bun.file(path).text();
    }

    const { readFile } = await import("node:fs/promises");
    return await readFile(path, "utf8");
  }

  private unknownSymbol(name: string): KevError {
    const suggestions = Array.from(
      new Set([
        ...Object.keys(PROCESS_SYMBOLS),
        ...KNOWN_SYMBOLS,
        ...this.env.keys(),
        "📥",
        "req",
        "params",
        "query",
        "body",
        "headers",
        "⚡",
        "📤",
        "env",
        "delay",
        "file"
      ])
    )
      .filter((s) => s !== name)
      .slice(0, 12);

    return new KevError(`Unknown molecular symbol: ${name}`, {
      kind: "unknown-symbol",
      symbol: name,
      suggestions
    });
  }
}

export async function run(
  source: string,
  options: RunOptions = {}
): Promise<RunResult> {
  const runtime = new Runtime(options);
  return runtime.execute(source);
}

import { Token, tokenize } from "./lexer.js";
import {
  ProgramNode,
  StatementNode,
  ExpressionNode,
  IdentifierNode,
  FunctionDefNode,
  ProcessNode,
  OutputNode,
  AssignmentNode,
  RouteNode,
  ObjectLiteralNode,
  ObjectPropertyNode,
  ArrayLiteralNode
} from "./ast.js";
import { KevError } from "./errors.js";
import {
  CHAIN_OPERATORS,
  OUTPUT_LABELS,
  PROCESS_SYMBOLS,
  HTTP_METHODS,
  containsNonAscii,
  hasSubscript
} from "./symbols.js";
import { trySubstance } from "./chemistry.js";

export function parse(source: string): ProgramNode {
  const tokens = tokenize(source);
  return new Parser(tokens).parseProgram();
}

function isProcessishName(name: string): boolean {
  return (
    Boolean(PROCESS_SYMBOLS[name]) ||
    Boolean(trySubstance(name)) ||
    /\p{Extended_Pictographic}/u.test(name) ||
    hasSubscript(name) ||
    containsNonAscii(name)
  );
}

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseProgram(): ProgramNode {
    const statements: StatementNode[] = [];

    this.skipNewlines();

    while (!this.check("EOF")) {
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
      this.skipNewlines();
    }

    return { type: "Program", statements };
  }

  private parseStatement(): StatementNode | null {
    this.skipNewlines();

    if (this.check("EOF")) return null;

    if (this.check("Operator", "∵")) {
      while (!this.check("Newline") && !this.check("EOF")) this.advance();
      return null;
    }

    if (this.check("Identifier", "ƒ")) {
      return this.parseFunctionDef();
    }

    if (
      this.check("Identifier") &&
      HTTP_METHODS.includes(this.peek().value) &&
      this.peek(1).type === "String"
    ) {
      return this.parseRoute();
    }

    if (this.check("Operator", "→") || this.check("Operator", "∴")) {
      this.advance();
      this.skipNewlines();
      const value = this.parseExpression();
      return { type: "Output", value };
    }

    const left = this.parseExpression();

    if (this.check("Newline") || this.check("EOF")) {
      return { type: "ExpressionStatement", expression: left };
    }

    if (this.check("Operator")) {
      const op = this.peek().value;

      if (op === "←") {
        this.advance();
        const value = this.parseExpression();
        return this.makeAssignment(left, op, value);
      }

      if (op === "⟹") {
        this.advance();
        const value = this.parseExpression();
        return this.makeAssignment(left, op, value);
      }

      if (op === "∴") {
        this.advance();
        return { type: "Output", value: left };
      }

      if ((CHAIN_OPERATORS as string[]).includes(op)) {
        return this.parseChain(left);
      }
    }

    throw this.expected("newline or reaction arrow");
  }

  private parseRoute(): RouteNode {
    const method = this.expectIdentifier().value.toUpperCase();
    const path = this.expect("String").value;

    if (
      this.check("Operator", "→") ||
      this.check("Operator", "⟶")
    ) {
      this.advance();
    } else {
      throw this.expected("→");
    }

    this.skipNewlines();
    const handler = this.parseExpression();

    return {
      type: "Route",
      method,
      path,
      handler
    };
  }

  private parseFunctionDef(): FunctionDefNode {
    this.expect("Identifier", "ƒ");

    const name = this.expectIdentifier().value;

    this.expect("Punct", "(");

    const params: string[] = [];

    while (!this.check("Punct", ")") && !this.check("EOF")) {
      params.push(this.expectIdentifier().value);

      if (this.match("Punct", ",")) {
        continue;
      }

      break;
    }

    this.expect("Punct", ")");

    if (
      this.check("Operator", "→") ||
      this.check("Operator", "⟶") ||
      this.check("Operator", "⟹")
    ) {
      this.advance();
    } else {
      throw this.expected("→");
    }

    this.skipNewlines();
    const body = this.parseExpression();

    return {
      type: "FunctionDef",
      name,
      params,
      body
    };
  }

  private parseChain(start: ExpressionNode): StatementNode {
    const steps: ExpressionNode[] = [start];
    const operators: string[] = [];

    while (
      this.check("Operator") &&
      (CHAIN_OPERATORS as string[]).includes(this.peek().value)
    ) {
      operators.push(this.advance().value);
      steps.push(this.parseExpression());
    }

    return this.classifyChain(steps, operators);
  }

  private classifyChain(
    steps: ExpressionNode[],
    operators: string[]
  ): StatementNode {
    if (steps.length === 2) {
      const [left, right] = steps;
      const op = operators[0];

      if (op === "⟶" && left.type === "Identifier") {
        if (right.type !== "Identifier") {
          return this.makeAssignment(left, op, right);
        }

        if (
          !isProcessishName(left.name) &&
          !isProcessishName(right.name)
        ) {
          return this.makeAssignment(left, op, right);
        }
      }

      if (op === "→" && left.type === "Identifier") {
        if (right.type === "StringLiteral") {
          return {
            type: "Output",
            label: left.name,
            value: right
          };
        }

        if (
          OUTPUT_LABELS.includes(left.name) &&
          (right.type !== "Identifier" || !isProcessishName(right.name))
        ) {
          return {
            type: "Output",
            label: left.name,
            value: right
          };
        }
      }
    }

    return {
      type: "Process",
      steps,
      operators
    };
  }

  private makeAssignment(
    targetExpr: ExpressionNode,
    operator: string,
    value: ExpressionNode
  ): AssignmentNode {
    if (targetExpr.type !== "Identifier") {
      throw this.expected("variable");
    }

    return {
      type: "Assignment",
      target: targetExpr,
      operator,
      value
    };
  }

  private parseExpression(): ExpressionNode {
    return this.parseComparison();
  }

  private parseComparison(): ExpressionNode {
    let left = this.parseAdditive();

    while (
      this.check("Operator", "≈") ||
      this.check("Operator", "≡")
    ) {
      const operator = this.advance().value;
      const right = this.parseAdditive();
      left = { type: "Binary", operator, left, right };
    }

    return left;
  }

  private parseAdditive(): ExpressionNode {
    let left = this.parseMultiplicative();

    while (
      this.check("Operator", "+") ||
      this.check("Operator", "⊕") ||
      this.check("Operator", "−") ||
      this.check("Operator", "-")
    ) {
      const operator = this.advance().value;
      const right = this.parseMultiplicative();
      left = { type: "Binary", operator, left, right };
    }

    return left;
  }

  private parseMultiplicative(): ExpressionNode {
    let left = this.parseExponent();

    while (
      this.check("Operator", "*") ||
      this.check("Operator", "×") ||
      this.check("Operator", "⊗") ||
      this.check("Operator", "/") ||
      this.check("Operator", "÷")
    ) {
      const operator = this.advance().value;
      const right = this.parseExponent();
      left = { type: "Binary", operator, left, right };
    }

    return left;
  }

  private parseExponent(): ExpressionNode {
    const left = this.parseUnary();

    if (this.check("Operator", "^")) {
      const operator = this.advance().value;
      const right = this.parseExponent();
      return { type: "Binary", operator, left, right };
    }

    return left;
  }

  private parseUnary(): ExpressionNode {
    if (this.check("Operator", "-") || this.check("Operator", "−")) {
      const operator = this.advance().value;
      const operand = this.parseUnary();
      return { type: "Unary", operator, operand };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    const token = this.peek();

    if (token.type === "Number") {
      this.advance();
      return {
        type: "NumberLiteral",
        value: token.number ?? Number(token.value),
        unit: token.unit
      };
    }

    if (token.type === "String") {
      this.advance();
      return {
        type: "StringLiteral",
        value: token.value
      };
    }

    if (token.type === "Punct" && token.value === "{") {
      this.advance();
      return this.parseObjectLiteral();
    }

    if (
      token.type === "Identifier" &&
      token.value === "🧬" &&
      this.peek(1).type === "Punct" &&
      this.peek(1).value === "{"
    ) {
      this.advance();
      this.advance();
      return this.parseObjectLiteral();
    }

    if (token.type === "Punct" && token.value === "[") {
      this.advance();
      return this.parseArrayLiteral();
    }

    if (token.type === "Identifier") {
      const ident = this.advance();

      if (this.check("Punct", "(")) {
        this.advance();

        const args: ExpressionNode[] = [];

        while (!this.check("Punct", ")") && !this.check("EOF")) {
          args.push(this.parseExpression());

          if (this.match("Punct", ",")) {
            continue;
          }

          break;
        }

        this.expect("Punct", ")");

        return {
          type: "Call",
          callee: ident.value,
          args
        };
      }

      return {
        type: "Identifier",
        name: ident.value
      };
    }

    if (token.type === "Punct" && token.value === "(") {
      this.advance();
      const expr = this.parseExpression();
      this.expect("Punct", ")");
      return expr;
    }

    throw this.expected("value");
  }

  private parseObjectLiteral(): ObjectLiteralNode {
    const properties: ObjectPropertyNode[] = [];

    this.skipNewlines();

    while (!this.check("Punct", "}") && !this.check("EOF")) {
      let key: string;

      if (this.check("Identifier")) {
        key = this.advance().value;
      } else if (this.check("String")) {
        key = this.advance().value;
      } else if (this.check("Number")) {
        key = this.advance().value;
      } else {
        throw this.expected("object key");
      }

      if (this.match("Punct", ":")) {
        // colon syntax
      } else if (this.match("Operator", "←")) {
        // KevLang assignment syntax
      } else {
        throw this.expected(": or ←");
      }

      const value = this.parseExpression();

      properties.push({
        key,
        value
      });

      this.skipNewlines();

      if (this.match("Punct", ",")) {
        this.skipNewlines();
      }
    }

    this.expect("Punct", "}");

    return {
      type: "ObjectLiteral",
      properties
    };
  }

  private parseArrayLiteral(): ArrayLiteralNode {
    const elements: ExpressionNode[] = [];

    this.skipNewlines();

    while (!this.check("Punct", "]") && !this.check("EOF")) {
      elements.push(this.parseExpression());

      this.skipNewlines();

      if (this.match("Punct", ",")) {
        this.skipNewlines();
      }
    }

    this.expect("Punct", "]");

    return {
      type: "ArrayLiteral",
      elements
    };
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private check(type: Token["type"], value?: string): boolean {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }

  private match(type: Token["type"], value?: string): boolean {
    if (this.check(type, value)) {
      this.advance();
      return true;
    }
    return false;
  }

  private expect(type: Token["type"], value?: string): Token {
    if (!this.check(type, value)) {
      throw this.expected(value ?? type);
    }
    return this.advance();
  }

  private expectIdentifier(): Token {
    return this.expect("Identifier");
  }

  private skipNewlines(): void {
    while (this.match("Newline")) {
      // skip
    }
  }

  private expected(expected: string): KevError {
    const token = this.peek();

    return new KevError("Syntax error", {
      kind: "syntax",
      line: token.line,
      column: token.column,
      expected,
      received: token.value || token.type
    });
  }
}

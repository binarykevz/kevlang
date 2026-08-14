import { KevError } from "./errors.js";
import { parseQuantity, UNIT_SUFFIXES } from "./units.js";

export type TokenType =
  | "Number"
  | "String"
  | "Identifier"
  | "Operator"
  | "Punct"
  | "Newline"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  number?: number;
  unit?: string;
}

const OPERATORS: Array<[string, string]> = [
  ["-->", "⟶"],
  ["<->", "↔"],
  ["<=>", "⇌"],
  ["<-", "←"],
  ["->", "→"],
  ["=>", "⟹"],
  ["**", "^"],

  ["←", "←"],
  ["→", "→"],
  ["⟶", "⟶"],
  ["⇌", "⇌"],
  ["⟹", "⟹"],
  ["↔", "↔"],

  ["⊕", "⊕"],
  ["⊗", "⊗"],
  ["÷", "÷"],
  ["−", "−"],
  ["×", "×"],
  ["+", "+"],
  ["-", "-"],
  ["*", "*"],
  ["/", "/"],
  ["^", "^"],
  ["≈", "≈"],
  ["≡", "≡"],
  ["∴", "∴"],
  ["∵", "∵"],
  ["%", "%"]
];

const SORTED_OPERATORS = [...OPERATORS].sort((a, b) => b[0].length - a[0].length);

const OPERATOR_CHARS = new Set<string>();
for (const [op] of OPERATORS) {
  OPERATOR_CHARS.add(op[0]);
}

const PUNCT_CHARS = new Set(["(", ")", ",", "{", "}", "[", "]", ":"]);

function preprocessSource(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();

      const isTitle =
        trimmed.startsWith("⚗") &&
        !/[←→⟶⇌⟹ƒ{]/.test(trimmed);

      if (isTitle) return `# ${line}`;
      return line;
    })
    .join("\n");
}

function matchUnitAt(source: string, pos: number): string | null {
  for (const unit of UNIT_SUFFIXES) {
    if (!source.startsWith(unit, pos)) continue;

    const next = source[pos + unit.length];

    if (unit.length === 1 && next && /[\p{L}\p{N}_]/u.test(next)) {
      continue;
    }

    return unit;
  }

  return null;
}

function matchOperatorAt(source: string, pos: number): [string, string] | null {
  for (const [op, normalized] of SORTED_OPERATORS) {
    if (source.startsWith(op, pos)) {
      return [op, normalized];
    }
  }
  return null;
}

function isIdentChar(ch: string): boolean {
  if (!ch) return false;
  if (/\s/.test(ch)) return false;
  if (ch === "#" || ch === ";" || ch === '"' || ch === "'" || ch === "`") return false;
  if (PUNCT_CHARS.has(ch)) return false;
  if (OPERATOR_CHARS.has(ch)) return false;
  return true;
}

export function tokenize(source: string): Token[] {
  const src = preprocessSource(source);
  const tokens: Token[] = [];

  let i = 0;
  let line = 1;
  let lineStart = 0;

  const col = () => i - lineStart + 1;
  const push = (type: TokenType, value: string, extra: Partial<Token> = {}) => {
    tokens.push({ type, value, line, column: col(), ...extra });
  };

  while (i < src.length) {
    const ch = src[i];

    if (ch === "\n") {
      push("Newline", "\n");
      i++;
      line++;
      lineStart = i;
      if (src[i] === "\r") i++;
      continue;
    }

    if (ch === "\r") {
      i++;
      continue;
    }

    if (ch === ";") {
      push("Newline", ";");
      i++;
      continue;
    }

    if (ch === " " || ch === "\t" || ch === "\u00A0") {
      i++;
      continue;
    }

    if (ch === "#" || ch === "∵") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      const startCol = col();
      i++;

      let text = "";
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          i++;
          const esc = src[i];
          if (esc === "n") text += "\n";
          else if (esc === "t") text += "\t";
          else text += esc ?? "";
        } else {
          text += src[i];
        }
        i++;
      }

      if (src[i] !== quote) {
        throw new KevError("Unterminated string literal", {
          kind: "syntax",
          line,
          column: startCol,
          expected: quote,
          received: "EOF"
        });
      }

      i++;
      tokens.push({
        type: "String",
        value: text,
        line,
        column: startCol
      });
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const re = /[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/y;
      re.lastIndex = i;
      const m = re.exec(src);

      if (!m || m.index !== i || m[0].length === 0) {
        throw new KevError("Invalid number", {
          kind: "syntax",
          line,
          column: col(),
          expected: "number",
          received: ch
        });
      }

      let end = i + m[0].length;
      const unit = matchUnitAt(src, end);

      if (unit) {
        end += unit.length;
      }

      const raw = src.slice(i, end);
      const quantity = parseQuantity(raw);

      push("Number", raw, {
        number: quantity.value,
        unit: quantity.unit
      });

      i = end;
      continue;
    }

    const op = matchOperatorAt(src, i);
    if (op) {
      const [raw, normalized] = op;
      push("Operator", normalized);
      i += raw.length;
      continue;
    }

    if (PUNCT_CHARS.has(ch)) {
      push("Punct", ch);
      i++;
      continue;
    }

    if (isIdentChar(ch)) {
      const start = i;
      while (i < src.length && isIdentChar(src[i])) {
        i++;
      }

      const value = src.slice(start, i);
      if (!value) {
        throw new KevError("Unexpected token", {
          kind: "syntax",
          line,
          column: col(),
          expected: "symbol",
          received: ch
        });
      }

      push("Identifier", value);
      continue;
    }

    throw new KevError("Unexpected token", {
      kind: "syntax",
      line,
      column: col(),
      expected: "valid KevLang token",
      received: ch
    });
  }

  push("EOF", "");
  return tokens;
}

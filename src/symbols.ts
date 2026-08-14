export const VERSION = "1.0.0";

export const ARROW_OPERATORS = ["←", "→", "⟶", "⇌", "⟹", "↔"];

export const ASSIGN_OPERATORS = ["←", "⟹"];

export const CHAIN_OPERATORS = ["→", "⟶", "⇌", "↔"];

export const BINARY_OPERATORS = [
  "⊕",
  "⊗",
  "×",
  "*",
  "÷",
  "/",
  "−",
  "-",
  "+",
  "^",
  "≈",
  "≡"
];

export const OUTPUT_PREFIXES = ["→", "∴"];

export const OUTPUT_LABELS = ["🧪", "⚗", "🤖", "📡"];

export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS"
];

export const PROCESS_SYMBOLS: Record<string, string> = {
  "🌾": "raw material",
  "⚙": "processing",
  "🔥": "heating",
  "❄": "cooling",
  "📦": "packaging",
  "🥤": "beverage",
  "🍞": "bread",
  "🥛": "liquid",
  "🧂": "salt",
  "🍬": "sugar",
  "💧": "water",
  "🧫": "culture",
  "🧪": "experiment",
  "⚗": "reaction",
  "🌡": "temperature",
  "⏱": "time",
  "pH": "acidity",
  "aw": "water activity",
  "RH": "relative humidity",
  "T": "temperature",
  "t": "time",
  "P": "pressure",
  "C": "concentration",
  "m": "mass",
  "V": "volume"
};

export const KNOWN_SYMBOLS = [
  "⚛",
  "🧪",
  "⚗",
  "🧫",
  "🔥",
  "❄",
  "💧",
  "🧂",
  "🍬",
  "🥛",
  "🌾",
  "🌡",
  "⏱",
  "pH",
  "aw",
  "RH",
  "T",
  "t",
  "P",
  "C",
  "m",
  "V",
  "Δ",
  "Σ",
  "μ",
  "ρ",
  "←",
  "→",
  "⟶",
  "⇌",
  "⊕",
  "⊗",
  "÷",
  "−",
  "≈",
  "≡",
  "∴",
  "∵",
  "⚡",
  "📤",
  "📥",
  "🧬"
];

export const SUBSCRIPT_MAP: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9"
};

export function normalizeSubscripts(text: string): string {
  return Array.from(text)
    .map((ch) => SUBSCRIPT_MAP[ch] ?? ch)
    .join("");
}

export function containsNonAscii(text: string): boolean {
  return /[^\u0000-\u007F]/.test(text);
}

export function hasSubscript(text: string): boolean {
  return /[₀-₉]/.test(text);
}

export function isPlainAsciiIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

const RESERVED_JS = new Set([
  "let",
  "const",
  "var",
  "function",
  "return",
  "class",
  "new",
  "await",
  "async",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "typeof",
  "instanceof",
  "in",
  "of",
  "delete",
  "void",
  "this",
  "super",
  "import",
  "export",
  "default",
  "extends",
  "static",
  "yield",
  "null",
  "true",
  "false"
]);

export function sanitizeJsName(name: string): string {
  if (isPlainAsciiIdentifier(name) && !RESERVED_JS.has(name)) {
    return name;
  }

  let out = "_";
  for (const ch of name) {
    if (/[A-Za-z0-9_$]/.test(ch)) {
      out += ch;
    } else {
      const cp = ch.codePointAt(0) ?? 0;
      out += "u" + cp.toString(16).padStart(4, "0");
    }
  }
  return out;
}

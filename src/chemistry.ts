import { normalizeSubscripts } from "./symbols.js";

const ELEMENTS: Record<string, number> = {
  H: 1.008,
  He: 4.0026,
  Li: 6.94,
  Be: 9.0122,
  B: 10.81,
  C: 12.011,
  N: 14.007,
  O: 15.999,
  F: 18.998,
  Ne: 20.180,
  Na: 22.990,
  Mg: 24.305,
  Al: 26.982,
  Si: 28.085,
  P: 30.974,
  S: 32.06,
  Cl: 35.45,
  K: 39.098,
  Ca: 40.078,
  Fe: 55.845,
  Cu: 63.546,
  Zn: 65.38,
  I: 126.904
};

const TO_SUBSCRIPT: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉"
};

export class Substance {
  formula: string;
  display: string;
  mass: number;

  constructor(formula: string, display: string, mass: number) {
    this.formula = formula;
    this.display = display;
    this.mass = mass;
  }

  toString(): string {
    return this.display;
  }
}

export class Mixture {
  components: any[];

  constructor(components: any[]) {
    this.components = components;
  }

  toString(): string {
    return this.components.map((c) => String(c)).join(" ⊕ ");
  }
}

export function toUnicodeFormula(formula: string): string {
  return formula.replace(/\d+/g, (digits) =>
    Array.from(digits)
      .map((d) => TO_SUBSCRIPT[d] ?? d)
      .join("")
  );
}

interface NormalizedFormula {
  formula: string;
  mass: number;
}

export function normalizeFormula(name: string): NormalizedFormula | null {
  const cleaned = normalizeSubscripts(name).replace(/\s+/g, "");

  if (!cleaned) return null;
  if (!/^([A-Z][a-z]?\d*)+$/.test(cleaned)) return null;

  const parts = cleaned.match(/[A-Z][a-z]?\d*/g);
  if (!parts || parts.join("") !== cleaned) return null;

  let mass = 0;

  for (const part of parts) {
    const m = /^([A-Z][a-z]?)(\d*)$/.exec(part);
    if (!m) return null;

    const element = m[1];
    const count = m[2] ? parseInt(m[2], 10) : 1;

    if (!(element in ELEMENTS)) return null;

    mass += ELEMENTS[element] * count;
  }

  return { formula: cleaned, mass };
}

export function trySubstance(name: string): Substance | undefined {
  const normalized = normalizeFormula(name);
  if (!normalized) return undefined;

  return new Substance(
    normalized.formula,
    toUnicodeFormula(normalized.formula),
    normalized.mass
  );
}

export function isChemicalValue(v: any): boolean {
  return v instanceof Substance || v instanceof Mixture;
}

function flattenChemical(v: any): any[] | null {
  if (v instanceof Substance) return [v];
  if (v instanceof Mixture) {
    return v.components.flatMap((c) => flattenChemical(c) ?? [c]);
  }
  return null;
}

export function combineChemistry(a: any, b: any): Mixture | undefined {
  const fa = flattenChemical(a);
  const fb = flattenChemical(b);

  if (!fa && !fb) return undefined;

  return new Mixture([...(fa ?? [a]), ...(fb ?? [b])]);
}

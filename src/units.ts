export interface Quantity {
  value: number;
  unit: string;
}

interface UnitInfo {
  dimension: string;
  factor: number;
  offset?: number;
}

const UNIT_DB: Record<string, UnitInfo> = {
  "°C": { dimension: "temperature", factor: 1, offset: 273.15 },
  "°F": { dimension: "temperature", factor: 5 / 9, offset: 255.3722222222222 },
  K: { dimension: "temperature", factor: 1, offset: 0 },

  "Δ°C": { dimension: "temperature-delta", factor: 1 },
  "Δ°F": { dimension: "temperature-delta", factor: 5 / 9 },
  "ΔK": { dimension: "temperature-delta", factor: 1 },

  d: { dimension: "time", factor: 86400 },
  h: { dimension: "time", factor: 3600 },
  min: { dimension: "time", factor: 60 },
  s: { dimension: "time", factor: 1 },
  ms: { dimension: "time", factor: 0.001 },
  wk: { dimension: "time", factor: 604800 },

  g: { dimension: "mass", factor: 1 },
  kg: { dimension: "mass", factor: 1000 },
  mg: { dimension: "mass", factor: 0.001 },

  mL: { dimension: "volume", factor: 1 },
  L: { dimension: "volume", factor: 1000 },
  uL: { dimension: "volume", factor: 0.001 },
  "µL": { dimension: "volume", factor: 0.001 },
  "μL": { dimension: "volume", factor: 0.001 },

  "%": { dimension: "percent", factor: 1 },

  Pa: { dimension: "pressure", factor: 1 },
  kPa: { dimension: "pressure", factor: 1000 },
  atm: { dimension: "pressure", factor: 101325 },
  bar: { dimension: "pressure", factor: 100000 },

  M: { dimension: "concentration", factor: 1 },
  mM: { dimension: "concentration", factor: 0.001 },
  uM: { dimension: "concentration", factor: 1e-6 },
  "µM": { dimension: "concentration", factor: 1e-6 },
  "μM": { dimension: "concentration", factor: 1e-6 }
};

export const UNIT_SUFFIXES = [
  "°C",
  "°F",
  "kPa",
  "mL",
  "µL",
  "μL",
  "uL",
  "mg",
  "kg",
  "min",
  "ms",
  "mM",
  "µM",
  "μM",
  "uM",
  "atm",
  "bar",
  "wk",
  "Pa",
  "K",
  "C",
  "F",
  "d",
  "h",
  "s",
  "g",
  "L",
  "M",
  "%"
].sort((a, b) => b.length - a.length);

export function getUnitInfo(unit: string): UnitInfo {
  return UNIT_DB[unit] ?? { dimension: "unknown", factor: 1 };
}

export function getDimension(unit: string): string {
  if (!unit) return "dimensionless";
  return getUnitInfo(unit).dimension;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n) < 1e-12) return "0";
  return Number(n.toPrecision(12)).toString();
}

export function parseQuantity(raw: string): Quantity {
  const match = /^([+-]?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)(.*)$/.exec(raw.trim());
  if (!match) return { value: Number(raw), unit: "" };

  const value = Number(match[1]);
  let unit = match[2].trim();

  if (unit === "C" || unit === "c") unit = "°C";
  if (unit === "F" || unit === "f") unit = "°F";
  if (unit === "ml") unit = "mL";
  if (unit === "l") unit = "L";
  if (unit === "ul" || unit === "µl" || unit === "μl") unit = "µL";

  return { value, unit };
}

export class UnitValue {
  value: number;
  unit: string;

  constructor(value: number, unit: string = "") {
    this.value = value;
    this.unit = unit;
  }

  get dimension(): string {
    return getDimension(this.unit);
  }

  toNumber(): number {
    return this.value;
  }

  format(): string {
    return `${formatNumber(this.value)}${this.unit.replace(/^Δ/, "")}`;
  }

  toString(): string {
    return this.format();
  }
}

export function isUnitValue(v: unknown): v is UnitValue {
  return v instanceof UnitValue;
}

export function asNumber(v: any): number {
  if (isUnitValue(v)) return v.value;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }
  if (v && typeof v === "object" && typeof v.mass === "number") {
    return v.mass;
  }
  return Number(v) || 0;
}

function convertUnits(value: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return value;

  const from = getUnitInfo(fromUnit);
  const to = getUnitInfo(toUnit);

  if (from.dimension !== to.dimension) return value;

  if (from.dimension === "temperature") {
    const base = value * from.factor + (from.offset ?? 0);
    return (base - (to.offset ?? 0)) / to.factor;
  }

  return (value * from.factor) / to.factor;
}

function sameDimension(a: UnitValue, b: UnitValue): boolean {
  const da = getDimension(a.unit);
  const db = getDimension(b.unit);
  return da === db && da !== "unknown";
}

export function unitAdd(a: any, b: any): any {
  if (isUnitValue(a) && isUnitValue(b)) {
    if (sameDimension(a, b)) {
      const bv = convertUnits(b.value, b.unit, a.unit);
      return new UnitValue(a.value + bv, a.unit);
    }

    if (!a.unit) return new UnitValue(a.value + b.value, b.unit);
    if (!b.unit) return new UnitValue(a.value + b.value, a.unit);

    return new UnitValue(a.value + b.value, a.unit || b.unit);
  }

  if (isUnitValue(a)) return new UnitValue(a.value + asNumber(b), a.unit);
  if (isUnitValue(b)) return new UnitValue(asNumber(a) + b.value, b.unit);

  return asNumber(a) + asNumber(b);
}

export function unitSubtract(a: any, b: any): any {
  if (isUnitValue(a) && isUnitValue(b)) {
    const da = getDimension(a.unit);
    const db = getDimension(b.unit);

    if (da === "temperature" && db === "temperature") {
      if (a.unit === b.unit) {
        return new UnitValue(a.value - b.value, `Δ${a.unit}`);
      }

      const ak = convertUnits(a.value, a.unit, "K");
      const bk = convertUnits(b.value, b.unit, "K");
      return new UnitValue(ak - bk, "ΔK");
    }

    if (sameDimension(a, b)) {
      const bv = convertUnits(b.value, b.unit, a.unit);
      return new UnitValue(a.value - bv, a.unit);
    }

    if (!a.unit) return new UnitValue(a.value - b.value, b.unit);
    if (!b.unit) return new UnitValue(a.value - b.value, a.unit);

    return new UnitValue(a.value - b.value, a.unit || b.unit);
  }

  if (isUnitValue(a)) return new UnitValue(a.value - asNumber(b), a.unit);
  if (isUnitValue(b)) return new UnitValue(asNumber(a) - b.value, b.unit);

  return asNumber(a) - asNumber(b);
}

export function unitMultiply(a: any, b: any): any {
  if (isUnitValue(a) && isUnitValue(b)) {
    if (!a.unit) return new UnitValue(a.value * b.value, b.unit);
    if (!b.unit) return new UnitValue(a.value * b.value, a.unit);
    return new UnitValue(a.value * b.value, a.unit || b.unit);
  }

  if (isUnitValue(a)) return new UnitValue(a.value * asNumber(b), a.unit);
  if (isUnitValue(b)) return new UnitValue(asNumber(a) * b.value, b.unit);

  return asNumber(a) * asNumber(b);
}

export function unitDivide(a: any, b: any): any {
  if (isUnitValue(a) && isUnitValue(b)) {
    if (sameDimension(a, b)) {
      const bv = convertUnits(b.value, b.unit, a.unit);
      return a.value / bv;
    }

    if (!a.unit) return new UnitValue(a.value / b.value, b.unit);
    if (!b.unit) return new UnitValue(a.value / b.value, a.unit);

    return new UnitValue(a.value / b.value, a.unit || b.unit);
  }

  if (isUnitValue(a)) return new UnitValue(a.value / asNumber(b), a.unit);
  if (isUnitValue(b)) return asNumber(a) / b.value;

  return asNumber(a) / asNumber(b);
}

export function unitPow(base: any, exponent: any): any {
  const b = asNumber(base);
  const e = asNumber(exponent);
  return Math.pow(b, e);
}

export function approxEqual(a: any, b: any, epsilon = 1e-9): boolean {
  return Math.abs(asNumber(a) - asNumber(b)) <= epsilon;
}

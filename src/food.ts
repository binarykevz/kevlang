import { PROCESS_SYMBOLS } from "./symbols.js";

export class FoodProcess {
  symbol: string;
  label: string;

  constructor(symbol: string, label: string) {
    this.symbol = symbol;
    this.label = label;
  }

  toString(): string {
    return this.symbol;
  }
}

export class GenericStep {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  toString(): string {
    return this.name;
  }
}

export function getProcessSymbol(name: string): FoodProcess | undefined {
  const label = PROCESS_SYMBOLS[name];
  if (!label) return undefined;
  return new FoodProcess(name, label);
}

export function isProcessSymbol(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROCESS_SYMBOLS, name);
}

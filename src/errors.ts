export class KevError extends Error {
  kind?: string;
  line?: number;
  column?: number;
  expected?: string;
  received?: string;
  symbol?: string;
  suggestions?: string[];
  sourceLine?: string;

  constructor(message: string, info: Partial<KevError> = {}) {
    super(message);
    this.name = "KevError";
    Object.assign(this, info);
  }
}

export function formatKevError(err: unknown, source?: string): string {
  if (!(err instanceof KevError)) {
    const msg = err instanceof Error ? err.message : String(err);
    return `⚠ ${msg}\n\n∴ Reaction aborted.`;
  }

  const e = err;

  if (e.kind === "unknown-symbol") {
    const suggestions =
      e.suggestions && e.suggestions.length > 0
        ? `\nPossible symbols:\n${e.suggestions.join(" ")}`
        : "";

    return [
      `⚠ Unknown molecular symbol: ${e.symbol ?? "?"}`,
      suggestions,
      "",
      "∴ Reaction aborted."
    ]
      .filter(Boolean)
      .join("\n");
  }

  const sourceLines = source?.split(/\r?\n/);
  const sourceLine =
    e.sourceLine ??
    (e.line && sourceLines ? sourceLines[e.line - 1] : undefined);

  const parts: string[] = [];
  parts.push("⚠ ⚗ REACTION ERROR");
  parts.push("");
  parts.push(`Line ${e.line ?? "?"}:`);
  if (sourceLine !== undefined) parts.push(sourceLine.trim());

  if (e.expected) {
    parts.push("");
    parts.push("Expected:");
    parts.push(e.expected);
  }

  if (e.received) {
    parts.push("");
    parts.push("Received:");
    parts.push(e.received);
  }

  parts.push("");
  parts.push("∴ Reaction aborted.");

  return parts.join("\n");
}

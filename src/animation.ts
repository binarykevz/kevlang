export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function isTTY(): boolean {
  return Boolean(process.stdout?.isTTY);
}

function writeRaw(text: string): void {
  if (process.stdout?.write) {
    process.stdout.write(text);
  } else {
    console.log(text);
  }
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function progressBar(percent: number, width = 20): string {
  const filled = Math.max(0, Math.min(width, Math.round((width * percent) / 100)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export async function animateLine(
  text: string,
  log?: (line: string) => void
): Promise<void> {
  if (!isTTY()) {
    if (log) log(text);
    else console.log(text);
    return;
  }

  for (const ch of text) {
    writeRaw(ch);
    await sleep(4);
  }

  writeRaw("\n");
}

export async function animateSpinner(
  text: string,
  duration = 160
): Promise<void> {
  if (!isTTY()) {
    console.log(text);
    return;
  }

  const frameTime = Math.max(8, Math.floor(duration / SPINNER_FRAMES.length));

  for (const frame of SPINNER_FRAMES) {
    writeRaw(`\r${text} ${frame}`);
    await sleep(frameTime);
  }

  writeRaw(`\r${text} ✓\n`);
}

export async function animateProgress(
  text: string,
  duration = 180
): Promise<void> {
  if (!isTTY()) {
    console.log(text);
    return;
  }

  const steps = 5;
  const stepTime = Math.max(10, Math.floor(duration / steps));

  for (let i = 0; i <= steps; i++) {
    const percent = Math.round((100 * i) / steps);
    writeRaw(`\r   ${progressBar(percent)} ${percent}% ${text}`);
    await sleep(stepTime);
  }

  writeRaw("\n");
}

export async function animateProcess(
  steps: string[],
  operators: string[],
  log: (line: string) => void
): Promise<void> {
  log("⟦ PROCESS ⟧");

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    if (step.includes("⚙")) {
      await animateProgress(step, 150);
    } else if (step.includes("🔥") || step.includes("❄")) {
      await animateSpinner(step, 150);
    } else {
      await animateLine(step, log);
    }

    if (i < steps.length - 1) {
      log(`   ${operators[i] ?? "→"}`);
    }
  }

  log(`∴ ${steps[steps.length - 1]}`);
}

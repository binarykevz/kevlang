#!/usr/bin/env bun
import {
  compile,
  parse,
  Runtime,
  formatValue,
  formatKevError,
  VERSION
} from "./index.js";
import { animateLine, sleep } from "./animation.js";

async function readFileText(path: string): Promise<string> {
  const g = globalThis as any;

  if (g.Bun?.file) {
    return await g.Bun.file(path).text();
  }

  const { readFile } = await import("node:fs/promises");
  return await readFile(path, "utf8");
}

async function writeFileText(path: string, text: string): Promise<void> {
  const g = globalThis as any;

  if (g.Bun?.write) {
    await g.Bun.write(path, text);
    return;
  }

  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, text, "utf8");
}

async function exists(path: string): Promise<boolean> {
  try {
    const g = globalThis as any;

    if (g.Bun?.file) {
      return Boolean(await g.Bun.file(path).exists());
    }

    const { access } = await import("node:fs/promises");
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function help(): void {
  console.log(`
⚗ KevLang ${VERSION}

Usage:
  kev <command> [options]

Commands:
  run <file.kev>        Run a KevLang experiment
  build <file.kev>      Compile .kev to JavaScript output
  compile <file.kev>    Print compiled JavaScript
  check <file.kev>      Parse and validate syntax
  init                  Create a sample .kev file
  repl                  Start interactive KevLang REPL

Options:
  --no-animation        Disable terminal animation
  --version             Show version
  --help                Show help
`);
}

async function showIntro(): Promise<void> {
  console.log(`⚗ KevLang ${VERSION}`);
  console.log("");
  await animateLine("⟦ INIT ⟧");
  await animateLine("   ↓");
  await animateLine("⚛ Loading molecular environment...");
  await animateLine("   ↓");
  await animateLine("🧪 Parsing reaction...");
  await sleep(25);
}

async function runFile(file: string | undefined, flags: string[]): Promise<void> {
  if (!file) {
    console.error("⚠ Missing file. Usage: kev run <file.kev>");
    process.exitCode = 1;
    return;
  }

  const source = await readFileText(file);
  const animation = !flags.includes("--no-animation");

  try {
    if (animation) {
      await showIntro();
    }

    const runtime = new Runtime({
      animation,
      print: (line) => console.log(line)
    });

    await runtime.execute(source);

    if (animation && !runtime.backend.started) {
      console.log("");
      console.log("✓ Reaction complete");
    }
    if (runtime.backend.started) {
      // Keep the CLI process alive so the HTTP server doesn't shut down
      await new Promise(() => {});
    }
  } catch (err) {
    console.error(formatKevError(err, source));
    process.exitCode = 1;
  }
}

async function compileFile(file: string | undefined): Promise<void> {
  if (!file) {
    console.error("⚠ Missing file. Usage: kev compile <file.kev>");
    process.exitCode = 1;
    return;
  }

  const source = await readFileText(file);
  console.log(compile(source));
}

async function buildFile(file: string | undefined): Promise<void> {
  if (!file) {
    console.error("⚠ Missing file. Usage: kev build <file.kev>");
    process.exitCode = 1;
    return;
  }

  const source = await readFileText(file);
  const js = compile(source);

  const outFile = file.endsWith(".kev")
    ? file.slice(0, -4) + ".kev.js"
    : file + ".js";

  await writeFileText(outFile, js);
  console.log(`✓ Built ${outFile}`);
}

async function checkFile(file: string | undefined): Promise<void> {
  if (!file) {
    console.error("⚠ Missing file. Usage: kev check <file.kev>");
    process.exitCode = 1;
    return;
  }

  const source = await readFileText(file);

  try {
    parse(source);
    console.log(`✓ No syntax issues in ${file}`);
  } catch (err) {
    console.error(formatKevError(err, source));
    process.exitCode = 1;
  }
}

async function initProject(): Promise<void> {
  const file = "hello.kev";

  if (await exists(file)) {
    console.log(`⚠ ${file} already exists.`);
    return;
  }

  const sample = `🧪 → "Hello, Chemistry!"\n`;
  await writeFileText(file, sample);
  console.log(`✓ Created ${file}`);
}

async function startRepl(): Promise<void> {
  const runtime = new Runtime({ animation: false });

  console.log(`⚗ KevLang ${VERSION} REPL`);
  console.log("Type .exit to quit.");
  console.log("");

  const prompt = () => process.stdout.write("kev> ");

  let buffer = "";

  const onData = async (chunk: any) => {
    const text =
      typeof chunk === "string"
        ? chunk
        : new TextDecoder().decode(chunk);

    buffer += text;

    let idx: number;

    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);

      if (line === ".exit") {
        process.exit(0);
      }

      if (!line) {
        continue;
      }

      try {
        const result = await runtime.execute(line);

        if (result.outputs.length > 0) {
          for (const out of result.outputs) {
            console.log(out);
          }
        } else if (result.lastResult !== undefined) {
          console.log(formatValue(result.lastResult));
        }
      } catch (err) {
        console.error(formatKevError(err, line));
      }
    }

    prompt();
  };

  prompt();

  process.stdin.setEncoding?.("utf8");
  process.stdin.on?.("data", onData);
  process.stdin.resume?.();
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  const flags = argv.filter((a: string) => a.startsWith("--"));
  const positional = argv.filter((a: string) => !a.startsWith("--"));

  if (flags.includes("--version")) {
    console.log(VERSION);
    return;
  }

  if (flags.includes("--help") || positional.length === 0) {
    help();
    return;
  }

  const command = positional[0];
  const file = positional[1];

  switch (command) {
    case "run":
      await runFile(file, flags);
      break;

    case "compile":
      await compileFile(file);
      break;

    case "build":
      await buildFile(file);
      break;

    case "check":
      await checkFile(file);
      break;

    case "init":
      await initProject();
      break;

    case "repl":
      await startRepl();
      break;

    default:
      console.error(`⚠ Unknown command: ${command}`);
      help();
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(formatKevError(err));
  process.exitCode = 1;
});

import { createInterface, type Interface } from "node:readline";

const CTRL_C = String.fromCharCode(3);
const BACKSPACE = String.fromCharCode(8);
const DELETE = String.fromCharCode(127);

// A single shared readline interface + async line iterator, reused
// across every plain prompt() call in one CLI invocation.
//
// Earlier version of this file called `rl.question()` fresh for each
// prompt. That works fine interactively, but over piped stdin (e.g.
// `printf "a\nb\n" | agent creds set ...`, and any future scripted/
// test use) the SECOND `question()` call on piped input can silently
// never fire its callback — readline's classic question/callback API
// doesn't reliably continue reading a piped stream across repeated
// calls once it's mid-stream. Verified with a minimal repro: a second
// `rl.question()` over the same piped stdin hung forever, while
// pulling from `rl[Symbol.asyncIterator]()` read every line
// correctly. Since nothing else was keeping the event loop alive, the
// real CLI didn't even hang — it just exited silently with nothing
// stored, which is a much worse failure mode than an obvious hang.
let sharedInterface: Interface | undefined;
let lineIterator: AsyncIterator<string> | undefined;

function getLineIterator(): AsyncIterator<string> {
  if (!sharedInterface) {
    sharedInterface = createInterface({ input: process.stdin });
  }
  if (!lineIterator) {
    lineIterator = sharedInterface[Symbol.asyncIterator]();
  }
  return lineIterator;
}

/** Must be called once the CLI is done prompting, so the process can exit. */
export function closePromptInterface(): void {
  sharedInterface?.close();
  sharedInterface = undefined;
  lineIterator = undefined;
}

export async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  const { value, done } = await getLineIterator().next();
  if (done || value === undefined) {
    throw new Error("unexpected end of input while waiting for a response");
  }
  return value.trim();
}

/**
 * Reads a line from stdin without echoing it back to the terminal —
 * used for passwords/card digits so they never appear on screen or in
 * a terminal scrollback buffer. Control characters are compared via
 * String.fromCharCode rather than literal escapes, so this file stays
 * plain, unambiguous ASCII.
 */
export function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;

  if (!stdin.isTTY) {
    // Non-interactive stdin (e.g. piped input in tests) — fall back
    // to the shared line reader; raw-mode masking requires a real TTY.
    return prompt(question);
  }

  return new Promise((resolve, reject) => {
    process.stdout.write(question);

    const wasRaw = stdin.isRaw;
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\n" || char === "\r") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === CTRL_C) {
          cleanup();
          reject(new Error("aborted"));
          return;
        }
        if (char === BACKSPACE || char === DELETE) {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };

    const cleanup = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(wasRaw ?? false);
      stdin.pause();
    };

    stdin.on("data", onData);
  });
}

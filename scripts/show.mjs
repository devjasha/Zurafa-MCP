#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import net from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { SVG } from "@mathjax/src/js/output/svg.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import "@mathjax/src/js/input/tex/base/BaseConfiguration.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js";
import "@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js";
import "@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js";
import "@mathjax/src/js/input/tex/color/ColorConfiguration.js";
import "@mathjax/src/js/input/tex/cancel/CancelConfiguration.js";

// MathJax loads glyphs outside basic Latin (e.g. ä) lazily from font files.
mathjax.asyncLoad = (name) => import(name);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  return `Usage: node scripts/show.mjs <math|mermaid|html> [options]\n\nInput (choose one):\n  --input FILE          Read source from FILE\n  --text TEXT           Read source from this argument\n  stdin                 Read source from stdin\n\nOptions:\n  --output FILE         Output path (.svg for math, .png for Mermaid, .html for html) (default: a stable temp path)\n  -s, --session TARGET  Zurafa session ID, label, position, or ID suffix\n  -b, --pane TARGET     Zurafa pane ID, position, or ID suffix\n  --no-open             Render without opening Zurafa Preview\n  -h, --help            Show this help`;
}

export function parseArgs(argv) {
  if (argv[0] === "-h" || argv[0] === "--help") return { help: true, open: true };
  const options = { kind: argv[0], open: true };
  const valued = new Map([
    ["--input", "input"],
    ["--text", "text"],
    ["--output", "output"],
    ["-s", "session"],
    ["--session", "session"],
    ["-b", "pane"],
    ["--pane", "pane"],
    ["--block", "pane"],
  ]);
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--no-open") options.open = false;
    else if (arg === "-h" || arg === "--help") options.help = true;
    else if (valued.has(arg)) {
      if (argv[i + 1] === undefined) throw new Error(`${arg} requires a value`);
      options[valued.get(arg)] = argv[++i];
    } else throw new Error(`unknown option: ${arg}`);
  }
  if (!options.help && !["math", "mermaid", "html"].includes(options.kind)) {
    throw new Error("the first argument must be math, mermaid, or html");
  }
  if ([options.input, options.text].filter((value) => value !== undefined).length > 1) {
    throw new Error("use only one of --input or --text");
  }
  return options;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function sourceFor(options) {
  if (options.input) return readFile(resolve(options.input), "utf8");
  if (options.text !== undefined) return options.text;
  if (process.stdin.isTTY) throw new Error("provide --input, --text, or pipe source on stdin");
  return readStdin();
}

function outputFor(kind, source, requested) {
  if (requested) return resolve(requested);
  const digest = createHash("sha256").update(`${kind}\0${source}`).digest("hex").slice(0, 12);
  return join(tmpdir(), "zurafa-preview", `${kind}-${digest}.${{ mermaid: "png", html: "html" }[kind] ?? "svg"}`);
}

export async function renderMath(source, output) {
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const svgJax = new SVG({ fontCache: "local" });
  const html = mathjax.document("", {
    InputJax: new TeX({
      packages: ["base", "ams", "newcommand", "boldsymbol", "mathtools", "color", "cancel"],
      // Fail loudly; MathJax otherwise draws the error as a filled box that looks like a blank preview.
      formatError: (_jax, error) => { throw new Error(`TeX error: ${error.message}`); },
    }),
    OutputJax: svgJax,
  });
  const node = await html.convertPromise(source, { display: true });
  let svg = adaptor.innerHTML(node);
  if (!/<svg[^>]+xmlns=/.test(svg)) svg = svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  svg = svg.replace('style="', 'style="background-color:white;color:#111;');
  // Table rules and similar strokes get their width from MathJax's stylesheet, which a standalone file lacks.
  svg = svg.replace(/(<svg[^>]*>)/, `$1<style>${adaptor.textContent(svgJax.styleSheet(html))}</style>`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`);
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { ...options, stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({
      code,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
    if (options.input !== undefined) child.stdin.end(options.input);
  });
}

export async function renderMermaid(source, output) {
  const executable = join(root, "node_modules", ".bin", process.platform === "win32" ? "mmdc.cmd" : "mmdc");
  if (!existsSync(executable)) throw new Error("Mermaid renderer is missing; run npm install in the plugin directory");
  await mkdir(dirname(output), { recursive: true });
  const result = await run(executable, ["--input", "-", "--output", output, "--backgroundColor", "white", "--scale", "3"], { input: source });
  if (result.code !== 0) throw new Error(result.stderr.trim() || `mmdc exited with status ${result.code}`);
}

// Zurafa's web preview is offline and can only read the page's folder, so its scripts are copied beside it.
export async function writeHTML(source, output) {
  const dir = dirname(output);
  await mkdir(dir, { recursive: true });
  await writeFile(output, source);
  await copyFile(join(root, "assets", "zurafa.js"), join(dir, "zurafa.js"));
  const mermaid = join(root, "node_modules", "mermaid", "dist", "mermaid.min.js");
  if (existsSync(mermaid)) await copyFile(mermaid, join(dir, "mermaid.min.js"));
}

function targetMatches(target, position, id, label) {
  return target === id
    || (label !== undefined && label.toLowerCase() === target.toLowerCase())
    || Number(target) === position
    || (target.length >= 4 && id.endsWith(target));
}

function exactlyOne(values, kind, target) {
  if (values.length === 1) return values[0];
  if (values.length === 0) throw new Error(`${kind} target ${JSON.stringify(target)} was not found`);
  throw new Error(`${kind} target ${JSON.stringify(target)} is ambiguous`);
}

export function resolvePreviewTarget(snapshot, requestedSession, requestedPane, env = process.env) {
  const sessionTarget = requestedSession || env.ZURAFA_SESSION || "default";
  const sessions = Object.values(snapshot.sessions || {});
  const session = exactlyOne(
    sessions.filter((candidate, index) => targetMatches(sessionTarget, index + 1, candidate.session_id, candidate.label)),
    "session",
    sessionTarget,
  );
  let paneTarget = requestedPane || env.ZURAFA_PANE || env.ZURAFA_BLOCK;
  if (!paneTarget) {
    const active = (session.windows || []).find((window) => window.window_id === session.active_window);
    paneTarget = active?.selected_block;
  }
  if (!paneTarget) throw new Error("session has no open pane");
  const panes = Object.entries(session.blocks || {});
  const [pane] = exactlyOne(
    panes.filter(([id], index) => targetMatches(paneTarget, index + 1, id)),
    "pane",
    paneTarget,
  );
  return { session: session.session_id, pane };
}

class FramedClient {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    socket.on("data", (chunk) => this.onData(chunk));
    socket.on("error", (error) => this.rejectAll(error));
    socket.on("close", () => this.rejectAll(new Error("Zurafa daemon closed the connection")));
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32BE(0);
      if (length > 16 * 1024 * 1024) return this.rejectAll(new Error("Zurafa sent an oversized frame"));
      if (this.buffer.length < length + 4) return;
      const body = this.buffer.subarray(4, length + 4);
      this.buffer = this.buffer.subarray(length + 4);
      let message;
      try { message = JSON.parse(body.toString("utf8")); }
      catch { return this.rejectAll(new Error("Zurafa sent invalid JSON")); }
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        if (message.type === "error") pending.reject(new Error(message.message || "Zurafa operation failed"));
        else pending.resolve(message);
      }
    }
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  request(message) {
    return new Promise((resolvePromise, reject) => {
      this.pending.set(message.id, { resolve: resolvePromise, reject });
      const body = Buffer.from(JSON.stringify(message));
      const header = Buffer.alloc(4);
      header.writeUInt32BE(body.length);
      this.socket.write(Buffer.concat([header, body]));
    });
  }
}

function connect(socketPath) {
  return new Promise((resolvePromise, reject) => {
    const socket = net.createConnection(socketPath);
    socket.once("connect", () => resolvePromise(socket));
    socket.once("error", reject);
  });
}

export async function openViaIpc(path, options = {}) {
  const socketPath = options.socket || process.env.ZURAFA_SOCKET || join(homedir(), "Library", "Application Support", "Zurafa", "daemon.sock");
  const socket = await connect(socketPath);
  const client = new FramedClient(socket);
  try {
    await client.request({ id: 1, type: "hello", protocol: 2 });
    const snapshotReply = await client.request({ id: 2, type: "events.snapshot" });
    const target = resolvePreviewTarget(snapshotReply.snapshot || snapshotReply, options.session, options.pane, options.env);
    await client.request({ id: 3, type: "layout.preview", session: target.session, block: target.pane, path });
  } catch (error) {
    if (/unknown|unsupported|invalid.*type/i.test(error.message)) {
      throw new Error("This Zurafa daemon does not support Preview automation; install a build containing layout.preview");
    }
    throw error;
  } finally {
    socket.end();
  }
}

export async function openPreview(path, options = {}) {
  const canonicalPath = await realpath(path);
  const args = ["preview"];
  if (options.session) args.push("--session", options.session);
  if (options.pane) args.push("--pane", options.pane);
  args.push(canonicalPath);
  let result;
  try { result = await run("zurafa", args); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    return openViaIpc(canonicalPath, options);
  }
  if (result.code === 0) return;
  if (result.code === 2 && /unknown command.*preview/i.test(result.stderr)) {
    return openViaIpc(canonicalPath, options);
  }
  throw new Error(result.stderr.trim() || `zurafa preview exited with status ${result.code}`);
}

export async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const source = (await sourceFor(options)).trim();
  if (!source) throw new Error("source is empty");
  const output = outputFor(options.kind, source, options.output);
  if (options.kind === "math") await renderMath(source, output);
  else if (options.kind === "html") await writeHTML(source, output);
  else await renderMermaid(source, output);
  console.log(output);
  if (options.open) await openPreview(output, options);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`zurafa-preview: ${error.message}`);
    process.exitCode = 1;
  });
}

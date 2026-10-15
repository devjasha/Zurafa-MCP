import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  openViaIpc,
  parseArgs,
  renderMath,
  renderMermaid,
  resolvePreviewTarget,
  writeHTML,
} from "../scripts/show.mjs";

const snapshot = {
  sessions: {
    default: {
      session_id: "default",
      label: "Workspace",
      active_window: "w1",
      windows: [{ window_id: "w1", selected_block: "pane-abcd" }],
      blocks: { "pane-abcd": {}, "pane-efgh": {} },
    },
  },
};

test("parses renderer and pane options", () => {
  assert.deepEqual(parseArgs(["math", "--text", "x", "--pane", "abcd", "--no-open"]), {
    kind: "math",
    text: "x",
    pane: "abcd",
    open: false,
  });
  assert.deepEqual(parseArgs(["--help"]), { help: true, open: true });
});

test("resolves the current or explicitly targeted pane", () => {
  assert.deepEqual(resolvePreviewTarget(snapshot, undefined, undefined, {}), {
    session: "default",
    pane: "pane-abcd",
  });
  assert.deepEqual(resolvePreviewTarget(snapshot, "Workspace", "efgh", {}), {
    session: "default",
    pane: "pane-efgh",
  });
});

test("renders TeX to SVG", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "zurafa-preview-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, "formula.svg");
  await renderMath("E = mc^2", output);
  const svg = await readFile(output, "utf8");
  assert.match(svg, /<svg/);
  assert.match(svg, /data-mml-node="msup"/);
});

test("writes HTML with its helper scripts beside it", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "zurafa-preview-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeHTML("<p data-explain=\"Why?\">x</p>", join(directory, "page.html"));
  assert.match(await readFile(join(directory, "page.html"), "utf8"), /data-explain/);
  assert.match(await readFile(join(directory, "zurafa.js"), "utf8"), /messageHandlers/);
  assert.match(await readFile(join(directory, "mermaid.min.js"), "utf8"), /mermaid/);
});

test("renders Mermaid to PNG", { timeout: 30_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "zurafa-preview-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, "diagram.png");
  await renderMermaid("flowchart LR\n  A --> B\n", output);
  const png = await readFile(output);
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

function frame(message) {
  const body = Buffer.from(JSON.stringify(message));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}

test("opens a preview through protocol 2 IPC", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "zurafa-preview-ipc-"));
  const socketPath = join(directory, "daemon.sock");
  const requests = [];
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE(0);
        if (buffer.length < length + 4) return;
        const request = JSON.parse(buffer.subarray(4, length + 4).toString("utf8"));
        buffer = buffer.subarray(length + 4);
        requests.push(request);
        if (request.type === "hello") socket.write(frame({ id: request.id, type: "hello_ok", protocol: 2 }));
        else if (request.type === "events.snapshot") socket.write(frame({ id: request.id, type: "events.snapshot", snapshot }));
        else socket.write(frame({ id: request.id, type: "ok" }));
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });

  await openViaIpc(import.meta.filename, { socket: socketPath, env: {} });
  assert.deepEqual(requests.at(-1), {
    id: 3,
    type: "layout.preview",
    session: "default",
    block: "pane-abcd",
    path: import.meta.filename,
  });
});

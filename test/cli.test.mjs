import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));

test("serve command rejects non-loopback hosts", async () => {
  const result = await new Promise((resolve) => {
    execFile(process.execPath, [cli, "serve", "--host", "0.0.0.0"], (error, stdout, stderr) => {
      resolve({ code: error?.code, stdout, stderr });
    });
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /127\.0\.0\.1/);
});

test("serve survives malformed URLs and failed asset reads, continuing to serve snapshots", { timeout: 5_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "matt-cli-"));
  await mkdir(join(root, ".scratch"));
  await cp(new URL("../src", import.meta.url), join(root, "src"), { recursive: true });
  const child = spawn(process.execPath, [join(root, "src", "cli.mjs"), "serve"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, "exit"); }
    await rm(root, { recursive: true, force: true });
  });
  const [output] = await once(child.stdout, "data");
  const url = output.toString().match(/http:\/\/\S+/)[0];
  const status = await new Promise((resolve, reject) => {
    const req = request(new URL(url), { path: "http://[" }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(status, 400);
  await rm(join(root, "src", "public", "app.css"));
  assert.equal((await fetch(`${url}app.css`)).status, 500);
  assert.equal((await fetch(`${url}api/snapshot`)).status, 200);
});

test("serve exits after a port conflict without leaving its file watcher alive", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "matt-cli-"));
  await mkdir(join(root, ".scratch"));
  const occupied = createServer();
  occupied.listen(0, "127.0.0.1");
  await once(occupied, "listening");
  t.after(async () => {
    await new Promise((resolve) => occupied.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  const result = await new Promise((resolve) => {
    execFile(process.execPath, [cli, "serve", "--port", String(occupied.address().port)], { cwd: root, timeout: 2_000 }, (error, stdout, stderr) => {
      resolve({ code: error?.code, killed: error?.killed, stderr });
    });
  });
  assert.equal(result.killed, false);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /EADDRINUSE/);
});

test("serve survives docs becoming a file and watches its replacement directory", { timeout: 5_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "matt-cli-"));
  await mkdir(join(root, ".scratch"));
  const child = spawn(process.execPath, [cli, "serve"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  const controller = new AbortController();
  t.after(async () => {
    controller.abort();
    if (child.exitCode === null) { child.kill(); await once(child, "exit"); }
    await rm(root, { recursive: true, force: true });
  });
  const [output] = await once(child.stdout, "data");
  const url = output.toString().match(/http:\/\/\S+/)[0];
  await writeFile(join(root, "docs"), "documentation");
  await new Promise((resolve) => setTimeout(resolve, 200));
  const page = await fetch(url);
  assert.equal(page.status, 200);
  await page.text();
  await rm(join(root, "docs"));
  await mkdir(join(root, "docs", "architecture"), { recursive: true });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const events = await fetch(`${url}events`, { signal: controller.signal });
  const reader = events.body.getReader();
  await reader.read();
  await writeFile(join(root, "docs", "architecture", "system.architecture.json"), JSON.stringify({ components: [] }));
  const event = await reader.read();
  assert.match(new TextDecoder().decode(event.value), /event: refresh/);
  const snapshot = await fetch(`${url}api/snapshot`);
  assert.equal(snapshot.status, 200);
  await snapshot.json();
});

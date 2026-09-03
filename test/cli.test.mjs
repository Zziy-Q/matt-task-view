import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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

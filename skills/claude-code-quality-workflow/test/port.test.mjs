import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test } from "node:test";
import { join } from "node:path";
import { ok, run, scripts } from "./helpers.mjs";

const portScript = join(scripts, "free-port.mjs");

function occupy(host) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => resolve(server));
  });
}

test("returns the preferred port when it is free", async () => {
  const server = await occupy("127.0.0.1");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  assert.equal(Number(ok("node", [portScript, String(port)])), port);
});

for (const host of ["127.0.0.1", "0.0.0.0"]) {
  test(`returns another usable port when the preferred port is occupied on ${host}`, async () => {
    const server = await occupy(host);
    try {
      const { port } = server.address();
      const chosen = Number(ok("node", [portScript, String(port)]));
      assert.notEqual(chosen, port);
      assert.ok(chosen > port && chosen < 65536);
      const probe = createServer();
      await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(chosen, "127.0.0.1", resolve); });
      await new Promise((resolve) => probe.close(resolve));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
}

test("returns some free port with no preference, and rejects nonsense", () => {
  assert.ok(Number(ok("node", [portScript])) > 0);
  assert.equal(run("node", [portScript, "http"]).status, 1);
});

#!/usr/bin/env node
// Prints a TCP port that is free right now: the preferred port when nothing is
// listening on it, otherwise the next free port above it.
//
//   free-port.mjs [preferred-port]     e.g. PORT=$(node free-port.mjs 3000)
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

function listens(port, host) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", (error) => resolve(error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT" ? 0 : -1));
    server.listen({ port, host, exclusive: true }, () => {
      const { port: bound } = server.address();
      server.close(() => resolve(bound));
    });
  });
}

// A dev server may bind IPv4, IPv6 or both, so a port counts as free only when
// every address family that exists on this machine accepts it.
async function isFree(port) {
  for (const host of ["127.0.0.1", "::1", "0.0.0.0"]) if ((await listens(port, host)) === -1) return false;
  return true;
}

export async function freePort(preferred = 0) {
  if (preferred) {
    for (let port = preferred; port < Math.min(preferred + 100, 65536); port += 1) if (await isFree(port)) return port;
  }
  return listens(0, "127.0.0.1");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const preferred = Number(process.argv[2] ?? 0);
  if (!Number.isInteger(preferred) || preferred < 0 || preferred > 65535) {
    console.error("usage: free-port.mjs [preferred-port]");
    process.exit(1);
  }
  console.log(await freePort(preferred));
}

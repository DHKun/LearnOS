import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

const mode = process.argv[2] === "start" ? "start" : "dev";
const host = process.env.APP_BIND_HOST || "0.0.0.0";
const port = process.env.APP_PORT || "3000";
const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

const args = [nextBin, mode, "-H", host, "-p", port];
if (mode === "dev") args.push("--turbopack");

console.log(`[learnos] starting next ${mode} on ${host}:${port}`);

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

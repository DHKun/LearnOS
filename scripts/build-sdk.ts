import { mkdir } from "node:fs/promises";

import { build } from "esbuild";

async function main() {
  await mkdir("packages/learning-sdk/dist", { recursive: true });
  await build({
    entryPoints: ["packages/learning-sdk/src/index.ts"],
    bundle: true,
    format: "iife",
    globalName: "LearnOSBundle",
    platform: "browser",
    target: ["es2020"],
    outfile: "packages/learning-sdk/dist/learning-sdk.js",
    legalComments: "none",
    minify: true,
    logLevel: "info",
  });
  console.log("Learning SDK built → packages/learning-sdk/dist/learning-sdk.js");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

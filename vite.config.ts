import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Stamp the service worker cache name so each build invalidates old caches. */
function stampServiceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "stamp-sw",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const file = join(outDir, "sw.js");
      const stamp = process.env.GITHUB_SHA?.slice(0, 8) ?? String(Date.now());
      // Precache every built file so the very first visit works offline too.
      const assets = (readdirSync(outDir, { recursive: true }) as string[])
        .map((f) => f.replaceAll("\\", "/"))
        .filter((f) => f !== "sw.js" && !f.endsWith(".map") && /\.\w+$/.test(f))
        .map((f) => `./${f}`);
      const src = readFileSync(file, "utf8")
        .replace("__BUILD__", stamp)
        .replace("__ASSETS__", JSON.stringify(assets));
      writeFileSync(file, src);
    },
  };
}

export default defineConfig({
  // Relative base: works on GitHub Pages sub-paths and inside the Android WebView.
  base: "./",
  plugins: [stampServiceWorker()],
  server: { host: true, port: 3000 },
  test: { environment: "node" },
});

import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", core: "src/core.ts" },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["react"],
});

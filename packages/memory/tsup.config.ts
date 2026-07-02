import { defineConfig, type Options } from "tsup";

export default defineConfig((options: Options) => ({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: !options.watch,
  clean: true,
  sourcemap: true,
}));

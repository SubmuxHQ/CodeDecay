import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  bundle: true,
  sourcemap: true,
  target: "node20",
  tsconfig: "../../tsconfig.base.json",
  external: ["yaml"],
  banner: {
    js: "#!/usr/bin/env node"
  },
  noExternal: [/^@submuxhq\/codedecay-/]
});

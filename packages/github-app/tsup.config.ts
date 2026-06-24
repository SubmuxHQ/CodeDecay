import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/server.ts"],
  format: ["esm"],
  clean: true,
  bundle: true,
  target: "node20",
  tsconfig: "../../tsconfig.base.json",
  external: ["probot"],
  noExternal: [/^@submuxhq\/codedecay-/]
});

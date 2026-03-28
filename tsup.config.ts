import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin.ts"],
  format: ["esm"],
  noExternal: ["@objekt/shared"],
  external: ["graphql"],
  splitting: false,
});

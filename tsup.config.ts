import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin.ts"],
  format: ["esm"],
  noExternal: ["@objekt/shared", "@objekt.sh/ecies"],
  external: ["graphql"],
  splitting: false,
});

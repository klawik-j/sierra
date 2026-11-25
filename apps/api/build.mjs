import { build } from "esbuild";

// Bundle the API (incl. workspace packages) into dist/; npm dependencies stay external.
await build({
  entryPoints: ["src/index.ts", "src/db/migrate-cli.ts", "src/db/seed.ts"],
  outdir: "dist",
  outbase: "src",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  plugins: [
    {
      name: "externalize-deps",
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) => (args.path.startsWith("@sierra/") ? undefined : { path: args.path, external: true }));
      },
    },
  ],
});
console.log("API built to dist/");

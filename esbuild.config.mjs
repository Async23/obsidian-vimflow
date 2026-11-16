import { context } from "esbuild";

const build = await context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  format: "cjs",
  target: "es2022",
  platform: "browser",
  outfile: "main.js",
  sourcemap: process.argv.includes("--watch") ? "inline" : false,
  minify: false,
  banner: { js: "/* Vimflow · MIT License · https://github.com/Async23/obsidian-vimflow */" },
});
if (process.argv.includes("--watch")) await build.watch();
else {
  await build.rebuild();
  await build.dispose();
}

import { readFile } from "node:fs/promises";

const json = async (path) =>
  JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
const [manifest, pkg, versions] = await Promise.all([
  json("manifest.json"),
  json("package.json"),
  json("versions.json"),
]);
const tag = process.env.GITHUB_REF_NAME;
if (
  manifest.version !== pkg.version ||
  versions[manifest.version] !== manifest.minAppVersion ||
  (tag && tag !== manifest.version)
) {
  throw new Error("Release tag, package, manifest and compatibility versions must match.");
}
console.log(`Vimflow ${manifest.version}: release metadata verified.`);

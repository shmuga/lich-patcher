// Make every static deployment carry its notices and matching application source.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const sha = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const sources = JSON.parse(readFileSync("public/source/upstreams.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const meta = JSON.parse(readFileSync("src/js/pd/docs.json", "utf8"))._meta;
if (pkg.dependencies["libpd-wasm"] !== sources.libpdWasmVersion) {
  throw new Error("libpd-wasm version and matching source package disagree");
}
if (meta.pdCommit !== sources.upstreams["pure-data"].commit || meta.hvcc !== sources.hvccVersion) {
  throw new Error("Reference documentation and matching upstream source packages disagree");
}
for (const [name, entry] of Object.entries(sources.archives)) {
  if (sha("public/source/" + name) !== entry.sha256) throw new Error(`Source archive changed: ${name}`);
}
const helpLicense = readFileSync("public/help/LICENSE.txt", "utf8");
if (!helpLicense.includes("Redistribution and use") || !helpLicense.includes("THIS SOFTWARE IS PROVIDED")) {
  throw new Error("Pure Data help must include the full BSD conditions and disclaimer");
}
mkdirSync("public/source", { recursive: true });
copyFileSync("LICENSE", "public/LICENSE.txt");
writeFileSync("public/CREDITS.md", readFileSync("CREDITS.md", "utf8")
  .replaceAll("(LICENSE)", "(LICENSE.txt)")
  .replaceAll("(docs/preview-source.md)", "(source/README.md)"));
copyFileSync("THIRD_PARTY_NOTICES.txt", "public/THIRD_PARTY_NOTICES.txt");
copyFileSync("docs/preview-source.md", "public/source/README.md");
writeFileSync("public/legal.html", `<!doctype html>
<html lang="en">
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Source, credits and licences · Lich Patcher</title>
<style>body{max-width:760px;margin:48px auto;padding:0 24px;background:#17181a;color:#e4e4e1;font:16px/1.65 system-ui,sans-serif}a{color:#ff8a80}h1,h2{line-height:1.25}li{margin:8px 0}</style>
<a href="./">← Lich Patcher</a>
<h1>Source, credits and licences</h1>
<p>Copyright © 2026 Lich Patcher contributors. This is free software under the
<a href="LICENSE.txt">GNU General Public License, version 3 or later</a>.
You may use, study, modify and redistribute it under those terms.
It comes with <strong>no warranty</strong>, including no warranty of merchantability
or fitness for a particular purpose. Third-party components retain their original notices.</p>
<h2>Source for this deployment</h2>
<ul>
<li><a href="source/lich-patcher-source.tar.gz">Application source</a></li>
<li><a href="source/libpd-wasm-0.1.6-source.tar.gz">Preview engine source: libpd-wasm, Pure Data, Cyclone and ELSE</a></li>
<li><a href="source/hvcc-0.17.2-docs.tar.gz">Original hvcc reference documentation</a></li>
<li><a href="source/README.md">Preview build instructions</a></li>
<li><a href="source/upstreams.json">Pinned upstream revisions</a> · <a href="source/release.json">Release checksums</a></li>
</ul>
<p>To rebuild the application, extract its source and copy both upstream source
archives above into <code>public/source/</code>. Run <code>npm ci</code> and
<code>npm run build</code>. Git and network access are needed if regenerating reference docs.</p>
<h2>Credits</h2>
<p>Thanks to <a href="https://www.befaco.org/lich/">Befaco</a> and
<a href="https://www.rebeltech.org/">Rebel Technology</a> for Lich and OWL;
Miller Puckette and <a href="https://puredata.info/">Pure Data</a> contributors;
<a href="https://github.com/libpd/libpd">libpd</a> and
<a href="https://github.com/hyrfilm/libpd-wasm">hyrfilm/libpd-wasm</a>;
the <a href="https://github.com/porres/pd-cyclone">Cyclone</a> and
<a href="https://github.com/porres/pd-else">ELSE</a> authors;
Enzien Audio and <a href="https://github.com/Wasted-Audio/hvcc">Wasted Audio</a>;
and the Emscripten, musl and Vite browser-helper contributors.</p>
<p>The preview includes GPL reverbs by Juhana Sadeharju and Tom Schouten, adapted
by Alexandre Torres Porres. Fonts are Barlow / Barlow Condensed by Jeremy Tribby
and JetBrains Mono by JetBrains, loaded from Google Fonts under the SIL OFL.</p>
<p>The built-in 120 BPM drum loop was synthesised for Lich Patcher and is
dedicated to the public domain under <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a>.</p>
<p><a href="CREDITS.md">Full credits, licensing scope and source provenance</a> ·
<a href="THIRD_PARTY_NOTICES.txt">All third-party copyright notices and licence texts</a></p>
<p>This independent project is not an official Befaco or Rebel Technology product.
Names identify compatibility and credit authors; they do not imply endorsement.</p>
</html>\n`);

// Explicit inputs keep credentials, node_modules, local files and the generated
// source archives out of this download. Upstream archives are separate links.
const files = ["LICENSE", "CREDITS.md", "THIRD_PARTY_NOTICES.txt", "README.md", "package.json", "package-lock.json",
  "index.html", "vite.config.js", "netlify.toml", ".env.example", ".gitignore",
  "src", "scripts", "tests", "docs", "public/help", "public/audio", "public/legal.html",
  "public/source/upstreams.json"];
execFileSync("tar", ["-czf", "public/source/lich-patcher-source.tar.gz", "--exclude=.DS_Store",
  "--exclude=__pycache__", "--exclude=*.pyc", ...files],
  { cwd: root, env: { ...process.env, COPYFILE_DISABLE: "1" } });
writeFileSync("public/source/release.json", JSON.stringify({
  version: pkg.version,
  license: pkg.license,
  applicationSourceSha256: sha("public/source/lich-patcher-source.tar.gz"),
  deployedWorkletSha256: sha("public/libpd-worklet.js"),
  upstreamWorkletSha256: sources.workletSha256,
  upstreamSourceArchives: sources.archives,
}, null, 2) + "\n");
console.log("Licences verified; application and preview source downloads ready.");

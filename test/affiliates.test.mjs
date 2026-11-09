import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "@astrojs/compiler";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { gearLinks } from "../src/lib/affiliates.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const compilerRuntime = pathToFileURL(join(root, "node_modules/astro/dist/runtime/compiler/index.js")).href;
const awinPrefix = "https://www.awin1.com/cread.php?awinmid=43671&awinaffid=3131988";

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.name.endsWith(".astro")) files.push(path);
  }
  return files;
}

function prep(code) {
  const next = code
    .replace(/,?\s*createMetadata as \$\$createMetadata/, "")
    .replaceAll('from "astro/compiler-runtime"', `from ${JSON.stringify(compilerRuntime)}`);
  return next.replace(
    "export const $$metadata = $$createMetadata",
    "const $$createMetadata = () => ({});\nexport const $$metadata = $$createMetadata",
  );
}

function absolutize(code, sourceFile, astroUrls) {
  return code.replace(/from\s+(['"])(\.[^'"]+)\1/g, (_full, _quote, spec) => {
    const abs = join(dirname(sourceFile), spec);
    const target = spec.endsWith(".astro") ? astroUrls.get(abs) : pathToFileURL(abs).href;
    if (!target) throw new Error(`unresolved import ${spec} from ${sourceFile}`);
    return `from ${JSON.stringify(target)}`;
  });
}

async function renderPages(files) {
  const dir = mkdtempSync(join(tmpdir(), "treadgrade-gear-"));
  const astroUrls = new Map();
  const slotPath = join(dir, "slot.mjs");
  const slotSource = "---\n---\n<slot />\n";
  const slotCompiled = prep(
    (await transform(slotSource, { filename: "slot.astro", internalURL: "astro/compiler-runtime" })).code,
  );
  writeFileSync(slotPath, slotCompiled);
  const slotUrl = pathToFileURL(slotPath).href;

  async function compile(sourceFile, real) {
    const filename = relative(root, sourceFile);
    const compiled = prep(
      (await transform(readFileSync(sourceFile, "utf8"), { filename, internalURL: "astro/compiler-runtime" })).code,
    );
    const out = join(dir, `${astroUrls.size}.mjs`);
    const url = pathToFileURL(out).href;
    astroUrls.set(sourceFile, real ? url : slotUrl);
    if (real) writeFileSync(out, absolutize(compiled, sourceFile, astroUrls));
    return url;
  }

  const gearFile = fileURLToPath(new URL("../src/components/GearLinks.astro", import.meta.url));
  await compile(gearFile, true);
  const container = await AstroContainer.create();
  const htmlByFile = new Map();
  try {
    for (const file of files) {
      const compiled = prep(
        (
          await transform(readFileSync(file, "utf8"), {
            filename: relative(root, file),
            internalURL: "astro/compiler-runtime",
          })
        ).code,
      );
      const out = join(dir, `page-${htmlByFile.size}.mjs`);
      const urls = new Map(astroUrls);
      for (const match of compiled.matchAll(/from\s+(['"])(\.[^'"]+\.astro)\1/g)) {
        const abs = join(dirname(file), match[2]);
        if (!urls.has(abs)) urls.set(abs, slotUrl);
      }
      writeFileSync(out, absolutize(compiled, file, urls));
      const mod = await import(pathToFileURL(out).href);
      htmlByFile.set(file, await container.renderToString(mod.default));
    }
    return htmlByFile;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function gearBlock(html) {
  const match = html.match(/<aside class="card" aria-labelledby="gear-heading">[\s\S]*?<\/aside>/);
  assert.ok(match, "roadside gear block");
  return match[0];
}

test("enabled AstroAI links render on every page that uses GearLinks", async () => {
  const pagesDir = fileURLToPath(new URL("../src/pages", import.meta.url));
  const pages = walk(pagesDir).filter((file) => readFileSync(file, "utf8").includes("<GearLinks"));
  assert.deepEqual(
    pages.map((file) => relative(pagesDir, file)).sort(),
    ["guides/tire-pressure-and-roadside-kit.astro", "guides/utqg-grades.astro"],
  );

  const links = gearLinks();
  assert.equal(links.length, 2);
  const rendered = await renderPages([
    ...pages,
    fileURLToPath(new URL("../src/pages/affiliate-disclosure.astro", import.meta.url)),
    fileURLToPath(new URL("../src/pages/privacy.astro", import.meta.url)),
    fileURLToPath(new URL("../src/pages/about.astro", import.meta.url)),
  ]);

  for (const file of pages) {
    const block = gearBlock(rendered.get(file));
    assert.match(block, /rel="sponsored nofollow noopener"/);
    assert.match(block, /These are affiliate links to AstroAI\s+through the Awin network/);
    assert.match(block, /href="\/affiliate-disclosure\/"/);
    assert.doesNotMatch(block, /<script|<img/i);
    assert.doesNotMatch(block, /\$|\bpsi\b|rating|stars|clickref|awclick/i);
    for (const link of links) {
      assert.equal(link.href.startsWith(awinPrefix), true, link.key);
      const attr = `href="${link.href}"`;
      assert.ok(block.includes(attr), `${relative(pagesDir, file)} ${link.key}`);
      assert.ok(block.includes(link.label));
    }
  }

  const disclosure = rendered.get(fileURLToPath(new URL("../src/pages/affiliate-disclosure.astro", import.meta.url)));
  assert.match(disclosure, /Some pages show roadside-gear links\. Those links go to AstroAI through the Awin network\./);
  assert.match(disclosure, /No Awin script, tracking pixel, or image is loaded on this site\./);
  assert.match(disclosure, /Affiliate buttons are not configured\./);
  assert.doesNotMatch(disclosure, /Roadside-gear links to AstroAI through the Awin network are not configured/);

  const privacy = rendered.get(fileURLToPath(new URL("../src/pages/privacy.astro", import.meta.url)));
  assert.match(privacy, /A labeled roadside-gear link leaves this site for AstroAI through the Awin network\./);
  assert.match(privacy, /This site does not load an Awin script, tracking pixel, or image\./);
  assert.doesNotMatch(privacy, /Roadside-gear links to AstroAI through Awin are off/);

  const about = rendered.get(fileURLToPath(new URL("../src/pages/about.astro", import.meta.url)));
  assert.match(about, /AstroAI roadside-gear links are labeled and disclosed\. This site does not load an Awin script\./);
  assert.match(about, /Retailer buttons stay off until an affiliate id and an https link template are configured\./);
  assert.doesNotMatch(about, /AstroAI gear links are off/);
});

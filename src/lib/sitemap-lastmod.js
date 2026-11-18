// Per-URL sitemap lastmod.
//
// Each URL is dated from a committed ledger (data/lastmod.json): a hash of
// that page's own source plus the data rows it renders, and the day that
// hash last changed. The build reads the ledger. It does not ask git, and
// it does not use the clock.
//
// Counted for a URL:
// - the page template (a shared route template counts for every URL it renders)
// - content modules and components the template imports
// - the answer-box functions that template imports from src/lib/answers.js,
//   including the helpers those functions call. sourceEntries is not counted:
//   it only prints the verified-date line, which changes on a refresh that
//   changes no rows
// - the data rows that page renders
//
// Not counted, so a commit that only touches them leaves every lastmod still:
// - layouts, the shared header, footer, and breadcrumbs
// - the source line, check-price buttons, and gear links
// - global CSS, fonts, favicons, the web manifest, robots.txt, the OG image,
//   and brand-mark assets
// - src/lib/structured.js (JSON-LD only) and src/lib/catalog.js (the loader).
//   Data files are hashed per URL, not as one shared blob, so a refresh that
//   changes no rows for a page does not move that page
//
// A URL with no determinable hash is left out of the ledger, and the sitemap
// omits <lastmod> for it. A new URL gets the day it first appears. Nothing
// here writes a date in the future.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

export const LEDGER_PATH = join(root, "data", "lastmod.json");
export const DAY = /^\d{4}-\d{2}-\d{2}$/;

const IGNORED_PREFIXES = ["src/layouts/", "src/styles/", "public/fonts/", "public/brand/"];
const IGNORED_FILES = new Set([
  "src/components/Header.astro",
  "src/components/Footer.astro",
  "src/components/Breadcrumbs.astro",
  "src/components/SourceLine.astro",
  "src/components/CheckPrice.astro",
  "src/components/GearLinks.astro",
  "src/lib/structured.js",
  "src/lib/sitemap.js",
  "src/lib/sitemap-lastmod.js",
  "src/lib/sitemap-content.js",
  "src/lib/catalog.js",
  "public/favicon.ico",
  "public/favicon.svg",
  "public/apple-touch-icon.png",
  "public/icon-192.png",
  "public/icon-512.png",
  "public/icon-maskable-512.png",
  "public/og-image.png",
  "public/site.webmanifest",
  "public/robots.txt",
]);

const ANSWERS_FILE = "src/lib/answers.js";
const SKIP_ANSWER_EXPORTS = new Set(["sourceEntries"]);
const FUNCTION_BLOCK = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/gm;

export function isIgnoredInput(rel) {
  if (!rel || rel.endsWith(".css")) return true;
  if (rel.startsWith("data/") && rel.endsWith(".json")) return true;
  if (IGNORED_FILES.has(rel)) return true;
  return IGNORED_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
    return out;
  }
  return value;
}

export function canonical(value) {
  return JSON.stringify(sortValue(value));
}

export function pageHash(sourceHash, data) {
  return sha256(`${sourceHash}\n${canonical(data)}`);
}

export function utcDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function isDay(value) {
  if (!DAY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function newestDay(days) {
  let max = "";
  for (const day of days) {
    if (!day) continue;
    if (!isDay(day)) throw new Error(`invalid lastmod day ${day}`);
    if (!max || day > max) max = day;
  }
  return max;
}

/**
 * Keep a stored day when the hash is unchanged. A changed or new URL gets
 * asOf, the day that change was recorded. An empty hash omits the URL.
 */
export function reconcileLedger(previous, hashes, asOf) {
  if (!isDay(asOf)) throw new Error(`lastmod asOf is not a day: ${asOf}`);
  if (asOf > utcDay()) throw new Error(`lastmod asOf ${asOf} is in the future`);
  const urls = {};
  const omitted = [];
  const entries = hashes instanceof Map ? hashes : new Map(Object.entries(hashes));
  for (const [path, hash] of entries) {
    if (!hash) {
      omitted.push(path);
      continue;
    }
    const prior = previous?.urls?.[path];
    let date = asOf;
    if (prior && prior.hash === hash && isDay(prior.date) && prior.date <= asOf) date = prior.date;
    urls[path] = { hash, date };
  }
  return { urls, omitted };
}

export function lastmodDistribution(urls) {
  const counts = new Map();
  for (const entry of Object.values(urls)) {
    counts.set(entry.date, (counts.get(entry.date) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
}

export function functionBlocks(source) {
  const matches = [...String(source).matchAll(FUNCTION_BLOCK)];
  const blocks = new Map();
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : source.length;
    blocks.set(matches[i][1], source.slice(start, end).trim());
  }
  return blocks;
}

export function answerClosure(source, roots) {
  const blocks = functionBlocks(source);
  const names = [...blocks.keys()];
  const seen = new Set();
  const stack = [...roots].filter((name) => name && !SKIP_ANSWER_EXPORTS.has(name));
  while (stack.length) {
    const name = stack.pop();
    if (!name || seen.has(name) || !blocks.has(name)) continue;
    seen.add(name);
    const body = blocks.get(name);
    for (const other of names) {
      if (seen.has(other)) continue;
      if (new RegExp(`\\b${other}\\b`).test(body)) stack.push(other);
    }
  }
  const answerNames = [...seen].sort();
  const text = answerNames.map((name) => blocks.get(name)).join("\n");
  return { answerNames, text };
}

function importedSpecs(source) {
  const specs = new Set();
  for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) specs.add(match[1]);
  for (const match of source.matchAll(/import\s+["'](\.[^"']+)["']/g)) specs.add(match[1]);
  for (const match of source.matchAll(/import\(\s*["'](\.[^"']+)["']\s*\)/g)) specs.add(match[1]);
  return specs;
}

function namedImports(source, baseName) {
  const names = [];
  for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
    const spec = match[2];
    if (spec !== baseName && !spec.endsWith(`/${baseName}`)) continue;
    for (const part of match[1].split(",")) {
      let name = part.trim().replace(/^type\s+/, "");
      if (!name) continue;
      name = name.split(/\s+as\s+/)[0].trim();
      if (name) names.push(name);
    }
  }
  return names;
}

function resolveSpec(fromRel, spec, exists) {
  if (!spec.startsWith(".")) return null;
  const base = normalize(join(dirname(fromRel), spec)).replaceAll("\\", "/");
  const candidates = [base, `${base}.js`, `${base}.mjs`, `${base}.astro`];
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

function defaultExists(rel) {
  const full = join(root, rel);
  return existsSync(full) && statSync(full).isFile();
}

function defaultRead(rel) {
  return readFileSync(join(root, rel), "utf8");
}

/**
 * Source files and answer-function bodies that date one template.
 * Ignored chrome is not walked, so a footer or layout edit is not an input.
 */
export function sourceClosure(entryRel, env = {}) {
  const cache = env.cache || new Map();
  if (cache.has(entryRel)) return cache.get(entryRel);
  const readFile = env.readFile || defaultRead;
  const exists = env.exists || defaultExists;
  const files = new Set();
  const answerRoots = new Set();
  const seen = new Set();
  const stack = [entryRel];
  while (stack.length) {
    const rel = stack.pop();
    if (!rel || seen.has(rel) || isIgnoredInput(rel)) continue;
    seen.add(rel);
    if (rel === ANSWERS_FILE) continue;
    files.add(rel);
    if (rel.endsWith(".json")) continue;
    const source = readFile(rel);
    for (const name of namedImports(source, "answers.js")) answerRoots.add(name);
    for (const spec of importedSpecs(source)) {
      const resolved = resolveSpec(rel, spec, exists);
      if (resolved) stack.push(resolved);
    }
  }
  let answerNames = [];
  let answerText = "";
  if (answerRoots.size && exists(ANSWERS_FILE)) {
    const closure = answerClosure(readFile(ANSWERS_FILE), answerRoots);
    answerNames = closure.answerNames;
    answerText = closure.text;
  }
  const result = { files, answerNames, answerText };
  cache.set(entryRel, result);
  return result;
}

export function sourceHash(entryRel, env = {}) {
  const readFile = env.readFile || defaultRead;
  const closure = sourceClosure(entryRel, env);
  const parts = [];
  for (const file of [...closure.files].sort()) parts.push(`${file}\n${readFile(file)}`);
  if (closure.answerText) parts.push(`${ANSWERS_FILE}#${closure.answerNames.join(",")}\n${closure.answerText}`);
  return { hash: sha256(parts.join("\n---\n")), ...closure };
}

export function dynamicTemplate(pathname) {
  if (pathname.startsWith("/tires/")) return "src/pages/tires/[brand]/[line].astro";
  if (pathname.startsWith("/brands/") && pathname !== "/brands/") return "src/pages/brands/[brand].astro";
  if (pathname.startsWith("/plants/country/") && pathname !== "/plants/country/") {
    return "src/pages/plants/country/[country].astro";
  }
  if (pathname.startsWith("/plants/manufacturer/") && pathname !== "/plants/manufacturer/") {
    return "src/pages/plants/manufacturer/[group].astro";
  }
  if (pathname.startsWith("/who-makes/") && pathname !== "/who-makes-it/") return "src/pages/who-makes/[brand].astro";
  if (pathname.startsWith("/compare/") && pathname !== "/compare/") {
    return "src/pages/compare/[aBrand]/[aLine]/vs/[bBrand]/[bLine].astro";
  }
  if (/^\/plants\/[a-z0-9]+\/$/.test(pathname)) return "src/pages/plants/[code].astro";
  return "";
}

export function templateForPath(pathname, exists = defaultExists) {
  const trimmed = pathname === "/" ? "" : pathname.replace(/^\//, "").replace(/\/$/, "");
  const candidates = trimmed
    ? [`src/pages/${trimmed}.astro`, `src/pages/${trimmed}/index.astro`]
    : ["src/pages/index.astro"];
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  const dynamic = dynamicTemplate(pathname);
  if (dynamic && exists(dynamic)) return dynamic;
  throw new Error(`No page template for ${pathname}`);
}

export function readLedger(path = LEDGER_PATH) {
  if (!existsSync(path)) return { urls: {} };
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed.urls !== "object" || Array.isArray(parsed.urls)) {
    throw new Error("data/lastmod.json is missing urls");
  }
  return parsed;
}

let ledgerCache = null;

export function lastmodForPath(pathname, ledger = null) {
  const book = ledger || (ledgerCache ||= readLedger());
  const entry = book.urls?.[pathname];
  if (!entry || !isDay(entry.date)) return "";
  if (entry.date > utcDay()) return "";
  return entry.date;
}

export function writeLedger(urls, path = LEDGER_PATH) {
  const ordered = {};
  for (const key of Object.keys(urls).sort()) ordered[key] = { hash: urls[key].hash, date: urls[key].date };
  writeFileSync(path, `${JSON.stringify({ urls: ordered }, null, 2)}\n`);
  ledgerCache = null;
}

function pathnameOf(loc) {
  return decodeURIComponent(new URL(loc).pathname);
}

/**
 * Write each URL lastmod from the ledger and set the index lastmod to the
 * newest day in that child sitemap. A URL with no ledger day has no lastmod.
 */
export function rewriteBuiltSitemaps(distDir, ledger = readLedger()) {
  const names = readdirSync(distDir).filter((name) => name.startsWith("sitemap") && name.endsWith(".xml"));
  const indexName = names.find((name) => name.includes("index"));
  if (!indexName) throw new Error("sitemap index was not written");
  const childMax = new Map();
  for (const name of names) {
    if (name === indexName) continue;
    const full = join(distDir, name);
    let max = "";
    const xml = readFileSync(full, "utf8").replace(/<(url|sitemap)>([\s\S]*?)<\/\1>/g, (block, kind, inner) => {
      const locMatch = inner.match(/<loc>([^<]+)<\/loc>/);
      if (!locMatch) return block;
      const loc = locMatch[1];
      let day = "";
      if (kind === "url") {
        day = lastmodForPath(pathnameOf(loc), ledger);
        if (day && (!max || day > max)) max = day;
      }
      const stripped = inner.replace(/\s*<lastmod>[^<]*<\/lastmod>/, "");
      const next = day ? stripped.replace(/<loc>[^<]+<\/loc>/, (tag) => `${tag}<lastmod>${day}</lastmod>`) : stripped;
      return `<${kind}>${next}</${kind}>`;
    });
    writeFileSync(full, xml);
    childMax.set(name, max);
  }
  const indexPath = join(distDir, indexName);
  const indexXml = readFileSync(indexPath, "utf8").replace(/<(sitemap)>([\s\S]*?)<\/\1>/g, (block, kind, inner) => {
    const locMatch = inner.match(/<loc>([^<]+)<\/loc>/);
    if (!locMatch) return block;
    const name = pathnameOf(locMatch[1]).split("/").pop();
    const day = childMax.get(name) || "";
    const stripped = inner.replace(/\s*<lastmod>[^<]*<\/lastmod>/, "");
    const next = day ? stripped.replace(/<loc>[^<]+<\/loc>/, (tag) => `${tag}<lastmod>${day}</lastmod>`) : stripped;
    return `<${kind}>${next}</${kind}>`;
  });
  writeFileSync(indexPath, indexXml);
  return childMax;
}

export function sitemapBlocks(xml) {
  const blocks = [];
  for (const match of xml.matchAll(/<(url|sitemap)>([\s\S]*?)<\/\1>/g)) {
    const loc = match[2].match(/<loc>([^<]+)<\/loc>/);
    const lastmod = match[2].match(/<lastmod>([^<]*)<\/lastmod>/);
    if (!loc) continue;
    blocks.push({
      kind: match[1],
      loc: loc[1],
      pathname: pathnameOf(loc[1]),
      lastmod: lastmod ? lastmod[1] : "",
    });
  }
  return blocks;
}

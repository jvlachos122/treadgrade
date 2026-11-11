import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { catalog } from "../src/lib/catalog.js";
import { exampleComparisonPaths } from "../src/lib/compare-pages.js";
import { hubPaths } from "../src/lib/plant-hubs.js";
import { HIGHEST_TREADWEAR_PATH } from "../src/lib/highest-treadwear.js";
import { LONG_TREADWEAR_PATH } from "../src/lib/long-treadwear.js";
import { TREADWEAR_NUMBERS_PATH } from "../src/lib/treadwear-numbers.js";
import { TIRE_AGE_PATH } from "../src/lib/tire-age.js";
import { RECALLS_PATH } from "../src/lib/recall-list.js";
import { SIZE_VARIANCE_PATH } from "../src/lib/size-variance.js";
import { NO_UTQG_PATH } from "../src/lib/utqg-exempt.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const site = "https://treadgrade.com";
const errors = [];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path));
    else if (entry.endsWith(".html")) files.push(path);
  }
  return files;
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function attrs(tag) {
  const found = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*"([^"]*)"/g)) found[match[1]] = decodeHtml(match[2]);
  return found;
}

function pageUrl(file) {
  const rel = normalize(file.slice(dist.length)).replaceAll("\\", "/");
  if (rel === "/index.html") return "/";
  if (rel.endsWith("/index.html")) return rel.slice(0, -"index.html".length);
  return rel;
}

function fileForPath(urlPath) {
  const path = urlPath.split("#")[0].split("?")[0];
  if (path === "/" || path === "") return join(dist, "index.html");
  if (path.endsWith(".html") || path.includes(".")) return join(dist, path);
  return join(dist, path.replace(/\/$/, ""), "index.html");
}

function idsIn(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
}

const files = walk(dist);
const htmlByFile = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));

function redirectPath(html) {
  const match = html.match(/<meta http-equiv="refresh" content="0;url=([^"]+)">/);
  if (!match) return "";
  try {
    return new URL(match[1]).pathname;
  } catch {
    return "";
  }
}

const redirectPages = new Set();
for (const [file, html] of htmlByFile) {
  if (redirectPath(html)) redirectPages.add(pageUrl(file));
}
if (!redirectPages.size) errors.push("expected retired-address pages");

for (const [file, html] of htmlByFile) {
  const ids = idsIn(html);
  if (ids.size !== [...html.matchAll(/\sid="([^"]+)"/g)].length) {
    errors.push(`${file}: duplicate id`);
  }
  const tags = html.match(/<(?:a|link|script|img|form)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attributes = attrs(tag);
    const raw = attributes.href || attributes.src || attributes.action;
    if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;
    if (raw.startsWith("javascript:")) {
      errors.push(`${file}: javascript URL ${raw}`);
      continue;
    }
    let url;
    if (raw.startsWith(site)) url = new URL(raw);
    else if (raw.startsWith("/")) url = new URL(raw, site);
    else if (raw.startsWith("#")) url = new URL(pageUrl(file) + raw, site);
    else if (/^https?:\/\//.test(raw)) continue;
    else {
      errors.push(`${file}: relative URL ${raw}`);
      continue;
    }
    if (url.origin !== site) continue;
    if (!redirectPages.has(pageUrl(file)) && redirectPages.has(url.pathname)) {
      errors.push(`${file}: links to retired ${url.pathname}`);
    }
    const target = fileForPath(url.pathname);
    if (!existsSync(target)) {
      errors.push(`${file}: missing ${url.pathname}`);
      continue;
    }
    if (url.hash) {
      const id = decodeURIComponent(url.hash.slice(1));
      const targetHtml = htmlByFile.get(resolve(target)) || readFileSync(target, "utf8");
      if (!idsIn(targetHtml).has(id)) errors.push(`${file}: missing #${id} on ${url.pathname}`);
    }
  }
}

for (const required of [
  "data/ratings.json",
  "data/plants.json",
  "data/search.json",
  "favicon.svg",
  "favicon.ico",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "site.webmanifest",
  "og-image.png",
  "brand/treadgrade-logo.svg",
  "robots.txt",
  "CNAME",
]) {
  if (!existsSync(join(dist, required))) errors.push(`missing dist/${required}`);
}

const cname = readFileSync(join(dist, "CNAME"), "utf8").trim();
if (cname !== "treadgrade.com") errors.push(`CNAME is ${cname}`);

const sitemapFiles = readdirSync(dist).filter((name) => name.startsWith("sitemap") && name.endsWith(".xml"));
if (!sitemapFiles.length) errors.push("missing sitemap");
const pageLocs = new Set();
for (const name of sitemapFiles) {
  const xml = readFileSync(join(dist, name), "utf8");
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = new URL(match[1]);
    if (match[1].includes("?")) errors.push(`sitemap query ${match[1]}`);
    if (url.origin !== site) errors.push(`sitemap off-site ${match[1]}`);
    if (url.pathname === "/404.html" || url.pathname === "/404/") errors.push(`sitemap includes 404 ${match[1]}`);
    if (redirectPages.has(url.pathname)) errors.push(`sitemap includes retired ${match[1]}`);
    const target = fileForPath(url.pathname);
    if (!existsSync(target)) errors.push(`sitemap missing ${url.pathname}`);
    if (!url.pathname.endsWith(".xml")) pageLocs.add(url.pathname);
  }
}
for (const plant of catalog.plants) {
  if (!pageLocs.has(plant.url)) errors.push(`sitemap missing plant ${plant.url}`);
}
if (!pageLocs.has("/plants/")) errors.push("sitemap missing /plants/");
if (!pageLocs.has("/compare/")) errors.push("sitemap missing /compare/");
if (!pageLocs.has(NO_UTQG_PATH)) errors.push(`sitemap missing ${NO_UTQG_PATH}`);
if (!pageLocs.has(SIZE_VARIANCE_PATH)) errors.push(`sitemap missing ${SIZE_VARIANCE_PATH}`);
if (!pageLocs.has(HIGHEST_TREADWEAR_PATH)) errors.push(`sitemap missing ${HIGHEST_TREADWEAR_PATH}`);
if (!pageLocs.has(LONG_TREADWEAR_PATH)) errors.push(`sitemap missing ${LONG_TREADWEAR_PATH}`);
if (!pageLocs.has(TREADWEAR_NUMBERS_PATH)) errors.push(`sitemap missing ${TREADWEAR_NUMBERS_PATH}`);
if (!pageLocs.has(TIRE_AGE_PATH)) errors.push(`sitemap missing ${TIRE_AGE_PATH}`);
if (!pageLocs.has(RECALLS_PATH)) errors.push(`sitemap missing ${RECALLS_PATH}`);
for (const path of exampleComparisonPaths) {
  if (!pageLocs.has(path)) errors.push(`sitemap missing example ${path}`);
}
for (const path of hubPaths) {
  if (!pageLocs.has(path)) errors.push(`sitemap missing hub ${path}`);
}

const compareIndexPath = join(dist, "data/compare-index.json");
if (!existsSync(compareIndexPath)) errors.push("missing dist/data/compare-index.json");
else {
  const compareIndex = JSON.parse(readFileSync(compareIndexPath, "utf8"));
  const compareLines = Array.isArray(compareIndex.lines) ? compareIndex.lines : [];
  if (!compareLines.length) errors.push("compare index is empty");
  let missingSummaries = 0;
  for (const line of compareLines) {
    if (!existsSync(join(dist, "data/compare", `${line.id}.json`))) missingSummaries += 1;
  }
  if (missingSummaries) errors.push(`${missingSummaries} compare summaries missing`);
}

const robots = readFileSync(join(dist, "robots.txt"), "utf8");
if (!robots.includes("https://treadgrade.com/sitemap-index.xml")) errors.push("robots.txt sitemap URL");

if (errors.length) {
  console.error(errors.slice(0, 40).join("\n"));
  console.error(`${errors.length} link errors`);
  process.exit(1);
}
console.log(`Links OK across ${files.length} HTML files.`);

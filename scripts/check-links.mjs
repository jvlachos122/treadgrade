import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hubPaths, indexablePlantPaths, thinPlantPaths } from "../src/lib/plant-hubs.js";

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

function attrs(tag) {
  const found = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*"([^"]*)"/g)) found[match[1]] = match[2];
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
    if (url.origin !== site) errors.push(`sitemap off-site ${match[1]}`);
    if (url.pathname === "/404.html" || url.pathname === "/404/") errors.push(`sitemap includes 404 ${match[1]}`);
    if (redirectPages.has(url.pathname)) errors.push(`sitemap includes retired ${match[1]}`);
    if (thinPlantPaths.has(url.pathname)) errors.push(`sitemap includes thin plant ${match[1]}`);
    const target = fileForPath(url.pathname);
    if (!existsSync(target)) errors.push(`sitemap missing ${url.pathname}`);
    if (!url.pathname.endsWith(".xml")) pageLocs.add(url.pathname);
  }
}
for (const path of indexablePlantPaths) {
  if (!pageLocs.has(path)) errors.push(`sitemap missing indexable plant ${path}`);
}
for (const path of hubPaths) {
  if (!pageLocs.has(path)) errors.push(`sitemap missing hub ${path}`);
}

const robots = readFileSync(join(dist, "robots.txt"), "utf8");
if (!robots.includes("https://treadgrade.com/sitemap-index.xml")) errors.push("robots.txt sitemap URL");

if (errors.length) {
  console.error(errors.slice(0, 40).join("\n"));
  console.error(`${errors.length} link errors`);
  process.exit(1);
}
console.log(`Links OK across ${files.length} HTML files.`);

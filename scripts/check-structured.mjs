import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const site = "https://treadgrade.com";
const meta = JSON.parse(readFileSync(join(root, "data/meta.json"), "utf8"));
const allowedDates = new Set([meta.verifiedAt, meta.recalls?.retrievedAt].filter(Boolean));
const license = "https://www.usa.gov/government-works";
const errors = [];
const typeCounts = new Map();

const ALLOWED = new Set([
  "BreadcrumbList",
  "ListItem",
  "Dataset",
  "Organization",
  "WebApplication",
  "Offer",
  "WebSite",
  "SearchAction",
  "Article",
  "FAQPage",
  "Question",
  "Answer",
]);
const FORBIDDEN = new Set(["Product", "Review", "AggregateRating"]);

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (entry.endsWith(".html")) files.push(path);
  }
  return files;
}

function pagePath(file) {
  const rel = file.slice(dist.length).replaceAll("\\", "/");
  if (rel === "/index.html") return "/";
  if (rel === "/404.html") return "/404.html";
  if (rel.endsWith("/index.html")) return rel.slice(0, -"index.html".length);
  return rel;
}

function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function ownTypes(node) {
  const value = node?.["@type"];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function requirements(pathname) {
  const req = { types: [], answer: false, source: false };
  if (pathname === "/404.html") return req;
  if (pathname === "/") {
    req.types.push("WebSite");
    req.answer = true;
    req.source = true;
    return req;
  }
  req.types.push("BreadcrumbList");
  if (pathname === "/decoder/") {
    req.types.push("WebApplication");
    req.answer = true;
    req.source = true;
  } else if (pathname.startsWith("/guides/")) {
    req.types.push("Article");
    req.answer = true;
    req.source = true;
  } else if (
    pathname === "/ratings/" ||
    pathname === "/who-makes-it/" ||
    pathname.startsWith("/who-makes/") ||
    pathname === "/methodology/" ||
    pathname.startsWith("/tires/") ||
    pathname.startsWith("/brands/") ||
    pathname.startsWith("/plants/")
  ) {
    req.types.push("Dataset");
    req.answer = true;
    req.source = true;
  }
  return req;
}

function isHttps(value) {
  return typeof value === "string" && /^https:\/\//.test(value);
}

function basedOnUrls(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.length > 0 && list.every((item) => isHttps(item));
}

function creatorCreditsNhtsa(creator) {
  const list = Array.isArray(creator) ? creator : [creator];
  return list.some(
    (org) =>
      org &&
      (org.name === "National Highway Traffic Safety Administration" || org.alternateName === "NHTSA"),
  );
}

function fail(file, message) {
  errors.push(`${file.slice(dist.length)}: ${message}`);
}

function validateNode(node, ctx) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  const types = ownTypes(node);
  for (const type of types) {
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    if (FORBIDDEN.has(type)) fail(ctx.file, `forbidden type ${type}`);
    if (!ALLOWED.has(type)) fail(ctx.file, `unexpected type ${type}`);
  }
  if (types.includes("Dataset")) {
    if (!node.name || !node.description) fail(ctx.file, "Dataset missing name or description");
    if (node.url !== ctx.expectedUrl) fail(ctx.file, `Dataset url ${node.url}`);
    if (!allowedDates.has(node.dateModified)) fail(ctx.file, `Dataset dateModified ${node.dateModified}`);
    if (node.license !== license) fail(ctx.file, `Dataset license ${node.license}`);
    if (!creatorCreditsNhtsa(node.creator)) fail(ctx.file, "Dataset creator is not NHTSA");
    if (!basedOnUrls(node.isBasedOn)) fail(ctx.file, "Dataset isBasedOn is not an https URL");
  }
  if (types.includes("Article")) {
    if (!node.headline || !node.dateModified) fail(ctx.file, "Article missing headline or dateModified");
    if (!allowedDates.has(node.dateModified)) fail(ctx.file, `Article dateModified ${node.dateModified}`);
    if (node.mainEntityOfPage !== ctx.expectedUrl) fail(ctx.file, `Article mainEntityOfPage ${node.mainEntityOfPage}`);
  }
  if (types.includes("WebApplication")) {
    if (!node.name || !node.url) fail(ctx.file, "WebApplication missing name or url");
    if (node.url !== ctx.expectedUrl) fail(ctx.file, `WebApplication url ${node.url}`);
    if (!allowedDates.has(node.dateModified)) fail(ctx.file, `WebApplication dateModified ${node.dateModified}`);
  }
  if (types.includes("WebSite")) {
    if (!node.name || !isHttps(node.url) || !node.url.startsWith(site)) fail(ctx.file, "WebSite name or url");
  }
  if (types.includes("SearchAction")) {
    if (typeof node.target !== "string" || !node.target.includes(site)) fail(ctx.file, "SearchAction target");
  }
  if (types.includes("Offer")) {
    if (typeof node.price !== "string" || typeof node.priceCurrency !== "string") fail(ctx.file, "Offer price");
  }
  if (types.includes("BreadcrumbList")) {
    const items = node.itemListElement;
    if (!Array.isArray(items) || !items.length) fail(ctx.file, "BreadcrumbList items");
    else {
      items.forEach((item, index) => {
        if (item?.["@type"] !== "ListItem") fail(ctx.file, "BreadcrumbList item type");
        if (item?.position !== index + 1) fail(ctx.file, `BreadcrumbList position ${item?.position}`);
        if (!item?.name) fail(ctx.file, "BreadcrumbList name");
        if (!isHttps(item?.item) || !item.item.startsWith(site)) fail(ctx.file, `BreadcrumbList item ${item?.item}`);
      });
      if (items.at(-1)?.item !== ctx.expectedUrl) fail(ctx.file, `BreadcrumbList last ${items.at(-1)?.item}`);
    }
  }
  if (types.includes("ListItem")) {
    if (typeof node.position !== "number" || !node.name || !isHttps(node.item)) fail(ctx.file, "ListItem fields");
  }
  if (types.includes("Organization")) {
    if (!node.name) fail(ctx.file, "Organization name");
  }
  if (types.includes("FAQPage")) {
    const questions = Array.isArray(node.mainEntity) ? node.mainEntity : node.mainEntity ? [node.mainEntity] : [];
    if (!questions.length) fail(ctx.file, "FAQPage has no questions");
    for (const question of questions) {
      const answer = question?.acceptedAnswer?.text;
      if (question?.["@type"] !== "Question" || !question.name || !answer) fail(ctx.file, "FAQPage question shape");
      else if (!ctx.pageText.includes(question.name) || !ctx.pageText.includes(answer)) {
        fail(ctx.file, `FAQPage question is not visible: ${question.name}`);
      }
    }
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object") validateNode(item, ctx);
      }
    } else if (value && typeof value === "object") validateNode(value, ctx);
  }
}

function checkAnswer(main, file) {
  const asides = [...main.matchAll(/<aside class="answer"/g)];
  if (asides.length !== 1) {
    fail(file, `${asides.length} answer boxes`);
    return;
  }
  const start = asides[0].index;
  const h1 = main.indexOf("<h1");
  if (h1 < 0 || start < h1) fail(file, "answer box is above the h1");
  const h2 = main.indexOf("<h2");
  const table = main.indexOf("<table");
  const bounds = [h2, table].filter((index) => index >= 0);
  if (bounds.length && start > Math.min(...bounds)) fail(file, "answer box is below the first section");
  const end = main.indexOf("</aside>", start);
  const asideHtml = main.slice(start, end);
  const paragraphs = [...asideHtml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)];
  const sentences = paragraphs
    .filter((paragraph) => !/\banswer-label\b/.test(paragraph[1]))
    .map((paragraph) => visibleText(paragraph[2]));
  if (sentences.length < 1 || sentences.length > 3) fail(file, `${sentences.length} answer sentences`);
  for (const sentence of sentences) {
    if (!/[.!?]$/.test(sentence)) fail(file, `answer sentence does not end: ${sentence.slice(0, 80)}`);
    if (/\bthe best\b/i.test(sentence)) fail(file, "answer says the best");
    if (/\bhighest\b/i.test(sentence) && !/in NHTSA's published UTQG list/.test(sentence)) {
      fail(file, `highest without the published-list limit: ${sentence.slice(0, 120)}`);
    }
  }
  const sourceAt = main.indexOf('class="source-line"', end);
  if (sourceAt < 0 || sourceAt - end > 500) fail(file, "source line is not next to the answer");
  const sourceStart = main.lastIndexOf("<p", sourceAt);
  const sourceText = visibleText(main.slice(sourceStart, main.indexOf("</p>", sourceAt)));
  if (!sourceText.startsWith("Source: NHTSA ")) fail(file, `source line: ${sourceText.slice(0, 120)}`);
  if (!/last updated [A-Z][a-z]+ \d{1,2}, \d{4} \(UTC\)/.test(sourceText)) fail(file, "source line date");
}

function checkTables(main, file) {
  const tables = [...main.matchAll(/<table\b[\s\S]*?<\/table>/g)];
  for (const match of tables) {
    const table = match[0];
    const caption = table.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/);
    if (!caption || !visibleText(caption[1])) fail(file, "table missing caption");
    const heads = [...table.matchAll(/<th\b([^>]*)>/g)];
    if (!heads.length) fail(file, "table missing th");
    for (const head of heads) {
      if (!/\bscope="(?:col|row|colgroup|rowgroup)"/.test(head[1])) fail(file, "th missing scope");
    }
  }
}

function checkThirdParty(html, file) {
  if (html.includes("fonts.googleapis.com") || html.includes("fonts.gstatic.com")) {
    fail(file, "third-party font request");
  }
  for (const match of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const tag = match[0];
    const isScript = tag.slice(1, 7).toLowerCase() === "script";
    const isStyle = /rel="stylesheet"/i.test(tag);
    if (!isScript && !isStyle) continue;
    const src = tag.match(/\b(?:src|href)="([^"]+)"/);
    if (!src) continue;
    if (/^https?:\/\//.test(src[1]) && !src[1].startsWith(site)) fail(file, `third-party ${src[1]}`);
  }
}

const robots = readFileSync(join(dist, "robots.txt"), "utf8");
if (!/^User-agent:\s*\*\s*$/m.test(robots) || !/^Allow:\s*\/\s*$/m.test(robots)) {
  errors.push("robots.txt must allow all crawlers");
}
if (/^\s*Disallow:/m.test(robots)) errors.push("robots.txt must not disallow any path");

let pages = 0;
let blocks = 0;
for (const file of walk(dist)) {
  pages += 1;
  const html = readFileSync(file, "utf8");
  const pathname = pagePath(file);
  const expectedUrl = pathname === "/404.html" ? `${site}/404.html` : new URL(pathname, site).href;
  const req = requirements(pathname);
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*)<\/main>/);
  if (!mainMatch) {
    fail(file, "missing main");
    continue;
  }
  const main = mainMatch[1];
  if (req.answer) checkAnswer(main, file);
  else if (main.includes('class="answer"')) fail(file, "unexpected answer box");
  if (!req.source && main.includes('class="source-line"')) fail(file, "unexpected source line");
  checkTables(main, file);
  checkThirdParty(html, file);

  const found = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  blocks += found.length;
  if (!found.length && req.types.length) fail(file, "missing JSON-LD");
  const topTypes = new Set();
  for (const match of found) {
    let data;
    try {
      data = JSON.parse(match[1]);
    } catch (error) {
      fail(file, `JSON-LD parse: ${error.message}`);
      continue;
    }
    if (data["@context"] !== "https://schema.org" || !Array.isArray(data["@graph"])) {
      fail(file, "JSON-LD needs @context schema.org and @graph");
      continue;
    }
    const ctx = { file, expectedUrl, pageText: visibleText(main), allowedDates };
    for (const node of data["@graph"]) {
      for (const type of ownTypes(node)) topTypes.add(type);
      validateNode(node, ctx);
    }
  }
  for (const type of req.types) {
    if (!topTypes.has(type)) fail(file, `missing ${type}`);
  }
}

if (errors.length) {
  for (const error of errors.slice(0, 30)) console.error(error);
  if (errors.length > 30) console.error(`… and ${errors.length - 30} more`);
  console.error(`${errors.length} structured-data errors`);
  process.exit(1);
}

const summary = [...typeCounts.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([type, count]) => `${type} ${count}`)
  .join(", ");
console.log(`Structured data ok: ${pages} pages, ${blocks} JSON-LD blocks. ${summary}. FAQPage ${typeCounts.get("FAQPage") || 0}.`);

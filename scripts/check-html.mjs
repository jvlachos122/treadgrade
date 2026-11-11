import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HtmlValidate } from "html-validate";
import { gearLinks } from "../src/lib/affiliates.js";
import { catalog } from "../src/lib/catalog.js";
import { BANNED_LONG_WORD, LONG_TREADWEAR_PATH, longTreadwearReport } from "../src/lib/long-treadwear.js";
import { BANNED_RECALL_ADVICE, NHTSA_RECALLS_URL, RECALLS_PATH, TIN_LIMIT, USTMA_RECALL_LOOKUP_URL } from "../src/lib/recall-list.js";
import { BANNED_GRADE_WORD, GRADE_VARIES_ID, SIZE_VARIANCE_PATH, lineSizeVariance } from "../src/lib/size-variance.js";
import { BANNED_VERDICT, MILES_FORMULA, TREADWEAR_NUMBERS_PATH } from "../src/lib/treadwear-numbers.js";
import { BANNED_AGE_VERDICT, TIRE_AGE_PATH, TIRE_AGE_SOURCES, tireAgeRetrievedLabel } from "../src/lib/tire-age.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const site = "https://treadgrade.com";
const errors = [];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (entry.endsWith(".html")) files.push(path);
  }
  return files;
}

function publicPath(rel) {
  const path = rel.replaceAll("\\", "/");
  if (path === "/404.html") return "/404.html";
  if (path === "/index.html") return "/";
  if (path.endsWith("/index.html")) return path.slice(0, -"index.html".length);
  return path;
}

function expectedCanonical(file) {
  const rel = file.slice(dist.length).replaceAll("\\", "/");
  if (rel === "/404.html") return `${site}/404.html`;
  if (rel === "/index.html") return `${site}/`;
  if (rel.endsWith("/index.html")) return site + rel.slice(0, -"index.html".length);
  return site + rel;
}

function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ");
}

function redirectTarget(html) {
  const match = html.match(/<meta http-equiv="refresh" content="0;url=([^"]+)">/);
  return match ? match[1] : "";
}

const validator = new HtmlValidate({
  extends: ["html-validate:recommended"],
  elements: [
    "html5",
    {
      // Impact.com's site-verification tag uses value=, which is not a standard meta attribute.
      meta: {
        attributes: {
          value: {},
        },
      },
    },
  ],
  rules: {
    "long-title": "off",
    "no-trailing-whitespace": "off",
    "void-style": "off",
    "tel-non-breaking": "off",
    "prefer-native-element": "off",
    "no-inline-style": "off",
    "svg-focusable": "off",
    "script-type": "off",
    "wcag/h63": "off",
    "input-missing-label": "error",
    // A checkbox group shares one name so the query string can repeat it.
    "form-dup-name": ["error", { shared: ["radio", "button", "reset", "submit", "checkbox"] }],
  },
});

const linesByPath = new Map(catalog.lines.map((line) => [line.url, line]));
const longTreadwear = longTreadwearReport(catalog);
const gradeVariesId = `id="${GRADE_VARIES_ID}"`;
const gearHrefs = gearLinks().map((link) => link.href);
const gearPages = new Set(["/guides/utqg-grades/", "/guides/tire-pressure-and-roadside-kit/"]);

function hrefForms(href) {
  return new Set([href, href.replaceAll("&", "&amp;"), href.replaceAll("&", "&#38;"), href.replaceAll("&", "&#038;")]);
}

function checkGearPage(path, rel, html) {
  if (gearPages.has(path)) {
    const attrs = [...html.matchAll(/\bhref="([^"]*)"/g)].map((match) => match[1]);
    gearHrefs.forEach((href) => {
      if (!attrs.some((attr) => hrefForms(href).has(attr))) errors.push(`${rel}: gear href is not the Awin URL (${href})`);
    });
    const block = html.match(/<aside class="card" aria-labelledby="gear-heading">[\s\S]*?<\/aside>/);
    if (!block) errors.push(`${rel}: missing roadside gear block`);
    else {
      if (!block[0].includes('rel="sponsored nofollow noopener"')) errors.push(`${rel}: gear link rel`);
      if (/<(?:script|img)\b/i.test(block[0])) errors.push(`${rel}: gear block has a script or image`);
      const text = visibleText(block[0]);
      if (/\$|\bpsi\b|\brating\b|\bstars\b/i.test(text)) errors.push(`${rel}: gear block shows a price, spec, or rating`);
      if (!text.includes("AstroAI through the Awin network")) errors.push(`${rel}: gear disclosure`);
    }
    return;
  }
  if (html.includes("awin1.com")) errors.push(`${rel}: unexpected Awin URL`);
  if (path === "/affiliate-disclosure/") {
    if (!html.includes("an AstroAI link on TreadGrade is used.")) {
      errors.push(`${rel}: disclosure description`);
    }
    if (!html.includes("Those links go to AstroAI through the Awin network.")) {
      errors.push(`${rel}: disclosure does not name AstroAI through Awin`);
    }
    if (html.includes("Roadside-gear links to AstroAI through the Awin network are not configured.")) {
      errors.push(`${rel}: disclosure still says AstroAI links are off`);
    }
    if (!html.includes("No Awin script, tracking pixel, or image is loaded on this site.")) {
      errors.push(`${rel}: disclosure script sentence`);
    }
  }
  if (path === "/privacy/") {
    if (!html.includes("leaves this site for AstroAI through the Awin network.")) {
      errors.push(`${rel}: privacy does not name the AstroAI link`);
    }
    if (!html.includes("This site does not load an Awin script, tracking pixel, or image.")) {
      errors.push(`${rel}: privacy script sentence`);
    }
    if (html.includes("Roadside-gear links to AstroAI through Awin are off.")) {
      errors.push(`${rel}: privacy still says AstroAI links are off`);
    }
  }
  if (path === "/about/") {
    if (!html.includes("AstroAI roadside-gear links are labeled and disclosed. This site does not load an Awin script.")) {
      errors.push(`${rel}: about wording`);
    }
    if (html.includes("AstroAI gear links are off.")) errors.push(`${rel}: about still says AstroAI links are off`);
  }
}

const files = walk(dist);
for (const file of files) {
  const html = readFileSync(file, "utf8");
  const rel = file.slice(dist.length);
  if (!html.startsWith("<!DOCTYPE html>")) errors.push(`${rel}: missing doctype`);
  if (!/<html[^>]*\slang="en"/.test(html)) errors.push(`${rel}: missing lang`);
  const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)];
  if (titles.length !== 1 || !titles[0][1].trim()) errors.push(`${rel}: title`);
  const descriptions = [...html.matchAll(/<meta name="description" content="([^"]*)">/g)];
  if (descriptions.length !== 1 || descriptions[0][1].trim().length < 40) errors.push(`${rel}: description`);
  const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]+)">/g)];
  const refresh = redirectTarget(html);
  const selfCanonical = expectedCanonical(file);
  if (canonicals.length !== 1) errors.push(`${rel}: canonical ${canonicals[0]?.[1] ?? "missing"}`);
  else if (refresh) {
    if (canonicals[0][1] !== refresh) errors.push(`${rel}: redirect canonical ${canonicals[0][1]} != ${refresh}`);
    if (canonicals[0][1] === selfCanonical) errors.push(`${rel}: redirect canonical points at itself`);
    if (!html.includes('name="robots" content="noindex"')) errors.push(`${rel}: redirect missing noindex`);
    let targetPath = "";
    try {
      targetPath = new URL(refresh).pathname;
    } catch {
      errors.push(`${rel}: redirect target is not a URL`);
    }
    if (targetPath && !targetPath.endsWith("/")) errors.push(`${rel}: redirect target should use a trailing slash`);
  } else if (canonicals[0][1] !== selfCanonical) {
    errors.push(`${rel}: canonical ${canonicals[0][1]} != ${selfCanonical}`);
  }
  const h1 = html.match(/<h1\b/g) || [];
  if (h1.length !== 1) errors.push(`${rel}: ${h1.length} h1`);
  if (!html.includes('id="main"')) errors.push(`${rel}: main`);
  const path = publicPath(rel);
  if (path.startsWith("/plants/") && html.includes('content="noindex"')) errors.push(`${rel}: plant page is noindex`);
  if (path === "/compare/" || path.startsWith("/compare/")) {
    const banned = visibleText(html).match(/\b(best|better|winner|safest|popular)\b/i);
    if (banned) errors.push(`${rel}: banned word ${banned[1]}`);
  }
  if (path === TREADWEAR_NUMBERS_PATH) {
    const text = visibleText(html);
    const banned = text.match(BANNED_VERDICT);
    if (banned) errors.push(`${rel}: banned verdict ${banned[1]}`);
    const miles = text.match(MILES_FORMULA);
    if (miles) errors.push(`${rel}: treadwear-to-miles formula ${miles[0]}`);
    if (!text.includes("not a mileage promise")) errors.push(`${rel}: missing mileage caveat`);
    if (!html.includes('href="/ratings/"')) errors.push(`${rel}: missing ratings link`);
    if (!html.includes('href="/lists/highest-treadwear/"')) errors.push(`${rel}: missing highest-treadwear link`);
    if (!html.includes('href="/compare/"')) errors.push(`${rel}: missing compare link`);
    if (!html.includes('href="/methodology/"')) errors.push(`${rel}: missing methodology link`);
    if (!html.includes('href="/guides/utqg-grades/"')) errors.push(`${rel}: missing UTQG guide link`);
    if (!html.includes(`href="${SIZE_VARIANCE_PATH}"`)) errors.push(`${rel}: missing size-variance link`);
  }
  if (path === TIRE_AGE_PATH) {
    const text = visibleText(html);
    const banned = text.match(BANNED_AGE_VERDICT);
    if (banned) errors.push(`${rel}: banned age verdict ${banned[1]}`);
    const table = html.match(/<table\b[\s\S]*?<\/table>/);
    const body = table?.[0].match(/<tbody>([\s\S]*?)<\/tbody>/);
    const rows = body ? [...body[1].matchAll(/<tr\b[\s\S]*?<\/tr>/g)] : [];
    if (rows.length !== TIRE_AGE_SOURCES.length) errors.push(`${rel}: ${rows.length} position rows`);
    const retrieved = tireAgeRetrievedLabel(TIRE_AGE_SOURCES[0].retrieved);
    rows.forEach((row, index) => {
      const source = TIRE_AGE_SOURCES[index];
      if (!row[0].includes(`href="${source.url}"`)) errors.push(`${rel}: row ${index} missing ${source.url}`);
      if (!row[0].includes(retrieved)) errors.push(`${rel}: row ${index} missing retrieval date`);
      if (!row[0].includes(source.organisation)) errors.push(`${rel}: row ${index} missing organisation`);
    });
    for (const href of ["/decoder/", "/guides/tire-date-code/", "/guides/dot-code/#age", "/recalls/", "/methodology/"]) {
      if (!html.includes(`href="${href}"`) && !html.includes(`href="${href.split("#")[0]}`)) {
        errors.push(`${rel}: missing ${href}`);
      }
    }
    if (!html.includes('href="/decoder/?tin=2319"')) errors.push(`${rel}: missing 2319 decoder link`);
  }
  if (path === SIZE_VARIANCE_PATH) {
    const banned = visibleText(html).match(BANNED_GRADE_WORD);
    if (banned) errors.push(`${rel}: banned word ${banned[1]}`);
  }
  if (path === LONG_TREADWEAR_PATH) {
    const text = visibleText(html);
    const banned = text.match(BANNED_LONG_WORD);
    if (banned) errors.push(`${rel}: banned word ${banned[1]}`);
    if (!text.includes("assigned by the manufacturer")) errors.push(`${rel}: missing manufacturer-assigned caveat`);
    if (!text.includes("some sizes") && longTreadwear.someSizesCount) errors.push(`${rel}: missing some-sizes flag`);
    const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    const rows = body ? [...body[1].matchAll(/<tr\b/g)] : [];
    if (rows.length !== longTreadwear.lineCount) errors.push(`${rel}: ${rows.length} table rows`);
    for (const href of ["/guides/treadwear-numbers/", "/guides/utqg-grades/", "/lists/highest-treadwear/", "/guides/", "/ratings/"]) {
      if (!html.includes(`href="${href}"`)) errors.push(`${rel}: missing ${href}`);
    }
    const hrefs = [...html.matchAll(/\bhref="([^"]*)"/g)].map((match) => match[1].replaceAll("&amp;", "&").replaceAll("&#38;", "&"));
    if (
      !hrefs.some(
        (href) =>
          href.startsWith("/ratings/?") &&
          href.includes("wearMin=700") &&
          href.includes("traction=AA") &&
          href.includes("traction=A") &&
          href.includes("temp=A"),
      )
    ) {
      errors.push(`${rel}: missing ratings filter link`);
    }
    for (const entry of longTreadwear.lines) {
      if (!html.includes(`href="${entry.line.url}"`)) errors.push(`${rel}: missing tire line ${entry.line.url}`);
    }
  }
  if (path === RECALLS_PATH) {
    const main = html.match(/<main\b[^>]*>([\s\S]*)<\/main>/);
    const authored = (main ? main[1] : html)
      .replace(/<p\b[^>]*\bdata-source-names\b[^>]*>[\s\S]*?<\/p>/gi, " ")
      .replace(/<tbody\b[\s\S]*?<\/tbody>/gi, " ");
    const text = visibleText(authored);
    const banned = text.match(BANNED_RECALL_ADVICE);
    if (banned) errors.push(`${rel}: banned advice ${banned[1]}`);
    if (!text.includes(TIN_LIMIT)) errors.push(`${rel}: missing TIN limit`);
    if (/this list is authoritative/i.test(text)) errors.push(`${rel}: claims the list is authoritative`);
    if (!html.includes(USTMA_RECALL_LOOKUP_URL)) errors.push(`${rel}: missing USTMA lookup link`);
    if (!html.includes(NHTSA_RECALLS_URL)) errors.push(`${rel}: missing NHTSA recalls link`);
    if (!html.includes('href="/decoder/"')) errors.push(`${rel}: missing decoder link`);
  }
  const gradeLine = linesByPath.get(path);
  if (gradeLine && !refresh) {
    const expected = lineSizeVariance(gradeLine).show;
    const present = html.includes(gradeVariesId);
    if (present !== expected) errors.push(`${rel}: grade-varies note is ${present ? "shown" : "hidden"}`);
  }
  if (!refresh && rel !== "/404.html" && html.includes('content="noindex"')) errors.push(`${rel}: unexpected noindex`);
  if (rel === "/404.html" && !html.includes('content="noindex"')) errors.push("404 should be noindex");
  if (rel === "/404.html" && refresh) errors.push("404 should not refresh");
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const src = match[1].match(/\bsrc\s*=\s*"([^"]*)"/i);
    if (!src) continue;
    const value = src[1];
    if (/^(?:https?:)?\/\//i.test(value) && !value.startsWith(site)) {
      errors.push(`${rel}: third-party script ${value}`);
    }
  }
  if (/<(?:script|img|iframe|noscript)\b[^>]*(?:awin|astroai)/i.test(html)) {
    errors.push(`${rel}: third-party AstroAI or Awin tag`);
  }
  checkGearPage(path, rel, html);
}

let reported = 0;
for (const file of files) {
  const report = await validator.validateFile(file);
  if (report.valid) continue;
  for (const result of report.results) {
    for (const message of result.messages) {
      if (message.severity < 2) continue;
      reported += 1;
      if (reported <= 30) errors.push(`${file.slice(dist.length)}:${message.line} ${message.ruleId} ${message.message}`);
    }
  }
}

if (errors.length) {
  console.error(errors.slice(0, 40).join("\n"));
  console.error(`${errors.length} HTML problems`);
  process.exit(1);
}
console.log(`HTML OK across ${files.length} files.`);

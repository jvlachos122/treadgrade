import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { catalog } from "../src/lib/catalog.js";
import { includeInSitemap } from "../src/lib/sitemap.js";
import { nhtsaWeekRange } from "../src/lib/tin.js";
import {
  BANNED_AGE_VERDICT,
  TIRE_AGE_EXAMPLE,
  TIRE_AGE_PATH,
  TIRE_AGE_RETRIEVED,
  TIRE_AGE_SOURCES,
  dateCodeExample,
  otherSourceSentence,
  positionsCaption,
  quotedPosition,
  tireAgeAnswer,
  tireAgeFaqs,
  tireAgeJsonLd,
  tireAgeRetrievedLabel,
  tireAgeSourceLine,
  tireAgeText,
} from "../src/lib/tire-age.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(root, "src/pages/guides/tire-age.astro"), "utf8");

function assertNoVerdict(text, where) {
  const match = BANNED_AGE_VERDICT.exec(text);
  assert.equal(match?.[0] || "", "", where);
}

function pageFile(urlPath) {
  const path = urlPath.split("#")[0].split("?")[0];
  if (path === "/") return join(root, "src/pages/index.astro");
  const rel = path.replace(/^\//, "").replace(/\/$/, "");
  const file = join(root, "src/pages", `${rel}.astro`);
  const index = join(root, "src/pages", rel, "index.astro");
  if (existsSync(file)) return file;
  if (existsSync(index)) return index;
  return "";
}

test("every published position has a page, a quote, and a retrieval date", () => {
  assert.ok(TIRE_AGE_SOURCES.length >= 2);
  const urls = new Set();
  const quotes = [];
  for (const source of TIRE_AGE_SOURCES) {
    assert.ok(source.organisation, source.id);
    assert.ok(source.pageLabel, source.id);
    assert.match(source.url, /^https:\/\//, source.id);
    assert.equal(source.retrieved, TIRE_AGE_RETRIEVED, source.id);
    assert.match(tireAgeRetrievedLabel(source.retrieved), /^[A-Z][a-z]+ \d{1,2}, \d{4}$/, source.id);
    assert.ok(source.quotes.length, source.id);
    for (const quote of source.quotes) {
      assert.equal(quote.trim(), quote, source.id);
      assert.match(quote, /[.!?)]["']?$/, source.id);
      quotes.push(quote);
    }
    const cell = quotedPosition(source);
    for (const quote of source.quotes) assert.ok(cell.includes(`"${quote}"`), source.id);
    assert.equal(urls.has(source.url), false, source.url);
    urls.add(source.url);
    assert.doesNotMatch(`${source.url} ${source.pageLabel}`, /thetiremarks|amazon|astroai|awin/i, source.id);
  }
  const joined = quotes.join("\n");
  for (const phrase of [
    "six to 10 years",
    "every six years",
    "calendar age alone",
    "ten years after their date of manufacture",
    "After five years of service",
    "after five (5) years of use",
    "more than ten (10) years previous",
    "more than ten years ago",
    "any tire in service",
    "6 years or more",
    "6 years or more past the date of manufacture",
    "10 years or more past this date",
    "within 2, 3 or even 4 years from the date of manufacture",
    "total limit of 4 years",
    "often sold",
  ]) {
    assert.ok(joined.includes(phrase), phrase);
  }
  assert.match(joined, /in service/i);
  assert.match(joined, /manufacture/i);
});

test("the answer names the difference, the page count, and the retrieval date", () => {
  const answers = tireAgeAnswer();
  assert.equal(answers.length, 2);
  const text = answers.join(" ");
  assert.match(text, /differ/);
  assert.match(text, new RegExp(`\\b${TIRE_AGE_SOURCES.length}\\b`));
  assert.match(text, new RegExp(tireAgeRetrievedLabel()));
  assert.match(text, /manufacture date/);
  assert.match(text, /time in service/);
  assert.match(text, /retailer sells/);
  for (const sentence of answers) assert.match(sentence, /[.!?]$/);
  assert.match(tireAgeSourceLine(), /^Source: NHTSA /);
  assert.match(tireAgeSourceLine(), /last updated [A-Z][a-z]+ \d{1,2}, \d{4} \(UTC\)/);
  assert.match(positionsCaption(), new RegExp(tireAgeRetrievedLabel()));
  assert.match(otherSourceSentence(), /Each row links to the page/);
  assertNoVerdict(tireAgeText(), "guide copy");
  assertNoVerdict(page, "page source");
});

test("2319 follows the decoder week rule", () => {
  const example = dateCodeExample();
  const range = nhtsaWeekRange(2019, 23);
  assert.equal(example.code, TIRE_AGE_EXAMPLE);
  assert.equal(example.code, "2319");
  assert.equal(example.week, 23);
  assert.equal(example.year, 2019);
  assert.equal(example.validWeek, true);
  assert.equal(example.start, range.start);
  assert.equal(example.end, range.end);
  assert.equal(example.start, "2019-06-09");
  assert.equal(example.end, "2019-06-15");
  assert.match(example.sentence, /week 23 of 2019/);
  assert.match(example.sentence, /Sunday, June 9, 2019/);
  assert.match(example.sentence, /Saturday, June 15, 2019/);
  const faqs = tireAgeFaqs(example);
  assert.equal(faqs.length, 4);
  assert.ok(faqs.some((item) => item.text.includes(example.sentence)));
  for (const item of faqs) {
    assert.match(item.name, /\?$/);
    assert.match(item.text, /[.!?]$/);
    assertNoVerdict(`${item.name} ${item.text}`, item.name);
  }
  const nodes = tireAgeJsonLd({
    description: tireAgeAnswer().join(" "),
    dateModified: catalog.meta.verifiedAt,
    faqs,
  });
  assert.deepEqual(
    nodes.map((node) => node["@type"]),
    ["Article", "FAQPage"],
  );
  assert.equal(nodes[0].dateModified, catalog.meta.verifiedAt);
  assert.equal(nodes[0].mainEntityOfPage, `https://treadgrade.com${TIRE_AGE_PATH}`);
  assert.deepEqual(
    nodes[1].mainEntity.map((item) => item.acceptedAnswer.text),
    faqs.map((item) => item.text),
  );
  assert.doesNotMatch(JSON.stringify(nodes), /Product|Review|AggregateRating/);
});

test("the guide is in the sitemap and its internal links resolve", () => {
  assert.equal(TIRE_AGE_PATH, "/guides/tire-age/");
  assert.equal(includeInSitemap(TIRE_AGE_PATH, new Set()), true);
  assert.equal(includeInSitemap(`https://treadgrade.com${TIRE_AGE_PATH}`, new Set()), true);
  assert.equal(includeInSitemap(TIRE_AGE_PATH, new Set([TIRE_AGE_PATH])), false);
  assert.match(readFileSync(join(root, "scripts/check-links.mjs"), "utf8"), /TIRE_AGE_PATH/);
  assert.match(page, /<table>/);
  assert.match(page, /<caption>/);
  assert.match(page, /source\.url/);
  assert.match(page, /tireAgeRetrievedLabel/);
  assert.match(page, /quotedPosition/);
  assert.match(page, /<Answer /);
  assert.match(page, /class="source-line"/);
  assert.match(page, /id="what-we-dont-know"/);
  assert.match(page, /unknownSectionSentences/);
  assert.match(tireAgeText(), /not advice about a particular tire/);
  assert.doesNotMatch(page, /amazon|astroai|awin|thetiremarks|affiliate/i);

  const hrefs = new Set([...page.matchAll(/href="([^"]+)"/g)].map((match) => match[1]));
  for (const match of page.matchAll(/href:\s*"([^"]+)"/g)) hrefs.add(match[1]);
  hrefs.add(TIRE_AGE_PATH);
  if (page.includes("/decoder/?tin=${example.code}")) hrefs.add(`/decoder/?tin=${TIRE_AGE_EXAMPLE}`);
  const allowed = new Set([
    "/",
    "/guides/",
    "/guides/tire-age/",
    "/guides/tire-date-code/",
    "/guides/dot-code/",
    "/guides/dot-code/#age",
    "/decoder/",
    `/decoder/?tin=${TIRE_AGE_EXAMPLE}`,
    "/recalls/",
    "/methodology/",
  ]);
  assert.ok(hrefs.size >= 8);
  for (const href of hrefs) {
    assert.ok(allowed.has(href), href);
    const file = pageFile(href);
    assert.ok(file, href);
    if (href.includes("#")) {
      const id = href.split("#")[1];
      assert.match(readFileSync(file, "utf8"), new RegExp(`id="${id}"`), href);
    }
  }

  for (const file of [
    "src/pages/guides/index.astro",
    "src/components/Footer.astro",
    "src/pages/guides/tire-date-code.astro",
    "src/pages/guides/dot-code.astro",
    "src/pages/decoder.astro",
  ]) {
    assert.match(readFileSync(join(root, file), "utf8"), /\/guides\/tire-age\//, file);
  }
});

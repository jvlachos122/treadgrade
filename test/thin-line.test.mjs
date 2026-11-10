import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { lineAnswer } from "../src/lib/answers.js";
import { buildCatalog, nameKey } from "../src/lib/normalize.js";
import { recallRowsForLine } from "../src/lib/compare.js";
import { summarizeRecallRows } from "../src/lib/recalls.js";
import { MILES_FORMULA } from "../src/lib/treadwear-numbers.js";
import {
  THIN_LINK_LIMIT,
  buildThinIndex,
  describeThinLine,
  isThinLine,
  parsePublishedSize,
  sizeTextKey,
} from "../src/lib/thin-line.js";

const BANNED = /\b(best|better|winner|safest|popular)\b/i;

function makeRow(partial) {
  const wear = partial.wear == null ? null : String(partial.wear);
  return {
    id: partial.id,
    size: partial.size,
    wear,
    wearN: wear != null && /^\d+$/.test(wear) ? Number(wear) : null,
    trac: partial.trac,
    temp: partial.temp,
    construction: partial.construction || "Radial",
    complaintsCount: partial.complaintsCount || 0,
    recallsCount: partial.recallsCount || 0,
    investigationsCount: partial.investigationsCount || 0,
    manufacturerCommunicationsCount: partial.manufacturerCommunicationsCount || 0,
  };
}

function makeLine({ brand, slug, line, lineSlug, rows }) {
  return {
    brand,
    brandSlug: slug,
    line,
    lineSlug,
    lineKey: nameKey(line),
    sameName: [],
    url: `/tires/${slug}/${lineSlug}/`,
    rows: rows.map((row, index) => makeRow({ ...row, id: row.id ?? index + 1 })),
  };
}

function indexFor(lines, { recalls = [], plants = [] } = {}) {
  return buildThinIndex(lines, { plants, recallSummary: summarizeRecallRows(recalls) });
}

test("a published size is read once, and an all-sizes label is not a size", () => {
  assert.deepEqual(parsePublishedSize("195/65R15 91H"), { kind: "metric", token: "195/65R15" });
  assert.deepEqual(parsePublishedSize("P235/70 R 16 104 T"), { kind: "metric", token: "P235/70R16" });
  assert.deepEqual(parsePublishedSize("215/60R16 H-speed (OE)"), { kind: "metric", token: "215/60R16" });
  assert.deepEqual(parsePublishedSize("31X10.50 R15LT"), { kind: "flotation", token: "31X10.50R15" });
  assert.equal(parsePublishedSize("All sizes"), null);
  assert.equal(parsePublishedSize("195/65R15 205/55R16"), null);
  assert.equal(sizeTextKey("All sizes"), "");
  assert.equal(sizeTextKey("ALL SIZES"), "");
  assert.equal(sizeTextKey("H, V"), "");
  assert.equal(sizeTextKey("195/65R15"), "");
  assert.equal(sizeTextKey("14 & 15"), "14&15");
  assert.equal(sizeTextKey("14& 15"), "14&15");
});

test("one grade row is thin, and a second row is not", () => {
  const thin = makeLine({ brand: "Acme", slug: "acme", line: "Alpha", lineSlug: "alpha", rows: [{ size: "All sizes", wear: "100", trac: "A", temp: "A" }] });
  const wide = makeLine({
    brand: "Acme",
    slug: "acme",
    line: "Epsilon",
    lineSlug: "epsilon",
    rows: [
      { size: "15", wear: "200", trac: "A", temp: "A" },
      { size: "16", wear: "400", trac: "A", temp: "A" },
    ],
  });
  assert.equal(isThinLine(thin), true);
  assert.equal(isThinLine(wide), false);
  assert.equal(describeThinLine(wide, indexFor([thin, wide])), null);
});

test("ranks, size groups, recalls, and plants use only comparable published values", () => {
  const alpha = makeLine({
    brand: "Acme",
    slug: "acme",
    line: "Alpha",
    lineSlug: "alpha",
    rows: [{ id: 1, size: "All sizes", wear: "100", trac: "A", temp: "A" }],
  });
  const beta = makeLine({
    brand: "Acme",
    slug: "acme",
    line: "Beta",
    lineSlug: "beta",
    rows: [{ id: 22, size: "All sizes", wear: "300", trac: "AA", temp: "A" }],
  });
  const gamma = makeLine({
    brand: "Acme",
    slug: "acme",
    line: "Gamma",
    lineSlug: "gamma",
    rows: [{ id: 3, size: "195/65R15 91H", wear: "300", trac: "A", temp: "B", complaintsCount: 2 }],
  });
  const delta = makeLine({
    brand: "Acme",
    slug: "acme",
    line: "Delta",
    lineSlug: "delta",
    rows: [{ id: 4, size: "P195/65R15", wear: "500", trac: "A", temp: "A" }],
  });
  const epsilon = makeLine({
    brand: "Acme",
    slug: "acme",
    line: "Epsilon",
    lineSlug: "epsilon",
    rows: [
      { id: 5, size: "15", wear: "200", trac: "A", temp: "A" },
      { id: 6, size: "16", wear: "400", trac: "A", temp: "A" },
    ],
  });
  const zeta = makeLine({
    brand: "Acme",
    slug: "acme",
    line: "Zeta",
    lineSlug: "zeta",
    rows: [{ id: 7, size: "All sizes", wear: null, trac: "A", temp: "A" }],
  });
  const hotelRoad = makeLine({
    brand: "Hotel",
    slug: "hotel",
    line: "Road",
    lineSlug: "road",
    rows: [{ id: 8, size: "195/65R15", wear: "300", trac: "A", temp: "A" }],
  });
  const hotelOther = makeLine({
    brand: "Hotel",
    slug: "hotel",
    line: "Other",
    lineSlug: "other",
    rows: [{ id: 9, size: "195/65R16", wear: "100", trac: "A", temp: "A" }],
  });
  const inn = makeLine({
    brand: "Inn",
    slug: "inn",
    line: "Pace",
    lineSlug: "pace",
    rows: [{ id: 10, size: "195/65 R 15", wear: "400", trac: "A", temp: "A" }],
  });
  const lines = [alpha, beta, gamma, delta, epsilon, zeta, hotelRoad, hotelOther, inn];
  const recalls = [
    {
      brand: "Acme",
      line: "Beta",
      filer: "Acme Tire",
      manufacturers: ["Acme Tire"],
      campaign: "10T001000",
      reportDate: "2020-01-15",
      units: 1200,
    },
  ];
  const plants = [
    {
      code: "1AB",
      slug: "1ab",
      name: "Acme Tire",
      city: "Akron",
      country: "United States",
      status: "Active",
      url: "/plants/1ab/",
    },
  ];
  const index = indexFor(lines, { recalls, plants });
  const betaReport = describeThinLine(beta, index);
  const alphaReport = describeThinLine(alpha, index);
  const gammaReport = describeThinLine(gamma, index);
  const deltaReport = describeThinLine(delta, index);
  const innReport = describeThinLine(inn, index);

  assert.equal(
    betaReport.comparisonSentence,
    "Among 4 Acme lines with one usable treadwear number, treadwear 300 ranks 2 of 4 when a higher number is ordered first.",
  );
  assert.match(betaReport.brand.text, /For Acme Beta, among 4 Acme lines/);
  assert.match(betaReport.brand.text, /1 line lists a higher number, 2 lines list 300, including this line, and 1 line lists a lower number, which is 25\.0% of the 4/);
  assert.match(betaReport.brand.text, /1 line lists more than one usable treadwear number and 1 line lists no usable treadwear number/);
  assert.match(betaReport.tractionText, /lists AA/);
  assert.match(betaReport.tractionText, /0 lines list a grade ordered before AA/);
  assert.match(betaReport.tractionText, /The order is AA, then A, then B, then C/);
  assert.match(betaReport.fileText, /ranks 3 of 7/);
  assert.match(betaReport.fileText, /Grades from different brands are only loosely comparable/);
  assert.match(betaReport.size.text, /None grouped by size for Acme Beta/);
  assert.match(betaReport.size.text, /All sizes/);
  assert.equal(betaReport.peerLinks.length, 0);
  assert.deepEqual(
    betaReport.siblingLinks.map((item) => item.href),
    [
      "/tires/acme/gamma/",
      "/tires/acme/alpha/",
      "/tires/acme/delta/",
      "/tires/acme/epsilon/",
      "/tires/acme/zeta/",
    ],
  );
  assert.equal(betaReport.compareHref, "/compare/?lines=acme/beta,acme/gamma");
  assert.match(betaReport.recall.text, /10T001000/);
  assert.match(betaReport.recall.text, /January 15, 2020/);
  assert.match(betaReport.recall.text, /1,200 units, made by Acme Tire/);
  assert.match(betaReport.recall.text, /0 complaints/);
  assert.match(betaReport.recall.text, /ratings row id is 22/);
  assert.match(betaReport.recall.text, /not a safety finding/);
  assert.doesNotMatch(betaReport.recall.text, /None found in the tire-recall file/);
  assert.equal(betaReport.plantRows.length, 1);
  assert.equal(betaReport.plantRows[0].code, "1AB");
  assert.match(betaReport.plantText, /does not say the plant made the line/);
  assert.deepEqual(betaReport.sources, ["ratings", "recalls", "plants"]);

  assert.match(alphaReport.recall.text, /None found in the tire-recall file for Acme Alpha/);
  assert.equal(alphaReport.plantRows.length, 0);
  assert.match(alphaReport.plantText, /None found/);
  assert.doesNotMatch(alphaReport.plantText, /1AB/);
  assert.match(alphaReport.brand.text, /ranks 4 of 4/);
  assert.match(alphaReport.brand.text, /0\.0% of the 4/);

  assert.match(gammaReport.intro, /The size read from that text is 195\/65R15/);
  assert.match(gammaReport.size.text, /ranks 2 of 3/);
  assert.match(gammaReport.size.text, /from 3 brands/);
  assert.match(gammaReport.recall.text, /2 complaints/);
  assert.deepEqual(
    gammaReport.peerLinks.map((item) => item.href),
    ["/tires/hotel/road/", "/tires/inn/pace/"],
  );
  assert.equal(gammaReport.sameSizeLinks.length, 0);
  assert.match(deltaReport.size.text, /only line with one usable treadwear number on P195\/65R15/);
  assert.equal(deltaReport.peerLinks.length, 0);

  assert.match(innReport.comparisonSentence, /lines in NHTSA's published UTQG list/);
  assert.match(innReport.comparisonSentence, /ranks 2 of 7/);
  assert.match(gammaReport.temperatureText, /lists B/);
  assert.match(gammaReport.temperatureText, /The order is A, then B, then C/);

  for (const report of [alphaReport, betaReport, gammaReport, deltaReport, innReport]) {
    assert.equal(report.faqs.length, 4);
    assert.ok(report.faqs.every((item) => item.name.endsWith("?")));
    assert.equal(report.faqs[2], report.recall);
    assert.doesNotMatch(report.comparisonSentence, /\bhighest\b/i);
    assert.doesNotMatch([report.intro, report.brand.text, report.size.text, report.recall.text, report.meaningText].join(" "), BANNED);
    assert.doesNotMatch(report.meaningText, MILES_FORMULA);
  }

  const answers = lineAnswer(beta, { comparison: betaReport.comparisonSentence });
  assert.equal(answers.length, 3);
  assert.match(answers[1], /ranks 2 of 4/);
});

test("the same size text groups after spaces are removed, and a list stops at the limit", () => {
  const left = makeLine({
    brand: "Acme",
    slug: "acme",
    line: "Left",
    lineSlug: "left",
    rows: [{ size: "14 & 15", wear: "200", trac: "A", temp: "A" }],
  });
  const right = makeLine({
    brand: "Other",
    slug: "other",
    line: "Right",
    lineSlug: "right",
    rows: [{ size: "14& 15", wear: "400", trac: "A", temp: "A" }],
  });
  const report = describeThinLine(left, indexFor([left, right]));
  assert.match(report.size.text, /ranks 2 of 2/);
  assert.equal(report.peerLinks.length, 1);
  assert.match(report.peerLinks[0].label, /Other Right, treadwear 400/);

  const many = [left];
  for (let n = 0; n < THIN_LINK_LIMIT + 2; n += 1) {
    many.push(
      makeLine({
        brand: "Acme",
        slug: "acme",
        line: `Extra ${n}`,
        lineSlug: `extra-${n}`,
        rows: [{ size: "All sizes", wear: String(220 + n), trac: "A", temp: "A" }],
      }),
    );
  }
  const limited = describeThinLine(left, indexFor(many));
  assert.equal(limited.siblingLinks.length, THIN_LINK_LIMIT);
  assert.match(limited.siblingText, new RegExp(`^${THIN_LINK_LIMIT} of ${many.length - 1} other Acme lines`));
});

test("a recall with no matching registrant does not invent a plant", () => {
  const line = makeLine({
    brand: "Acme",
    slug: "acme",
    line: "Quiet",
    lineSlug: "quiet",
    rows: [{ size: "All sizes", wear: "400", trac: "A", temp: "A" }],
  });
  const report = describeThinLine(
    line,
    indexFor([line], {
      recalls: [
        {
          brand: "Acme",
          line: "Quiet",
          filer: "Other Rubber",
          manufacturers: ["Other Rubber"],
          campaign: "11T009000",
          reportDate: "2011-05-02",
          units: 10,
        },
      ],
      plants: [
        {
          code: "9ZZ",
          slug: "9zz",
          name: "Unrelated Tire",
          city: "Akron",
          country: "United States",
          status: "Active",
          url: "/plants/9zz/",
        },
      ],
    }),
  );
  assert.match(report.recall.text, /11T009000/);
  assert.match(report.recall.text, /made by Other Rubber/);
  assert.equal(report.plantRows.length, 0);
  assert.match(report.plantText, /None found/);
  assert.deepEqual(report.sources, ["ratings", "recalls"]);
});

test("committed thin lines stay inside the published counts", () => {
  const ratings = JSON.parse(readFileSync("data/ratings.json", "utf8"));
  const plants = JSON.parse(readFileSync("data/plants.json", "utf8"));
  const recalls = JSON.parse(readFileSync("data/recalls.json", "utf8"));
  const meta = JSON.parse(readFileSync("data/meta.json", "utf8"));
  const catalog = buildCatalog(ratings, plants, meta);
  const summary = summarizeRecallRows(recalls);
  const index = buildThinIndex(catalog.lines, { plants: catalog.plants, recallSummary: summary });
  const thin = catalog.lines.filter(isThinLine);
  assert.equal(thin.length, catalog.lines.filter((line) => line.rows.length === 1).length);
  assert.ok(thin.length > 0);

  for (const line of catalog.lines) {
    const report = describeThinLine(line, index);
    if (!isThinLine(line)) {
      assert.equal(report, null);
      continue;
    }
    const matched = recallRowsForLine(line, summary);
    assert.equal(report.faqs.length, 4);
    for (const faq of report.faqs) {
      assert.equal(faq.text, faq.text.replace(/\s+/g, " ").trim(), faq.name);
      assert.equal(faq.name, faq.name.replace(/\s+/g, " ").trim(), faq.name);
      assert.ok(faq.text.includes(line.brand), faq.name);
      assert.ok(faq.text.includes(line.line.replace(/\s+/g, " ").trim()), faq.name);
    }
    if (line.rows[0].wearN > 0) {
      assert.match(report.comparisonSentence, /ranks [\d,]+ of [\d,]+/);
      assert.doesNotMatch(report.comparisonSentence, /\bhighest\b/);
    } else {
      assert.equal(report.comparisonSentence, "");
    }
    if (matched.length) {
      assert.doesNotMatch(report.recall.text, /None found in the tire-recall file/);
      for (const row of matched) assert.ok(report.recall.text.includes(row.campaign));
    } else {
      assert.match(report.recall.text, /None found in the tire-recall file/);
      assert.equal(report.plantRows.length, 0);
    }
    assert.match(report.recall.text, /not a safety finding/);
    assert.equal(report.sources.includes("plants"), report.plantRows.length > 0);
    assert.ok(report.sources.includes("recalls"));
    assert.ok(report.siblingLinks.every((item) => item.href !== line.url));
    assert.ok(report.peerLinks.every((item) => !item.href.includes(`/${line.brandSlug}/`)));
    const rank = report.brand.text.match(/ranks ([\d,]+) of ([\d,]+)/);
    if (rank) {
      const place = Number(rank[1].replaceAll(",", ""));
      const total = Number(rank[2].replaceAll(",", ""));
      assert.ok(place >= 1 && place <= total);
    }
    let prose = [
      report.intro,
      report.comparisonSentence,
      report.brand.text,
      report.tractionText,
      report.temperatureText,
      report.fileText,
      report.size.text,
      report.siblingText,
      report.peerText,
      report.sameSizeText,
      report.recall.text,
      report.plantText,
      report.meaningText,
      report.grades.text,
      ...report.faqs.map((item) => item.name),
    ].join(" ");
    prose = prose.split(line.brand).join(" ").split(line.line).join(" ").split(line.rows[0].size).join(" ");
    for (const row of matched) {
      prose = prose.split(row.filer).join(" ");
      prose = prose.split(row.campaign).join(" ");
      for (const name of row.manufacturers || []) prose = prose.split(name).join(" ");
    }
    assert.doesNotMatch(prose, BANNED, line.url);
    assert.doesNotMatch(prose, MILES_FORMULA, line.url);
  }
});

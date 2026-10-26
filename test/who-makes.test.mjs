import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { whoMakesBrandAnswer } from "../src/lib/answers.js";
import { buildCatalog, nameKey } from "../src/lib/normalize.js";
import { sameCompany, summarizeRecallRows } from "../src/lib/recalls.js";
import {
  WHO_MAKES_CANDIDATES,
  buildWhoMakesPages,
  plantsMatchingFilings,
  unansweredBrands,
} from "../src/lib/who-makes.js";

const catalog = buildCatalog(
  JSON.parse(readFileSync("data/ratings.json", "utf8")),
  JSON.parse(readFileSync("data/plants.json", "utf8")),
  JSON.parse(readFileSync("data/meta.json", "utf8")),
);
const summary = summarizeRecallRows(JSON.parse(readFileSync("data/recalls.json", "utf8")));
const sources = {
  summary,
  brands: catalog.brands,
  lines: catalog.lines,
  plants: catalog.plants,
};
const live = buildWhoMakesPages(WHO_MAKES_CANDIDATES, sources);
const whoMakesPages = live.pages;
const whoMakesSkipped = live.skipped;
const whoMakesUnanswered = [...live.skipped, ...unansweredBrands(["Kirkland"], sources, live.skipped)];

function assertSentences(sentences, where) {
  assert.ok(sentences.length >= 1 && sentences.length <= 3, `${where}: ${sentences.length} sentences`);
  for (const sentence of sentences) {
    assert.match(sentence, /[.!?]$/, `${where}: ${sentence}`);
    assert.doesNotMatch(sentence, /\bthe best\b/i, sentence);
    assert.doesNotMatch(sentence, /\bmade by\b/i, sentence);
  }
}

test("demand brands map to recall filers, or are skipped with a reason", () => {
  assert.deepEqual(
    [...WHO_MAKES_CANDIDATES],
    ["Ironman", "Douglas", "Milestar", "Kelly", "Westlake", "Sailun", "Atlas", "Cosmo"],
  );
  assert.deepEqual(
    whoMakesPages.map((page) => page.key),
    ["milestar", "kelly", "sailun"],
  );
  assert.deepEqual(
    whoMakesSkipped.map((item) => item.key),
    ["ironman", "douglas", "westlake", "atlas", "cosmo"],
  );

  for (const page of whoMakesPages) {
    const entry = summary.byBrand.get(page.key);
    assert.ok(entry, page.key);
    assert.equal(nameKey(page.name), page.key);
    assert.equal(page.url, `/who-makes/${page.slug}/`);
    assert.deepEqual(page.filers, entry.filers);
    assert.equal(page.rows.length, entry.rows.length);
    const rowFilers = [];
    for (const row of page.rows) {
      assert.equal(nameKey(row.brand), page.key);
      assert.ok(page.filers.includes(row.filer), row.filer);
      if (!rowFilers.includes(row.filer)) rowFilers.push(row.filer);
    }
    assert.deepEqual(page.filers, rowFilers);
    for (const plant of page.plants) {
      assert.equal(sameCompany(plant.name, plant.matchedCompany), true, plant.code);
      const onARow = page.rows.some(
        (row) =>
          sameCompany(row.filer, plant.matchedCompany) ||
          (row.manufacturers || []).some((manufacturer) => sameCompany(manufacturer, plant.matchedCompany)),
      );
      assert.equal(onARow, true, plant.code);
      assert.ok(plant.url.startsWith("/plants/"));
    }
    const sentences = whoMakesBrandAnswer(page);
    assertSentences(sentences, page.url);
    assert.match(sentences[0], new RegExp(`^${page.name} tires: NHTSA recall reports list `));
    assert.match(sentences[0], /filing manufacturer/);
    for (const filer of page.filers) assert.ok(sentences[0].includes(filer), filer);
    for (const row of page.rows) assert.match(sentences[1], new RegExp(row.campaign));
    assert.match(sentences.join(" "), /legally responsible/);
    assert.match(sentences.join(" "), /only the recalled line/);
  }

  const kelly = whoMakesPages.find((page) => page.key === "kelly");
  assert.deepEqual(kelly.filers, ["Goodyear Tire & Rubber Company", "Sumitomo Rubber USA, LLC"]);
  assert.deepEqual(
    [...new Set(kelly.rows.map((row) => row.campaign))].sort(),
    ["17T001000", "22T010000"],
  );
  const goodyearPlant = kelly.plants.find((plant) => plant.code === "1M6");
  const industriesPlant = kelly.plants.find((plant) => plant.code === "1U2");
  const usaPlant = kelly.plants.find((plant) => plant.code === "1DA");
  assert.equal(goodyearPlant.role, "filer");
  assert.equal(goodyearPlant.matchedCompany, "Goodyear Tire & Rubber Company");
  assert.equal(industriesPlant.role, "manufacturer");
  assert.equal(industriesPlant.matchedCompany, "Sumitomo Rubber Industries, Ltd.");
  assert.equal(usaPlant.role, "filer");
  assert.equal(usaPlant.matchedCompany, "Sumitomo Rubber USA, LLC");
  assert.equal(kelly.grades.wearMin, 420);
  assert.equal(kelly.grades.wearMax, 700);
  assert.deepEqual(kelly.recalledMissing, ["ARMORSTEEL KDM I", "KDA"]);

  const milestar = whoMakesPages.find((page) => page.key === "milestar");
  assert.deepEqual(milestar.filers, ["Tireco Inc."]);
  assert.deepEqual(
    [...new Set(milestar.rows.map((row) => row.campaign))].sort(),
    ["15T004000", "16T014000"],
  );
  assert.equal(milestar.plants.length, 0);
  assert.match(whoMakesBrandAnswer(milestar).join(" "), /importer or brand owner/);
  assert.match(whoMakesBrandAnswer(milestar).join(" "), /not read as the factory/);

  const sailun = whoMakesPages.find((page) => page.key === "sailun");
  assert.deepEqual(sailun.filers, ["Sailun Tire Americas, Inc.", "Dynamic Tire Corp."]);
  assert.deepEqual(
    [...new Set(sailun.rows.map((row) => row.campaign))].sort(),
    ["19T001000", "21T018000"],
  );
  assert.equal(sailun.plants.length, 0);
  assert.ok(sailun.wordPlantCount > 0);

  for (const item of whoMakesSkipped) {
    assert.equal(item.publish, false);
    assert.equal(summary.byBrand.has(item.key), false);
    assert.match(item.reason, new RegExp(`no row for ${item.label}`));
    assert.match(item.reason, /no registrant whose name matches/);
    assert.doesNotMatch(item.reason, /goodyear|cooper|forum|probably|likely|made by/i);
  }
  assert.match(whoMakesSkipped.find((item) => item.key === "ironman").reason, /grades under Ironman/);
  assert.match(whoMakesSkipped.find((item) => item.key === "douglas").reason, /grades under Douglas/);
  assert.match(whoMakesSkipped.find((item) => item.key === "douglas").reason, /do not name a manufacturer/);
  assert.match(whoMakesSkipped.find((item) => item.key === "westlake").reason, /no brand string Westlake/);
  assert.match(whoMakesSkipped.find((item) => item.key === "cosmo").reason, /no brand string Cosmo/);
  assert.match(whoMakesSkipped.find((item) => item.key === "atlas").reason, /Atlas\/Exxon/);
  assert.match(whoMakesSkipped.find((item) => item.key === "atlas").reason, /not a filing company/);
  assert.ok(whoMakesUnanswered.some((item) => item.key === "kirkland"));
  assert.match(whoMakesUnanswered.find((item) => item.key === "kirkland").reason, /no row for Kirkland/);
});

test("filers and plant links are copied from the rows, not a fixed brand list", () => {
  const rows = [
    {
      brand: "Example",
      line: "ONE",
      filer: "Example Tire Co.",
      manufacturers: ["Example Tire Co."],
      campaign: "20T001000",
      reportDate: "2020-01-02",
      units: 10,
    },
    {
      brand: "Example",
      line: "TWO",
      filer: "Other Tire Inc.",
      manufacturers: ["Other Tire Inc."],
      campaign: "21T001000",
      reportDate: "2021-03-04",
      units: 4,
    },
  ];
  const summary = summarizeRecallRows(rows);
  const plants = [
    {
      code: "1AA",
      slug: "1aa",
      name: "Example Tire Co.",
      city: "Akron",
      country: "United States",
      status: "Active",
      url: "/plants/1aa/",
    },
    {
      code: "1BB",
      slug: "1bb",
      name: "Unrelated Rubber",
      city: "Akron",
      country: "United States",
      status: "Active",
      url: "/plants/1bb/",
    },
  ];
  const report = buildWhoMakesPages(["Example", "Nobody"], {
    summary,
    brands: [],
    lines: [],
    plants,
  });
  assert.equal(report.pages.length, 1);
  assert.deepEqual(report.pages[0].filers, ["Example Tire Co.", "Other Tire Inc."]);
  assert.deepEqual(
    plantsMatchingFilings(plants, rows).map((plant) => plant.code),
    ["1AA"],
  );
  assert.deepEqual(
    report.pages[0].plants.map((plant) => plant.code),
    ["1AA"],
  );
  assert.equal(report.pages[0].plants[0].role, "filer");
  assert.equal(report.skipped.length, 1);
  assert.equal(report.skipped[0].key, "nobody");
  assert.match(report.skipped[0].reason, /no row for Nobody/);
  assert.match(report.skipped[0].reason, /no brand string Nobody/);
  const sentences = whoMakesBrandAnswer(report.pages[0]);
  assertSentences(sentences, "example");
  assert.match(sentences[0], /Example Tire Co\. and Other Tire Inc\./);
  assert.match(sentences[1], /20T001000/);
  assert.match(sentences[1], /21T001000/);
});

test("a plant name that matches the brand is not published as the maker", () => {
  const summary = summarizeRecallRows([]);
  const plants = [
    {
      code: "ZZZ",
      slug: "zzz",
      name: "Acme Tire Co",
      city: "Akron",
      country: "United States",
      status: "Active",
      url: "/plants/zzz/",
    },
  ];
  const report = buildWhoMakesPages(["Acme"], { summary, brands: [], lines: [], plants });
  assert.equal(report.pages.length, 0);
  assert.equal(report.skipped.length, 1);
  assert.match(report.skipped[0].reason, /no row for Acme/);
  assert.match(report.skipped[0].reason, /not used as the maker/);
  assert.doesNotMatch(report.skipped[0].reason, /made by/i);
});

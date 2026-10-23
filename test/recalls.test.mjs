import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { nameKey } from "../src/lib/normalize.js";
import {
  collectTireRecalls,
  companyCore,
  isImporterOrBrandOwnerExample,
  namesDiffer,
  parseReportDate,
  parseUnits,
  phraseKey,
  recallStatement,
  recallWording,
  sameCompany,
  summarizeRecallRows,
} from "../src/lib/recalls.js";

const FIELDS = {
  campaign: 1,
  brand: 2,
  line: 3,
  filer: 7,
  type: 10,
  units: 11,
  manufacturer: 14,
  reportDate: 15,
};

function record(values) {
  const fields = Array(29).fill("");
  for (const [key, value] of Object.entries(values)) fields[FIELDS[key]] = value;
  return fields.join("\t");
}

test("tire filter keeps RCLTYPECD T and drops vehicle, equipment, and child-seat rows", async () => {
  const collected = await collectTireRecalls([
    record({
      type: "V",
      campaign: "10V001000",
      brand: "FORD",
      line: "F-150",
      filer: "Ford Motor Company",
      manufacturer: "Ford Motor Company",
      units: "10",
      reportDate: "20100102",
    }),
    record({
      type: "E",
      campaign: "10E001000",
      brand: "ACME",
      line: "JACK",
      filer: "Acme Corp",
      manufacturer: "Acme Corp",
      units: "4",
      reportDate: "20100202",
    }),
    record({
      type: "C",
      campaign: "10C001000",
      brand: "BABY",
      line: "SEAT",
      filer: "Baby Co",
      manufacturer: "Baby Co",
      units: "3",
      reportDate: "20100302",
    }),
    record({
      type: "T",
      campaign: "10T001000",
      brand: "MASTERCRAFT",
      line: "COURSER HSX TOUR",
      filer: "Cooper Tire & Rubber Co.",
      manufacturer: "Cooper Tire & Rubber Co.",
      units: "430298",
      reportDate: "20210219",
    }),
    record({
      type: "T",
      campaign: "10T001000",
      brand: "MASTERCRAFT",
      line: "COURSER HSX TOUR",
      filer: "Cooper Tire & Rubber Co.",
      manufacturer: "COOPER TIRE & RUBBER CO.",
      units: "430298",
      reportDate: "20210219",
    }),
    record({
      type: "T",
      campaign: "10T002000",
      brand: "MICHELIN",
      line: "DEFENDER",
      filer: "Michelin North America, Inc.",
      manufacturer: "Michelin North America, Inc.",
      units: "80",
      reportDate: "20180601",
    }),
  ]);
  assert.equal(collected.otherRows, 3);
  assert.equal(collected.tireRows, 3);
  assert.equal(collected.campaigns, 2);
  assert.equal(collected.rows.length, 2);
  assert.equal(collected.rows[0].brand, "MASTERCRAFT");
  assert.equal(collected.rows[0].line, "COURSER HSX TOUR");
  assert.equal(collected.rows[0].units, 430298);
  assert.equal(collected.rows[0].reportDate, "2021-02-19");
  assert.deepEqual(collected.rows[0].manufacturers, ["Cooper Tire & Rubber Co."]);
  assert.equal(collected.rows[1].brand, "MICHELIN");
});

test("brand normalization matches the UTQG name key and does not join spaced names", async () => {
  assert.equal(nameKey("BF GOODRICH"), nameKey("BF Goodrich"));
  assert.notEqual(nameKey("BF GOODRICH"), nameKey("BFGoodrich"));
  const collected = await collectTireRecalls([
    record({
      type: "T",
      campaign: "11T001000",
      brand: "BF GOODRICH",
      line: "G-FORCE",
      filer: "Michelin North America, Inc.",
      manufacturer: "Michelin North America, Inc.",
      units: "12",
      reportDate: "20110304",
    }),
    record({
      type: "T",
      campaign: "11T001000",
      brand: "BF Goodrich",
      line: "G-Force",
      filer: "Michelin North America, Inc.",
      manufacturer: "Michelin North America, Inc.",
      units: "12",
      reportDate: "20110304",
    }),
  ]);
  assert.equal(collected.rows.length, 1);
  assert.equal(collected.rows[0].brand, "BF Goodrich");
  assert.equal(collected.rows[0].line, "G-Force");
  assert.equal(nameKey(collected.rows[0].brand), nameKey("BF GOODRICH"));
});

test("filer and brand comparison ignores case and punctuation", () => {
  assert.equal(namesDiffer("Michelin", "Michelin North America, Inc."), false);
  assert.equal(namesDiffer("MICHELIN", "michelin"), false);
  assert.equal(namesDiffer("TBC", "TBC Corporation"), false);
  assert.equal(namesDiffer("Mastercraft", "Cooper Tire & Rubber Co."), true);
  assert.equal(namesDiffer("Cooper", "Cooper Tire and Rubber Co"), false);
  assert.equal(namesDiffer("BF Goodrich", "Michelin North America, Inc."), true);
  assert.equal(namesDiffer("Nitto", "NITTO TIRE CO., LTD."), false);
  assert.equal(namesDiffer("Nitto", "Toyo Tire Holdings of Americas, Inc."), true);
  assert.equal(phraseKey("Cooper Tire & Rubber Co."), phraseKey("Cooper Tire and Rubber Co."));
});

test("company comparison treats legal-suffix and accent variants as one filer", () => {
  assert.equal(sameCompany("Cooper Tire & Rubber Co.", "COOPER TIRE & RUBBER CO."), true);
  assert.equal(sameCompany("Tireco Inc.", "Tireco, Inc."), true);
  assert.equal(sameCompany("Compañia Hulera Tornel, S.A.de C.V.", "Compania Hulera Tornel, S.A. de C.V."), true);
  assert.equal(sameCompany("Goodyear Tire & Rubber Company", "Cooper Tire & Rubber Co."), false);
  assert.ok(companyCore("Continental Tire the Americas, LLC.").includes("continental"));
});

test("made-by requires a tire-maker filer named as the manufacturer of that line", () => {
  assert.equal(recallWording("Cooper Tire & Rubber Co.", ["COOPER TIRE & RUBBER CO."]), "made-by");
  assert.equal(recallWording("Sentury Tire Thailand", ["Sentury Tire Thailand"]), "made-by");
  assert.equal(recallWording("GITI Tire (USA) Ltd.", ["GITI Tire (USA) Ltd."]), "made-by");
  assert.equal(recallWording("Prinx Chengshan Tire North America, Inc.", ["Prinx Chengshan Tire North America, Inc."]), "made-by");
  assert.equal(recallWording("Goodyear Tire & Rubber Company", ["Cooper Tire & Rubber Co."]), "filed-by");
  assert.equal(recallWording("Michelin North America, Inc.", ["Michelin North America, Inc."]), "filed-by");
  assert.equal(recallWording("Foreign Tire Sales, Inc", ["Foreign Tire Sales, Inc"]), "filed-by");
  assert.equal(recallWording("PEP BOYS", ["PEP BOYS"]), "filed-by");
  for (const filer of ["Tireco Inc.", "Harbor Freight Tools", "TBC Corporation", "Discount Tire"]) {
    assert.equal(isImporterOrBrandOwnerExample(filer), true);
    assert.equal(recallWording(filer, [filer]), "filed-by");
  }
  assert.equal(isImporterOrBrandOwnerExample("Cooper Tire & Rubber Co."), false);
  const made = recallStatement({
    filer: "Cooper Tire & Rubber Co.",
    manufacturers: ["Cooper Tire & Rubber Co."],
  });
  assert.equal(made.wording, "made-by");
  assert.equal(made.text, "Made by Cooper Tire & Rubber Co. for this recalled line.");
  const filed = recallStatement({
    filer: "Goodyear Tire & Rubber Company",
    manufacturers: ["Cooper Tire & Rubber Co."],
  });
  assert.equal(filed.wording, "filed-by");
  assert.equal(
    filed.text,
    "Recall filed by Goodyear Tire & Rubber Company for this recalled line. The report's manufacturer field names Cooper Tire & Rubber Co.",
  );
});

test("report dates and unit counts reject impossible values", () => {
  assert.equal(parseReportDate("20100305"), "2010-03-05");
  assert.equal(parseUnits("541632"), 541632);
  assert.throws(() => parseReportDate("20100231"), /RCDATE/);
  assert.throws(() => parseReportDate("2010-03-05"), /RCDATE/);
  assert.throws(() => parseUnits(""), /POTAFF/);
  assert.throws(() => parseUnits("12.5"), /POTAFF/);
});

test("conflicting campaign units are refused", async () => {
  await assert.rejects(
    collectTireRecalls([
      record({
        type: "T",
        campaign: "12T001000",
        brand: "TOYO",
        line: "OPEN COUNTRY",
        filer: "Toyo Tire Holdings of Americas, Inc.",
        manufacturer: "Toyo Tire Holdings of Americas, Inc.",
        units: "10",
        reportDate: "20120101",
      }),
      record({
        type: "T",
        campaign: "12T001000",
        brand: "NITTO",
        line: "RIDGE GRAPPLER",
        filer: "Toyo Tire Holdings of Americas, Inc.",
        manufacturer: "Toyo Tire Holdings of Americas, Inc.",
        units: "11",
        reportDate: "20120101",
      }),
    ]),
    /conflicting/,
  );
});

test("summary counts different filer names without hard-coded totals", async () => {
  const collected = await collectTireRecalls([
    record({
      type: "T",
      campaign: "13T001000",
      brand: "Mastercraft",
      line: "Courser",
      filer: "Cooper Tire & Rubber Co.",
      manufacturer: "Cooper Tire & Rubber Co.",
      units: "5",
      reportDate: "20130506",
    }),
    record({
      type: "T",
      campaign: "13T002000",
      brand: "Michelin",
      line: "Defender",
      filer: "Michelin North America, Inc.",
      manufacturer: "Michelin North America, Inc.",
      units: "6",
      reportDate: "20130607",
    }),
  ]);
  const summary = summarizeRecallRows(collected.rows);
  assert.equal(summary.campaigns, 2);
  assert.equal(summary.brands, 2);
  assert.equal(summary.lines, 2);
  assert.equal(summary.brandsWithDifferentFiler, 1);
  assert.equal(summary.madeByRows, 1);
  assert.equal(summary.filedByRows, 1);
  assert.equal(summary.byBrand.get("mastercraft").anchor, "brand-mastercraft");
  assert.equal(summary.differExample.brand, "Mastercraft");
  assert.equal(summary.sameExample.brand, "Michelin");
});

test("committed recall snapshot matches its summary and the wording rule", () => {
  const rows = JSON.parse(readFileSync("data/recalls.json", "utf8"));
  const meta = JSON.parse(readFileSync("data/meta.json", "utf8"));
  const summary = summarizeRecallRows(rows);
  assert.equal(summary.lines, rows.length);
  assert.equal(summary.campaigns, meta.recalls.campaigns);
  assert.equal(summary.brands, meta.recalls.brands);
  assert.equal(summary.lines, meta.recalls.lines);
  assert.equal(summary.brandsWithDifferentFiler, meta.recalls.brandsWithDifferentFiler);
  assert.equal(meta.recalls.source, "https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_POST_2010.zip");
  assert.ok(meta.recalls.tireRows >= rows.length);
  const keys = new Set();
  for (const row of rows) {
    const key = `${row.campaign}\n${nameKey(row.brand)}\n${nameKey(row.line)}`;
    assert.equal(keys.has(key), false);
    keys.add(key);
    assert.match(row.campaign, /^[0-9]{2}T[0-9]+$/);
    assert.match(row.reportDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof row.units, "number");
    assert.ok(row.brand && row.line && row.filer);
    assert.ok(Array.isArray(row.manufacturers));
    const statement = recallStatement(row);
    if (isImporterOrBrandOwnerExample(row.filer)) assert.equal(statement.wording, "filed-by");
    if (statement.wording === "made-by") assert.match(statement.text, /^Made by /);
    else assert.match(statement.text, /^Recall filed by /);
  }
  assert.ok(summary.campaigns >= 100);
  assert.ok(summary.madeByRows > 0);
  assert.ok(summary.filedByRows > 0);
});

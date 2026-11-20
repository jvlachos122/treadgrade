/**
 * Rewrite data/lastmod.json from current page source and data hashes.
 *
 *   node scripts/update-lastmod.mjs
 *     Keeps a URL's day when its hash is unchanged. A changed or new URL
 *     gets today's UTC day (or LASTMOD_ASOF). Does not use git.
 *
 *   node scripts/update-lastmod.mjs --seed
 *     Sets each day from git history: the newer of the last commit that
 *     changed that page's source inputs, and the last data pull whose rows
 *     changed that page's record. Not for CI. A shallow checkout cannot seed.
 *
 * A URL whose hash cannot be computed is omitted. Days are never in the future.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { contentHashes } from "../src/lib/sitemap-content.js";
import {
  functionBlocks,
  isDay,
  lastmodDistribution,
  readLedger,
  reconcileLedger,
  sourceHash,
  templateForPath,
  utcDay,
  writeLedger,
} from "../src/lib/sitemap-lastmod.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seed = process.argv.includes("--seed");

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function fileDates() {
  const dates = new Map();
  const log = git(["log", "--format=%cI", "--name-only"]);
  let current = "";
  for (const line of log.split("\n")) {
    if (!line) continue;
    if (/^\d{4}-\d{2}-\d{2}T/.test(line)) {
      current = utcDay(line);
      continue;
    }
    const file = line.replaceAll("\\", "/");
    if (current && !dates.has(file)) dates.set(file, current);
  }
  return dates;
}

function answerFunctionDates() {
  let commits = "";
  try {
    commits = git(["log", "--reverse", "--format=%H%x09%cI", "--", "src/lib/answers.js"]);
  } catch {
    return new Map();
  }
  const dates = new Map();
  const previous = new Map();
  for (const line of commits.split("\n")) {
    if (!line) continue;
    const [sha, iso] = line.split("\t");
    const source = git(["show", `${sha}:src/lib/answers.js`]);
    const blocks = functionBlocks(source);
    const day = utcDay(iso);
    for (const [name, body] of blocks) {
      if (previous.get(name) !== body) {
        dates.set(name, day);
        previous.set(name, body);
      }
    }
  }
  return dates;
}

function dataCommits() {
  const log = git([
    "log",
    "--reverse",
    "--format=%H%x09%cI",
    "--",
    "data/ratings.json",
    "data/plants.json",
    "data/recalls.json",
    "data/meta.json",
  ]);
  const commits = [];
  for (const line of log.split("\n")) {
    if (!line) continue;
    const [sha, iso] = line.split("\t");
    commits.push({ sha, day: utcDay(iso) });
  }
  return commits;
}

function showJson(sha, path) {
  try {
    return JSON.parse(git(["show", `${sha}:${path}`]));
  } catch {
    return null;
  }
}

function sourceDay(path, dates, answerDates, cache) {
  const template = templateForPath(path);
  const source = sourceHash(template, { cache });
  let day = "";
  for (const file of source.files) {
    const found = dates.get(file);
    if (found && found > day) day = found;
  }
  for (const name of source.answerNames) {
    const found = answerDates.get(name);
    if (found && found > day) day = found;
  }
  return day;
}

function seedLedger(hashes) {
  const shallow = git(["rev-parse", "--is-shallow-repository"]).trim() === "true";
  if (shallow) throw new Error("Cannot seed lastmod from a shallow checkout.");
  const dates = fileDates();
  const answerDates = answerFunctionDates();
  const sourceCache = new Map();
  const sourceDays = new Map();
  for (const path of hashes.keys()) sourceDays.set(path, sourceDay(path, dates, answerDates, sourceCache));

  const dataDays = new Map();
  const previous = new Map();
  for (const commit of dataCommits()) {
    const ratings = showJson(commit.sha, "data/ratings.json");
    const plants = showJson(commit.sha, "data/plants.json");
    const meta = showJson(commit.sha, "data/meta.json");
    if (!ratings || !plants || !meta) continue;
    const recalls = showJson(commit.sha, "data/recalls.json") || [];
    let historical;
    try {
      historical = contentHashes({ ratings, plants, recalls, meta }).hashes;
    } catch (error) {
      console.warn(`Skipping data commit ${commit.sha.slice(0, 7)}: ${error.message}`);
      continue;
    }
    for (const [path, hash] of historical) {
      if (previous.get(path) !== hash) {
        dataDays.set(path, commit.day);
        previous.set(path, hash);
      }
    }
  }

  const today = utcDay();
  const urls = {};
  let omitted = 0;
  for (const [path, hash] of hashes) {
    if (!hash) {
      omitted += 1;
      continue;
    }
    const day = [sourceDays.get(path) || "", dataDays.get(path) || ""].sort().at(-1) || "";
    if (!day || !isDay(day) || day > today) {
      omitted += 1;
      continue;
    }
    urls[path] = { hash, date: day };
  }
  return { urls, omitted };
}

const { hashes } = contentHashes();
const today = process.env.LASTMOD_ASOF || utcDay();
let urls;
let omitted = [];
if (seed) {
  const seeded = seedLedger(hashes);
  urls = seeded.urls;
  omitted = seeded.omitted ? ["(see omitted count)"] : [];
  console.log(`Seeded ${Object.keys(urls).length} URLs, omitted ${seeded.omitted}.`);
} else {
  const next = reconcileLedger(readLedger(), hashes, today);
  urls = next.urls;
  omitted = next.omitted;
}

writeLedger(urls);
const distribution = lastmodDistribution(urls);
console.log(`lastmod ledger: ${Object.keys(urls).length} URLs, ${distribution.length} distinct days.`);
for (const [day, count] of distribution) console.log(`${day}  ${count}`);
if (!seed && omitted.length) console.log(`Omitted lastmod for ${omitted.length} URLs.`);

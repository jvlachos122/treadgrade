import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  shouldSavePreviousManifest,
  submissionAccepted,
  submitUrls,
} from "../scripts/indexnow.mjs";

const script = join(import.meta.dirname, "..", "scripts", "indexnow.mjs");

function manifest(urls, generatedAt = "2026-10-23T07:12:00.000Z") {
  return (
    JSON.stringify({
      generatedAt,
      host: "treadgrade.com",
      count: Object.keys(urls).length,
      urls,
    }) + "\n"
  );
}

function runSubmit({ dir, args, outputName }) {
  const output = join(dir, outputName);
  const result = spawnSync(process.execPath, [script, "--submit", ...args], {
    cwd: join(import.meta.dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: output },
  });
  return { ...result, output: readFileSync(output, "utf8") };
}

test("submission is accepted only when every batch is HTTP 200 or 202", () => {
  assert.equal(submissionAccepted([]), true);
  assert.equal(submissionAccepted([200]), true);
  assert.equal(submissionAccepted([202]), true);
  assert.equal(submissionAccepted([200, 202]), true);
  assert.equal(submissionAccepted([403]), false);
  assert.equal(submissionAccepted([200, 403]), false);
  assert.equal(submissionAccepted([0]), false);
  assert.equal(submissionAccepted([400]), false);
  assert.equal(submissionAccepted([422]), false);
  assert.equal(submissionAccepted([429]), false);
  assert.equal(submissionAccepted([500]), false);
  assert.equal(submissionAccepted(["200"]), false);
});

test("a dry run never promotes the previous manifest", () => {
  assert.equal(shouldSavePreviousManifest([200, 202], { dryRun: true }), false);
  assert.equal(shouldSavePreviousManifest([], { dryRun: true }), false);
  assert.equal(shouldSavePreviousManifest([200]), true);
  assert.equal(shouldSavePreviousManifest([403]), false);
});

test("submitUrls keeps going after a failed batch and records each status", async () => {
  const seen = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    seen.push(body.urlList);
    const first = body.urlList[0];
    if (first.endsWith("/offline/")) throw new Error("offline");
    const status = first.endsWith("/forbidden/") ? 403 : first.endsWith("/pending/") ? 202 : 200;
    const text = status === 403 ? '{"errorCode":"SiteVerificationNotCompleted"}' : "";
    return new Response(text, { status });
  };

  const ok = await submitUrls("abc", ["https://treadgrade.com/a/"], { fetchImpl, batchSize: 1 });
  assert.deepEqual(ok, [200]);
  assert.equal(shouldSavePreviousManifest(ok), true);

  const pending = await submitUrls("abc", ["https://treadgrade.com/pending/"], { fetchImpl });
  assert.deepEqual(pending, [202]);
  assert.equal(shouldSavePreviousManifest(pending), true);

  const forbidden = await submitUrls(
    "abc",
    ["https://treadgrade.com/ok/", "https://treadgrade.com/forbidden/"],
    { fetchImpl, batchSize: 1 },
  );
  assert.deepEqual(forbidden, [200, 403]);
  assert.equal(shouldSavePreviousManifest(forbidden), false);
  assert.equal(seen.at(-1)[0], "https://treadgrade.com/forbidden/");

  const offline = await submitUrls("abc", ["https://treadgrade.com/offline/"], { fetchImpl });
  assert.deepEqual(offline, [0]);
  assert.equal(shouldSavePreviousManifest(offline), false);

  let called = false;
  const empty = await submitUrls("abc", [], {
    fetchImpl: async () => {
      called = true;
      return new Response("", { status: 200 });
    },
  });
  assert.deepEqual(empty, []);
  assert.equal(called, false);
  assert.equal(shouldSavePreviousManifest(empty), true);

  const dry = await submitUrls("abc", ["https://treadgrade.com/a/", "https://treadgrade.com/b/"], {
    dryRun: true,
    batchSize: 1,
    fetchImpl: async () => {
      throw new Error("dry-run must not fetch");
    },
  });
  assert.deepEqual(dry, []);
  assert.equal(shouldSavePreviousManifest(dry, { dryRun: true }), false);
});

test("the submit command promotes the manifest only after an accepted submission", () => {
  const dir = mkdtempSync(join(tmpdir(), "indexnow-"));
  const current = join(dir, "manifest.json");
  const previous = join(dir, "previous-manifest.json");
  const url = "https://treadgrade.com/";

  writeFileSync(current, manifest({ [url]: "same" }, "2026-10-23T08:00:00.000Z"));
  writeFileSync(previous, manifest({ [url]: "same" }, "2026-10-23T07:00:00.000Z"));
  const unchanged = runSubmit({
    dir,
    outputName: "unchanged.txt",
    args: ["--manifest", current, "--previous", previous, "--promote-to", previous],
  });
  assert.equal(unchanged.status, 0, unchanged.stderr);
  assert.match(unchanged.output, /^accepted=true\n$/);
  assert.equal(readFileSync(previous, "utf8"), readFileSync(current, "utf8"));

  const kept = manifest({ [url]: "old" }, "2026-10-23T07:00:00.000Z");
  writeFileSync(current, manifest({ [url]: "new" }, "2026-10-23T08:00:00.000Z"));
  writeFileSync(previous, kept);
  const dry = runSubmit({
    dir,
    outputName: "dry.txt",
    args: ["--manifest", current, "--previous", previous, "--promote-to", previous, "--dry-run"],
  });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.output, /^accepted=false\n$/);
  assert.equal(readFileSync(previous, "utf8"), kept);
  assert.match(dry.stderr, /leaving the previous manifest unchanged/);

  const broken = join(dir, "broken.json");
  const untouched = join(dir, "untouched-previous.json");
  writeFileSync(broken, "{");
  writeFileSync(untouched, kept);
  const failed = runSubmit({
    dir,
    outputName: "failed.txt",
    args: ["--manifest", broken, "--previous", untouched, "--promote-to", untouched],
  });
  assert.equal(failed.status, 0, failed.stderr);
  assert.match(failed.output, /^accepted=false\n$/);
  assert.equal(readFileSync(untouched, "utf8"), kept);
});

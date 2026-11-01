/**
 * One definition of an invalid or suspect UTQG row.
 * The known-errors page and the ratings table both use it.
 * Usual letters are the ones named in 49 CFR 575.104: traction AA, A, B, C
 * and temperature A, B, C.
 */

export const USUAL_TRACTION = ["AA", "A", "B", "C"];
export const USUAL_TEMPERATURE = ["A", "B", "C"];

function quote(value) {
  return `"${value}"`;
}

/**
 * kind is "invalid", "suspect", or "ok".
 * Invalid wins when a row also has treadwear 0 or no treadwear number.
 * reasons is empty when the row is ok, and otherwise lists every problem
 * in the same order the known-errors page uses.
 */
export function rowQuality(row) {
  const reasons = [];
  const wearBlank = row.wear == null || row.wear === "";
  if (wearBlank) reasons.push("no treadwear number");
  else if (row.wearN == null) reasons.push(`treadwear ${quote(row.wear)}`);
  else if (row.wearN === 0) reasons.push("treadwear 0");

  const trac = row.trac == null ? "" : String(row.trac);
  const temp = row.temp == null ? "" : String(row.temp);
  if (!USUAL_TRACTION.includes(trac)) reasons.push(`traction ${quote(trac)}`);
  if (!USUAL_TEMPERATURE.includes(temp)) reasons.push(`temperature ${quote(temp)}`);

  const invalid =
    !USUAL_TRACTION.includes(trac) || !USUAL_TEMPERATURE.includes(temp) || (!wearBlank && row.wearN == null);
  const suspect = !invalid && (row.wearN === 0 || wearBlank);
  return {
    kind: invalid ? "invalid" : suspect ? "suspect" : "ok",
    reasons: invalid || suspect ? reasons : [],
  };
}

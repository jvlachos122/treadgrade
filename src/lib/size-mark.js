/**
 * Read LT, P, load-range, and rim-diameter marks from size text the reader types.
 * This does not look up a tire and does not decide that a tire is exempt.
 */

function compactSize(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "");
}

export function readSizeMark(value) {
  const text = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const compact = compactSize(text);
  const load = text.match(/\bload\s*range\s*([A-Za-z])\b/i);
  const rims = [...compact.matchAll(/[RBD-](\d{2}(?:\.\d+)?)(?![0-9])/gi)];
  const rim = rims.at(-1);
  const rimInches = rim ? Number(rim[1]) : null;
  return {
    text,
    ltPrefix: /^LT(?=\d)/i.test(compact),
    ltSuffix: /(?:R|-)\d{2}(?:\.\d+)?LT$/i.test(compact),
    pPrefix: /^P(?=\d)/i.test(compact),
    loadRange: load ? load[1].toUpperCase() : "",
    rimInches: Number.isFinite(rimInches) ? rimInches : null,
    rimAtMost12: Number.isFinite(rimInches) && rimInches <= 12,
  };
}

function inchLabel(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

export function sizeMarkSentences(mark) {
  if (!mark.text) return [];
  const sentences = [];
  if (mark.ltPrefix) sentences.push("This size text starts with the LT prefix.");
  if (mark.ltSuffix) sentences.push("This size text ends with LT after the rim diameter.");
  if (mark.pPrefix) sentences.push("This size text starts with the P prefix.");
  if (mark.loadRange) sentences.push(`This size text includes load range ${mark.loadRange}.`);
  if (mark.rimInches != null) {
    sentences.push(`The rim diameter in this size text is ${inchLabel(mark.rimInches)} inches.`);
    if (mark.rimAtMost12) {
      sentences.push("A nominal rim diameter of 12 inches or less is one of the tires 49 CFR 575.104(c)(1) does not apply to.");
    }
  }
  if (!mark.ltPrefix && !mark.ltSuffix && !mark.pPrefix && !mark.loadRange && mark.rimInches == null) {
    sentences.push(
      "This size text does not start with LT or P, does not end with LT after a rim diameter, and does not include a load-range letter.",
    );
  }
  sentences.push("The check uses only the characters you typed. It does not search NHTSA's list, and a listing on this site does not mean a tire is on sale.");
  return sentences;
}

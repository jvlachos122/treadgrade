const SYMBOLS = [
  ["α", " alpha "],
  ["β", " beta "],
  ["γ", " gamma "],
  ["＋", " + "],
];

export function slugify(value) {
  let text = String(value ?? "");
  for (const [from, to] of SYMBOLS) text = text.split(from).join(to);
  text = text.normalize("NFKD").replace(/\p{M}/gu, "");
  text = text.replace(/&/g, " and ").replace(/\+/g, " plus ");
  text = text.toLowerCase();
  text = text.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return text || "unknown";
}

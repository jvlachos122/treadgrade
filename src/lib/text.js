export function clampText(value, max = 158) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const trimmed = cut.replace(/\s+\S*$/, "");
  return `${trimmed || cut}…`;
}

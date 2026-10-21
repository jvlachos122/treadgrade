export function searchRecords(data, query, limit = 12) {
  const q = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!q || !data) return [];
  const scored = [];

  for (const brand of data.brands || []) {
    const name = brand.n.toLowerCase();
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 40;
    if (!score) continue;
    scored.push({
      score,
      type: "Brand",
      title: brand.n,
      detail: `${brand.c} tire line${brand.c === 1 ? "" : "s"}`,
      url: brand.u,
    });
  }

  for (const line of data.lines || []) {
    const combined = `${line.b} ${line.l}`.toLowerCase();
    const lineName = line.l.toLowerCase();
    let score = 0;
    if (lineName === q || combined === q) score = 90;
    else if (lineName.startsWith(q) || combined.startsWith(q)) score = 70;
    else if (lineName.includes(q) || combined.includes(q)) score = 30;
    if (!score) continue;
    scored.push({
      score,
      type: "Tire line",
      title: `${line.b} ${line.l}`,
      detail: line.w ? `Treadwear ${line.w}` : "UTQG grades",
      url: line.u,
    });
  }

  for (const plant of data.plants || []) {
    const code = plant.c.toLowerCase();
    const oldCode = String(plant.o || "").toLowerCase();
    const blob = `${plant.n} ${plant.city} ${plant.country}`.toLowerCase();
    let score = 0;
    if (code === q || (oldCode && oldCode === q)) score = 110;
    else if (code.startsWith(q) || (oldCode && oldCode.startsWith(q))) score = 85;
    else if (blob.includes(q)) score = 25;
    if (!score) continue;
    const where = [plant.n, plant.city, plant.country].filter(Boolean).join(", ");
    scored.push({
      score,
      type: "Plant code",
      title: plant.o ? `DOT ${plant.c} (former ${plant.o})` : `DOT ${plant.c}`,
      detail: where,
      url: plant.u,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "en"));
  return scored.slice(0, limit).map(({ type, title, detail, url }) => ({ type, title, detail, url }));
}

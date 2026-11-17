export function sliceCount(cells, band, trac, temp) {
  const bandSet = band !== "" && band != null;
  const tracSet = trac !== "" && trac != null;
  const tempSet = temp !== "" && temp != null;
  let count = 0;
  for (const cell of cells) {
    if (bandSet && String(cell.start) !== String(band)) continue;
    if (tracSet && cell.trac !== trac) continue;
    if (tempSet && cell.temp !== temp) continue;
    count += cell.count;
  }
  return count;
}

export function sliceHref(band, trac, temp) {
  const params = new URLSearchParams();
  if (band !== "" && band != null) {
    const start = Number(band);
    params.set("wearMin", String(start === 0 ? 1 : start));
    params.set("wearMax", String(start + 99));
  }
  if (trac && trac !== "other") params.append("traction", trac);
  if (temp && temp !== "other") params.append("temp", temp);
  const query = params.toString();
  return query ? `/ratings/?${query}#ratings-table` : "/ratings/#ratings-table";
}

export function initRatingsSlice(root) {
  const form = root.querySelector("[data-slice-form]");
  const dataNode = root.querySelector("[data-slice-json]");
  const output = root.querySelector("[data-slice-count]");
  const link = root.querySelector("[data-slice-link]");
  if (!form || !dataNode || !output) return;
  let data;
  try {
    data = JSON.parse(dataNode.textContent || "");
  } catch {
    return;
  }
  form.hidden = false;

  function value(name) {
    const field = form.elements.namedItem(name);
    return field ? field.value : "";
  }

  function apply() {
    const band = value("band");
    const trac = value("traction");
    const temp = value("temp");
    const count = sliceCount(data.cells, band, trac, temp);
    output.textContent = `${count.toLocaleString("en-US")} grade rows with a usable treadwear number match this slice.`;
    if (link) link.href = sliceHref(band, trac, temp);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    apply();
  });
  form.addEventListener("change", apply);
  apply();
}

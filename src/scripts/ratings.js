const TRACTION = { AA: 4, A: 3, B: 2, C: 1 };
const TEMPERATURE = { A: 3, B: 2, C: 1 };
const PAGE_SIZE = 40;

function rank(table, value) {
  return table[value] ?? 0;
}

function readState() {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") || "",
    traction: params.get("traction") || "",
    temp: params.get("temp") || "",
    wearMin: params.get("wearMin") || "",
    sort: params.get("sort") || "brand",
    page: Math.max(1, Number(params.get("page")) || 1),
  };
}

function writeState(state) {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.traction) params.set("traction", state.traction);
  if (state.temp) params.set("temp", state.temp);
  if (state.wearMin) params.set("wearMin", state.wearMin);
  if (state.sort && state.sort !== "brand") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  const search = params.toString();
  history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
}

export function initRatings(root) {
  const status = root.querySelector("[data-status]");
  const body = root.querySelector("tbody");
  const pageLabel = root.querySelector("[data-page]");
  const prev = root.querySelector("[data-prev]");
  const next = root.querySelector("[data-next]");
  const form = root.querySelector("form");
  let data = null;
  let state = readState();

  function field(name) {
    return form.elements.namedItem(name);
  }

  function syncForm() {
    field("q").value = state.q;
    field("traction").value = state.traction;
    field("temp").value = state.temp;
    field("wearMin").value = state.wearMin;
    field("sort").value = state.sort;
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    const wearMin = state.wearMin === "" ? null : Number(state.wearMin);
    return data.rows.filter((row) => {
      const line = data.lines[row[0]];
      if (q && !`${line.b} ${line.l}`.toLowerCase().includes(q)) return false;
      if (state.traction && row[3] !== state.traction) return false;
      if (state.temp && row[4] !== state.temp) return false;
      if (wearMin != null && (row[2] == null || row[2] < wearMin)) return false;
      return true;
    });
  }

  function sorted(rows) {
    const copy = [...rows];
    copy.sort((a, b) => {
      const lineA = data.lines[a[0]];
      const lineB = data.lines[b[0]];
      let diff = 0;
      if (state.sort === "wear-desc") diff = (b[2] ?? -1) - (a[2] ?? -1);
      else if (state.sort === "wear-asc") diff = (a[2] ?? 9999) - (b[2] ?? 9999);
      else if (state.sort === "traction") diff = rank(TRACTION, b[3]) - rank(TRACTION, a[3]);
      else if (state.sort === "temp") diff = rank(TEMPERATURE, b[4]) - rank(TEMPERATURE, a[4]);
      if (diff) return diff;
      return (
        lineA.b.localeCompare(lineB.b, "en") ||
        lineA.l.localeCompare(lineB.l, "en") ||
        String(a[1]).localeCompare(String(b[1]), "en")
      );
    });
    return copy;
  }

  function cellLink(href, text) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = text;
    return link;
  }

  function grade(value) {
    const span = document.createElement("span");
    const known = ["AA", "A", "B", "C"].includes(value);
    span.className = `grade grade-${known ? value.toLowerCase() : "other"}`;
    span.textContent = value || "—";
    return span;
  }

  function render() {
    const rows = sorted(filtered());
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * PAGE_SIZE;
    const slice = rows.slice(start, start + PAGE_SIZE);
    body.replaceChildren();
    for (const row of slice) {
      const line = data.lines[row[0]];
      const tr = document.createElement("tr");
      const brand = document.createElement("td");
      brand.append(cellLink(`/brands/${line.u.split("/")[2]}/`, line.b));
      const name = document.createElement("td");
      name.append(cellLink(line.u, line.l));
      const size = document.createElement("td");
      size.textContent = row[1];
      const wear = document.createElement("td");
      wear.className = "num";
      wear.textContent = row[2] == null ? "—" : String(row[2]);
      const trac = document.createElement("td");
      trac.append(grade(row[3]));
      const temp = document.createElement("td");
      const tempKnown = ["A", "B", "C"].includes(row[4]);
      const tempBadge = grade(row[4]);
      if (!tempKnown) tempBadge.className = "grade grade-other";
      temp.append(tempBadge);
      tr.append(brand, name, size, wear, trac, temp);
      body.append(tr);
    }
    const from = rows.length ? start + 1 : 0;
    const to = start + slice.length;
    status.textContent = `Showing ${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} grade rows.`;
    pageLabel.textContent = `Page ${state.page} of ${pages}`;
    prev.disabled = state.page <= 1;
    next.disabled = state.page >= pages;
    writeState(state);
  }

  function onFilter(resetPage) {
    if (!data) return;
    state = {
      q: field("q").value,
      traction: field("traction").value,
      temp: field("temp").value,
      wearMin: field("wearMin").value,
      sort: field("sort").value,
      page: resetPage ? 1 : state.page,
    };
    render();
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onFilter(true);
  });
  form.addEventListener("input", () => onFilter(true));
  form.addEventListener("change", () => onFilter(true));
  prev.addEventListener("click", () => {
    state.page -= 1;
    render();
    root.querySelector("table")?.scrollIntoView({ block: "start" });
  });
  next.addEventListener("click", () => {
    state.page += 1;
    render();
    root.querySelector("table")?.scrollIntoView({ block: "start" });
  });

  syncForm();
  fetch("/data/ratings.json")
    .then((response) => {
      if (!response.ok) throw new Error("ratings");
      return response.json();
    })
    .then((payload) => {
      data = payload;
      render();
    })
    .catch(() => {
      status.textContent = "The ratings table did not load. Every brand is listed on the brands page.";
    });
}

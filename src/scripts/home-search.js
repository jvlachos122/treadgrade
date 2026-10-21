import { searchRecords } from "../lib/search.js";

export function initSearch(root) {
  const input = root.querySelector("input[type='search']");
  const list = root.querySelector("[role='listbox']");
  const status = root.querySelector("[data-status]");
  if (!input || !list || !status) return;

  let records = null;
  let loading = null;
  let items = [];
  let active = -1;

  function setExpanded(open) {
    input.setAttribute("aria-expanded", open ? "true" : "false");
    list.hidden = !open;
  }

  function render(results, query) {
    list.replaceChildren();
    items = results;
    active = -1;
    if (!query) {
      setExpanded(false);
      status.textContent = "";
      return;
    }
    if (!results.length) {
      setExpanded(false);
      status.replaceChildren();
      const note = document.createElement("a");
      note.href = "/guides/utqg-grades/#not-in-the-list";
      note.textContent = "Why a light-truck, winter, or spare tire may be missing";
      status.append(document.createTextNode(`No matches for “${query}”. A missing name is not a grade. `), note, document.createTextNode("."));
      return;
    }
    for (const [index, result] of results.entries()) {
      const option = document.createElement("li");
      option.setAttribute("role", "presentation");
      const link = document.createElement("a");
      link.href = result.url;
      link.id = `search-option-${index}`;
      link.setAttribute("role", "option");
      const type = document.createElement("span");
      type.className = "result-type";
      type.textContent = result.type;
      const title = document.createElement("span");
      title.textContent = result.title;
      const detail = document.createElement("span");
      detail.className = "result-detail";
      detail.textContent = result.detail;
      link.append(type, title, detail);
      option.append(link);
      list.append(option);
    }
    setExpanded(true);
    status.textContent = `${results.length} suggestion${results.length === 1 ? "" : "s"}.`;
  }

  function ensure() {
    if (!loading) {
      loading = fetch("/data/search.json").then((response) => {
        if (!response.ok) throw new Error("search index");
        return response.json();
      });
    }
    return loading;
  }

  async function update(pushUrl) {
    const query = input.value.trim();
    if (pushUrl) {
      const url = new URL(window.location.href);
      if (query) url.searchParams.set("q", query);
      else url.searchParams.delete("q");
      history.replaceState(null, "", url);
    }
    try {
      records = await ensure();
    } catch {
      status.textContent = "The search index did not load. Browse brands or the plant directory instead.";
      return;
    }
    render(searchRecords(records, query), query);
  }

  function move(delta) {
    if (!items.length) return;
    active = (active + delta + items.length) % items.length;
    for (const [index, item] of items.entries()) {
      const link = list.querySelector(`#search-option-${index}`);
      if (!link) continue;
      const selected = index === active;
      link.setAttribute("aria-selected", selected ? "true" : "false");
      if (selected) {
        input.setAttribute("aria-activedescendant", link.id);
        link.scrollIntoView({ block: "nearest" });
      }
    }
  }

  input.addEventListener("input", () => {
    update(true);
  });
  input.addEventListener("focus", () => {
    if (input.value.trim()) update(false);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Escape") {
      setExpanded(false);
      input.removeAttribute("aria-activedescendant");
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      list.querySelector(`#search-option-${active}`)?.click();
    }
  });
  root.querySelector("form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (active >= 0) list.querySelector(`#search-option-${active}`)?.click();
    else update(true);
  });

  const initial = new URLSearchParams(window.location.search).get("q");
  if (initial) {
    input.value = initial;
    update(false);
  }
}

import { formatAge, formatUtcDay } from "../lib/format.js";
import { decodeTin, indexPlants } from "../lib/tin.js";

function section(title) {
  const wrap = document.createElement("section");
  const heading = document.createElement("h2");
  heading.textContent = title;
  wrap.append(heading);
  return wrap;
}

function paragraph(text) {
  const p = document.createElement("p");
  p.textContent = text;
  return p;
}

export function initDecoder(root) {
  const form = root.querySelector("form");
  const input = form.elements.namedItem("tin");
  const output = root.querySelector("[data-output]");
  let plants = null;

  function place(plant) {
    return [plant.address, [plant.city, plant.state].filter(Boolean).join(", "), plant.postal, plant.country]
      .filter(Boolean)
      .join(", ");
  }

  function render(result) {
    output.replaceChildren();
    const summary = section("Reading");
    summary.append(paragraph(result.normalized ? `Symbols used: ${result.normalized}` : "Nothing usable was left after cleaning the entry."));
    output.append(summary);

    const plantSection = section("Plant");
    if (!result.matches.length) {
      plantSection.append(paragraph(result.plantCode ? `No plant record for ${result.plantCode}.` : "No plant code in this entry."));
    } else {
      const list = document.createElement("ul");
      for (const plant of result.matches) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = plant.url;
        link.textContent = `${plant.code}${plant.matchedOn === "old" ? ` (matched former code ${result.plantCode})` : ""}`;
        item.append(link, document.createTextNode(` — ${plant.name}. ${place(plant)}.`));
        if (plant.status) item.append(document.createTextNode(` Status field: ${plant.status}.`));
        list.append(item);
      }
      plantSection.append(list);
      plantSection.append(
        paragraph(
          "The name is the company on the NHTSA plant record. That record does not list brands made at the plant. The status field is not a finding that the company or plant is operating.",
        ),
      );
    }
    output.append(plantSection);

    const dateSection = section("Date and age");
    if (!result.date) {
      dateSection.append(paragraph("No manufacture week was read."));
    } else if (result.date.style === "four") {
      const candidate = result.date.candidates[0];
      dateSection.append(paragraph(`Date code ${result.date.raw}: week ${result.date.week} of ${candidate.year}.`));
      if (candidate.validWeek) {
        dateSection.append(
          paragraph(`${formatUtcDay(candidate.start)} through ${formatUtcDay(candidate.end)}. ${formatAge(candidate.age)}`),
        );
      }
    } else {
      dateSection.append(
        paragraph(`Date code ${result.date.raw}: week ${result.date.week}, year digit ${result.date.raw.slice(2)}. Possible years:`),
      );
      const list = document.createElement("ul");
      for (const candidate of result.date.candidates) {
        const item = document.createElement("li");
        item.textContent = candidate.validWeek
          ? `${candidate.year}: ${formatUtcDay(candidate.start)} through ${formatUtcDay(candidate.end)}. ${formatAge(candidate.age)}`
          : `${candidate.year}: week ${candidate.week} does not start in that year under the Sunday-start rule.`;
        list.append(item);
      }
      dateSection.append(list);
    }
    output.append(dateSection);

    if (result.notes.length) {
      const notes = section("Notes");
      const list = document.createElement("ul");
      for (const note of result.notes) {
        const item = document.createElement("li");
        item.textContent = note.text;
        list.append(item);
      }
      notes.append(list);
      output.append(notes);
    }
  }

  async function run(value) {
    if (!plants) {
      const response = await fetch("/data/plants.json");
      if (!response.ok) throw new Error("plants");
      plants = indexPlants(await response.json());
    }
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("tin", value);
    else url.searchParams.delete("tin");
    history.replaceState(null, "", url);
    render(decodeTin(value, plants, new Date()));
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(input.value).catch(() => {
      output.replaceChildren(paragraph("The plant list did not load, so the code could not be decoded."));
    });
  });
  for (const button of root.querySelectorAll("[data-example]")) {
    button.addEventListener("click", () => {
      input.value = button.dataset.example;
      run(input.value).catch(() => {});
    });
  }
  const initial = new URLSearchParams(window.location.search).get("tin");
  if (initial) {
    input.value = initial;
    run(initial).catch(() => {
      output.replaceChildren(paragraph("The plant list did not load, so the code could not be decoded."));
    });
  }
}

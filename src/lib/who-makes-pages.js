import { catalog } from "./catalog.js";
import { recallSummary } from "./recall-catalog.js";
import { WHO_MAKES_CANDIDATES, buildWhoMakesPages, unansweredBrands } from "./who-makes.js";

const sources = {
  summary: recallSummary,
  brands: catalog.brands,
  lines: catalog.lines,
  plants: catalog.plants,
};

const report = buildWhoMakesPages(WHO_MAKES_CANDIDATES, sources);

export const whoMakesPages = report.pages;
export const whoMakesSkipped = report.skipped;
export const whoMakesUnanswered = [...report.skipped, ...unansweredBrands(["Kirkland"], sources, report.skipped)];
export const whoMakesBySlug = new Map(whoMakesPages.map((page) => [page.slug, page]));
export const whoMakesByKey = new Map(whoMakesPages.map((page) => [page.key, page]));

const byPlant = new Map();
for (const page of whoMakesPages) {
  for (const plant of page.plants) {
    if (!byPlant.has(plant.code)) byPlant.set(plant.code, []);
    byPlant.get(plant.code).push({
      name: page.name,
      url: page.url,
      matchedCompany: plant.matchedCompany,
      role: plant.role,
    });
  }
}
export const whoMakesByPlantCode = byPlant;

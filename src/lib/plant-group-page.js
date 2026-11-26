import { catalog } from "./catalog.js";
import { plantByCode } from "./plant-hubs.js";
import { buildGroupIndex, describeGroup } from "./plant-group-detail.js";

let liveIndex;

export function liveGroupIndex() {
  if (!liveIndex) {
    const extrasByCode = new Map();
    for (const plant of catalog.plants) {
      const extra = plantByCode.get(plant.code);
      extrasByCode.set(plant.code, {
        siblings: extra?.siblings || [],
        recalls: extra?.recalls || [],
      });
    }
    liveIndex = buildGroupIndex({
      brands: catalog.brands,
      plants: catalog.plants,
      lines: catalog.lines,
      extrasByCode,
    });
  }
  return liveIndex;
}

export function liveGroupDetail(plants) {
  return describeGroup(plants, liveGroupIndex());
}

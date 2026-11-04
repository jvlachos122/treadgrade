import { catalog } from "./catalog.js";
import {
  buildLineRecord,
  familyById,
  recallRowsForLine,
  selectExampleComparisons,
} from "./compare.js";
import { recallSummary } from "./recall-catalog.js";

function recordFor(line) {
  return buildLineRecord(line, {
    recallRows: recallRowsForLine(line, recallSummary),
    plants: catalog.plants,
  });
}

export const exampleComparisons = selectExampleComparisons(catalog).map((pair) => ({
  familyId: pair.familyId,
  familyLabel: familyById(pair.familyId)?.label || pair.familyId,
  distance: pair.distance,
  path: pair.path,
  left: recordFor(pair.left),
  right: recordFor(pair.right),
}));

export const exampleComparisonPaths = exampleComparisons.map((pair) => pair.path);

import meta from "../../data/meta.json";
import rows from "../../data/recalls.json";
import { summarizeRecallRows } from "./recalls.js";

export const recallRows = rows;
export const recallMeta = meta.recalls;
export const recallSummary = summarizeRecallRows(rows);

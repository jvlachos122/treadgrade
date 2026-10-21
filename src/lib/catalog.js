import ratings from "../../data/ratings.json";
import plants from "../../data/plants.json";
import meta from "../../data/meta.json";
import { buildCatalog } from "./normalize.js";

export const catalog = buildCatalog(ratings, plants, meta);

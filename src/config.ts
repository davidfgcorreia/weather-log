import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");

/**
 * Everything tunable. To log a different city, change `weather` — the
 * coordinates and the label are all that decide what gets recorded.
 *
 * `timezone` is what Open-Meteo uses to report the observation time, so set it
 * to the location's zone rather than your own; it is what makes `localTime`
 * read as local to the place being measured.
 */
export const config = {
  paths: {
    root: ROOT,
    data: path.join(ROOT, "data"),
    weather: path.join(ROOT, "data", "weather.jsonl"),
    markdown: path.join(ROOT, "WEATHER.md"),
  },

  weather: {
    /** Lisbon, Portugal. */
    latitude: 38.7223,
    longitude: -9.1393,
    timezone: "Europe/Lisbon",
    label: "Lisbon, Portugal",
  },
} as const;

export type Config = typeof config;

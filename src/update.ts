/**
 * Fetches the current temperature and appends it to `data/weather.jsonl` and
 * `WEATHER.md`. Run by `.github/workflows/weather.yml` every six hours; the
 * workflow does the committing.
 *
 * Prints the commit subject to stdout so the workflow can use it.
 */
import fs from "node:fs";
import { config } from "./config.js";
import { appendJsonl, readJsonl } from "./store.js";
import {
  commitMessage,
  renderMarkdown,
  toWeatherRecord,
  type OpenMeteoResponse,
  type WeatherRecord,
} from "./format.js";

export function apiUrl(): string {
  const params = new URLSearchParams({
    latitude: String(config.weather.latitude),
    longitude: String(config.weather.longitude),
    timezone: config.weather.timezone,
    current: "temperature_2m,apparent_temperature,wind_speed_10m,weather_code",
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

async function fetchWeather(attempts = 3): Promise<OpenMeteoResponse> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const response = await fetch(apiUrl(), {
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(`Open-Meteo returned HTTP ${response.status}`);
      }
      return (await response.json()) as OpenMeteoResponse;
    } catch (error) {
      lastError = error;
      if (i < attempts) {
        await new Promise((r) => setTimeout(r, i * 3_000));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function main(): Promise<void> {
  const api = await fetchWeather();
  const record = toWeatherRecord(api, {
    location: config.weather.label,
    timezone: config.weather.timezone,
    now: new Date(),
  });

  appendJsonl(config.paths.weather, record);
  fs.writeFileSync(
    config.paths.markdown,
    renderMarkdown(readJsonl<WeatherRecord>(config.paths.weather)),
    "utf8",
  );

  console.log(commitMessage(record));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

/** Pure formatting for the six-hourly time-and-temperature commit. No I/O here. */

export interface WeatherRecord {
  /** When the record was written, UTC. */
  ts: string;
  /** The observation time as Open-Meteo reported it, in the location's zone. */
  localTime: string;
  timezone: string;
  location: string;
  temperatureC: number;
  apparentC: number | null;
  windKph: number | null;
  weatherCode: number | null;
  description: string;
}

/** The Open-Meteo `current` block we ask for. */
export interface OpenMeteoResponse {
  timezone?: string;
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
}

/** WMO weather interpretation codes, grouped the way Open-Meteo documents them. */
const WMO: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export function weatherCodeDescription(code: number | null | undefined): string {
  if (code === null || code === undefined) return "Unknown";
  return WMO[code] ?? `Unknown (code ${code})`;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Validates the API payload and turns it into a record.
 *
 * Throws when the temperature is missing: the job's whole purpose is to commit
 * a temperature, and a run that commits "null °C" every six hours is worse than
 * a run that fails visibly.
 */
export function toWeatherRecord(
  api: OpenMeteoResponse,
  opts: { location: string; timezone: string; now: Date },
): WeatherRecord {
  const temperatureC = finiteOrNull(api.current?.temperature_2m);
  if (temperatureC === null) {
    throw new Error(
      `Open-Meteo returned no temperature: ${JSON.stringify(api).slice(0, 300)}`,
    );
  }
  const weatherCode = finiteOrNull(api.current?.weather_code);

  return {
    ts: opts.now.toISOString(),
    localTime: api.current?.time ?? opts.now.toISOString(),
    timezone: api.timezone ?? opts.timezone,
    location: opts.location,
    temperatureC,
    apparentC: finiteOrNull(api.current?.apparent_temperature),
    windKph: finiteOrNull(api.current?.wind_speed_10m),
    weatherCode,
    description: weatherCodeDescription(weatherCode),
  };
}

function cell(value: number | null, unit: string): string {
  return value === null ? "—" : `${value.toFixed(1)} ${unit}`;
}

export function toMarkdownRow(record: WeatherRecord): string {
  return [
    "",
    record.localTime.replace("T", " "),
    cell(record.temperatureC, "°C"),
    cell(record.apparentC, "°C"),
    cell(record.windKph, "km/h"),
    record.description,
    "",
  ].join(" | ").trim();
}

/** Short commit subject, e.g. "weather: 2026-08-06 14:00 Lisbon 27.3 °C". */
export function commitMessage(record: WeatherRecord): string {
  return `weather: ${record.localTime.replace("T", " ")} ${record.location.split(",")[0]} ${record.temperatureC.toFixed(1)} °C`;
}

/**
 * The visible log. Newest first and windowed, because this file is committed
 * four times a day forever — `data/weather.jsonl` keeps the full history.
 */
export function renderMarkdown(
  records: readonly WeatherRecord[],
  window = 48,
): string {
  const recent = [...records].slice(-window).reverse();
  const latest = recent[0];

  const lines = [
    "# Weather log",
    "",
    latest
      ? `**${latest.location}** — ${latest.temperatureC.toFixed(1)} °C, ${latest.description.toLowerCase()}, ` +
        `as of ${latest.localTime.replace("T", " ")} (${latest.timezone}).`
      : "_No readings yet._",
    "",
    `Updated every six hours by [\`weather.yml\`](.github/workflows/weather.yml).`,
    `Showing the last ${recent.length} reading${recent.length === 1 ? "" : "s"}; ` +
      "full history is in `data/weather.jsonl`.",
    "",
    "| Local time | Temperature | Feels like | Wind | Conditions |",
    "| --- | --- | --- | --- | --- |",
    ...recent.map(toMarkdownRow),
    "",
  ];

  return lines.join("\n");
}

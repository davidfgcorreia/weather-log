import { describe, expect, it } from "vitest";
import {
  commitMessage,
  renderMarkdown,
  toMarkdownRow,
  toWeatherRecord,
  weatherCodeDescription,
  type OpenMeteoResponse,
  type WeatherRecord,
} from "../src/format.js";

const NOW = new Date("2026-08-06T13:04:11.000Z");

const API: OpenMeteoResponse = {
  timezone: "Europe/Lisbon",
  current: {
    time: "2026-08-06T14:00",
    temperature_2m: 27.3,
    apparent_temperature: 28.1,
    wind_speed_10m: 12.4,
    weather_code: 0,
  },
};

const OPTS = {
  location: "Lisbon, Portugal",
  timezone: "Europe/Lisbon",
  now: NOW,
};

function record(overrides: Partial<WeatherRecord> = {}): WeatherRecord {
  return { ...toWeatherRecord(API, OPTS), ...overrides };
}

describe("weatherCodeDescription", () => {
  it("maps the common WMO codes", () => {
    expect(weatherCodeDescription(0)).toBe("Clear sky");
    expect(weatherCodeDescription(3)).toBe("Overcast");
    expect(weatherCodeDescription(65)).toBe("Heavy rain");
    expect(weatherCodeDescription(95)).toBe("Thunderstorm");
  });

  it("names an unmapped code instead of hiding it", () => {
    expect(weatherCodeDescription(42)).toBe("Unknown (code 42)");
  });

  it("handles a missing code", () => {
    expect(weatherCodeDescription(null)).toBe("Unknown");
    expect(weatherCodeDescription(undefined)).toBe("Unknown");
  });
});

describe("toWeatherRecord", () => {
  it("reads the whole current block", () => {
    expect(toWeatherRecord(API, OPTS)).toEqual({
      ts: "2026-08-06T13:04:11.000Z",
      localTime: "2026-08-06T14:00",
      timezone: "Europe/Lisbon",
      location: "Lisbon, Portugal",
      temperatureC: 27.3,
      apparentC: 28.1,
      windKph: 12.4,
      weatherCode: 0,
      description: "Clear sky",
    });
  });

  it("keeps a below-zero temperature", () => {
    const r = toWeatherRecord(
      { current: { ...API.current, temperature_2m: -4.2 } },
      OPTS,
    );
    expect(r.temperatureC).toBe(-4.2);
  });

  it("keeps a temperature of exactly zero", () => {
    // The falsy-zero bug: 0 °C is a real reading, not a missing one.
    const r = toWeatherRecord({ current: { temperature_2m: 0 } }, OPTS);
    expect(r.temperatureC).toBe(0);
  });

  it("records optional fields as null when absent", () => {
    const r = toWeatherRecord({ current: { temperature_2m: 21 } }, OPTS);
    expect(r.apparentC).toBeNull();
    expect(r.windKph).toBeNull();
    expect(r.weatherCode).toBeNull();
    expect(r.description).toBe("Unknown");
  });

  it("throws rather than committing a reading with no temperature", () => {
    for (const bad of [{}, { current: {} }, { current: { temperature_2m: null } }]) {
      expect(() => toWeatherRecord(bad as OpenMeteoResponse, OPTS)).toThrow(
        /no temperature/,
      );
    }
  });

  it("falls back to the configured timezone if the API omits it", () => {
    const r = toWeatherRecord({ current: { temperature_2m: 21 } }, OPTS);
    expect(r.timezone).toBe("Europe/Lisbon");
  });
});

describe("toMarkdownRow", () => {
  it("renders one row with units", () => {
    expect(toMarkdownRow(record())).toBe(
      "| 2026-08-06 14:00 | 27.3 °C | 28.1 °C | 12.4 km/h | Clear sky |",
    );
  });

  it("renders missing values as a dash, not as zero", () => {
    const row = toMarkdownRow(record({ apparentC: null, windKph: null }));
    expect(row).toBe("| 2026-08-06 14:00 | 27.3 °C | — | — | Clear sky |");
  });

  it("keeps one decimal place", () => {
    expect(toMarkdownRow(record({ temperatureC: 27 }))).toContain("27.0 °C");
  });
});

describe("commitMessage", () => {
  it("names the time, the city and the temperature", () => {
    expect(commitMessage(record())).toBe("weather: 2026-08-06 14:00 Lisbon 27.3 °C");
  });

  it("has no newline, so it stays a valid commit subject", () => {
    expect(commitMessage(record())).not.toContain("\n");
  });
});

describe("renderMarkdown", () => {
  it("says so when there are no readings", () => {
    expect(renderMarkdown([])).toContain("_No readings yet._");
  });

  it("leads with the most recent reading", () => {
    const md = renderMarkdown([
      record({ localTime: "2026-08-06T08:00", temperatureC: 19 }),
      record({ localTime: "2026-08-06T14:00", temperatureC: 27.3 }),
    ]);
    expect(md).toContain("**Lisbon, Portugal** — 27.3 °C, clear sky, as of 2026-08-06 14:00");
  });

  it("lists newest first", () => {
    const md = renderMarkdown([
      record({ localTime: "2026-08-06T08:00" }),
      record({ localTime: "2026-08-06T14:00" }),
    ]);
    const rows = md.split("\n").filter((l) => l.startsWith("| 2026-"));
    expect(rows[0]).toContain("14:00");
    expect(rows[1]).toContain("08:00");
  });

  it("windows the table so the committed file does not grow forever", () => {
    const records = Array.from({ length: 200 }, (_, i) =>
      record({ localTime: `2026-08-06T${String(i % 24).padStart(2, "0")}:00` }),
    );
    const rows = renderMarkdown(records).split("\n").filter((l) => l.startsWith("| 2026-"));
    expect(rows).toHaveLength(48);
  });

  it("shows the most recent window, not the oldest", () => {
    const records = Array.from({ length: 60 }, (_, i) =>
      record({ temperatureC: i }),
    );
    const md = renderMarkdown(records, 5);
    expect(md).toContain("59.0 °C");
    expect(md).not.toContain("| 0.0 °C |");
  });

  it("keeps a well-formed table header", () => {
    const md = renderMarkdown([record()]);
    expect(md).toContain("| Local time | Temperature | Feels like | Wind | Conditions |");
    expect(md).toContain("| --- | --- | --- | --- | --- |");
  });

  it("gets the singular right for one reading", () => {
    expect(renderMarkdown([record()])).toContain("last 1 reading;");
  });
});

import { describe, expect, it } from "vitest";
import { aggregate, byHour, conditions, filterRange, stats, summarize, toCsv, weekStart } from "../src/analytics.js";
import type { WeatherRecord } from "../src/format.js";

const rec = (localTime: string, temperatureC: number, extra: Partial<WeatherRecord> = {}): WeatherRecord => ({
  ts: `${localTime}:00Z`, localTime, timezone: "Europe/Lisbon", location: "Lisbon, Portugal",
  temperatureC, apparentC: temperatureC - 1, windKph: 10, weatherCode: 0, description: "Clear sky", ...extra,
});

const data = [
  rec("2026-11-16T03:00", 12),
  rec("2026-11-16T14:00", 20, { description: "Overcast", windKph: 25 }),
  rec("2026-11-17T14:00", 18, { description: "Overcast" }),
  rec("2026-11-23T14:00", 16, { description: "Slight rain", apparentC: null }),
];

describe("analytics", () => {
  it("filters by inclusive local date range", () => {
    expect(filterRange(data, { from: "2026-11-17" })).toHaveLength(2);
    expect(filterRange(data, { to: "2026-11-16" })).toHaveLength(2);
    expect(filterRange(data, { from: "2026-11-17", to: "2026-11-17" })).toHaveLength(1);
  });

  it("finds the Monday of an ISO week", () => {
    expect(weekStart("2026-11-16")).toBe("2026-11-16"); // Monday
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // Sunday
  });

  it("summarizes, with an even-length median", () => {
    expect(summarize([4, 1, 3, 2])).toEqual({ count: 4, min: 1, max: 4, mean: 2.5, median: 2.5 });
    expect(summarize([]).mean).toBeNull();
  });

  it("aggregates by day and week, skipping nulls", () => {
    const days = aggregate(data, "day", "temperatureC");
    expect(days.map((d) => d.key)).toEqual(["2026-11-16", "2026-11-17", "2026-11-23"]);
    expect(days[0]).toMatchObject({ min: 12, max: 20, mean: 16, count: 2 });
    const weeks = aggregate(data, "week", "apparentC");
    expect(weeks).toHaveLength(2);
    expect(weeks[1]).toMatchObject({ key: "2026-11-23", count: 0, mean: null });
  });

  it("reports extremes and condition counts", () => {
    const s = stats(data);
    expect(s.hottest?.temperatureC).toBe(20);
    expect(s.coldest?.temperatureC).toBe(12);
    expect(s.windiest?.windKph).toBe(25);
    expect(conditions(data)[0]).toEqual({ description: "Overcast", count: 2 });
  });

  it("averages by hour of day", () => {
    const h = byHour(data, "temperatureC");
    expect(h[3]).toBe(12);
    expect(h[14]).toBe(18);
    expect(h[0]).toBeNull();
  });

  it("writes CSV with empty cells for nulls and quotes commas", () => {
    const csv = toCsv([rec("2026-11-16T03:00", 12, { apparentC: null, description: "Rain, heavy" })]);
    expect(csv.split("\n")[1]).toBe('2026-11-16T03:00,12,,10,0,"Rain, heavy"');
  });
});

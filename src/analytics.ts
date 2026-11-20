/** Pure queries over the weather log for the dashboard. No I/O here. */
import type { WeatherRecord } from "./format.js";

export type Metric = "temperatureC" | "apparentC" | "windKph";
export type Bucket = "day" | "week" | "month";

export const METRICS: readonly Metric[] = ["temperatureC", "apparentC", "windKph"];
export const BUCKETS: readonly Bucket[] = ["day", "week", "month"];

export interface Range {
  /** Inclusive, `YYYY-MM-DD`, compared against the local date. */
  from?: string;
  to?: string;
}

/** Local calendar date of a reading, `YYYY-MM-DD`. */
export function localDate(r: WeatherRecord): string {
  return r.localTime.slice(0, 10);
}

export function filterRange(records: WeatherRecord[], range: Range): WeatherRecord[] {
  return records.filter((r) => {
    const d = localDate(r);
    if (range.from && d < range.from) return false;
    if (range.to && d > range.to) return false;
    return true;
  });
}

/** Monday of the ISO week containing `date` (`YYYY-MM-DD`). */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function bucketKey(r: WeatherRecord, bucket: Bucket): string {
  const d = localDate(r);
  if (bucket === "day") return d;
  if (bucket === "week") return weekStart(d);
  return d.slice(0, 7);
}

function values(records: WeatherRecord[], metric: Metric): number[] {
  return records
    .map((r) => r[metric])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface Summary {
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
}

export function summarize(nums: number[]): Summary {
  if (nums.length === 0) return { count: 0, min: null, max: null, mean: null, median: null };
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return {
    count: nums.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean: round1(nums.reduce((a, b) => a + b, 0) / nums.length),
    median: round1(median),
  };
}

export interface AggregateRow extends Summary {
  key: string;
}

/** Groups readings into day/week/month buckets and summarizes one metric per bucket. */
export function aggregate(
  records: WeatherRecord[],
  bucket: Bucket,
  metric: Metric,
): AggregateRow[] {
  const groups = new Map<string, WeatherRecord[]>();
  for (const r of records) {
    const k = bucketKey(r, bucket);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rs]) => ({ key, ...summarize(values(rs, metric)) }));
}

export interface Stats {
  count: number;
  first: string | null;
  last: string | null;
  metrics: Record<Metric, Summary>;
  hottest: WeatherRecord | null;
  coldest: WeatherRecord | null;
  windiest: WeatherRecord | null;
}

function extreme(
  records: WeatherRecord[],
  metric: Metric,
  pick: (a: number, b: number) => boolean,
): WeatherRecord | null {
  let best: WeatherRecord | null = null;
  for (const r of records) {
    const v = r[metric];
    if (typeof v !== "number") continue;
    if (!best || pick(v, best[metric] as number)) best = r;
  }
  return best;
}

export function stats(records: WeatherRecord[]): Stats {
  const metrics = Object.fromEntries(
    METRICS.map((m) => [m, summarize(values(records, m))]),
  ) as Record<Metric, Summary>;
  return {
    count: records.length,
    first: records[0]?.localTime ?? null,
    last: records[records.length - 1]?.localTime ?? null,
    metrics,
    hottest: extreme(records, "temperatureC", (a, b) => a > b),
    coldest: extreme(records, "temperatureC", (a, b) => a < b),
    windiest: extreme(records, "windKph", (a, b) => a > b),
  };
}

/** How often each condition was recorded, most frequent first. */
export function conditions(records: WeatherRecord[]): { description: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of records) counts.set(r.description, (counts.get(r.description) ?? 0) + 1);
  return [...counts.entries()]
    .map(([description, count]) => ({ description, count }))
    .sort((a, b) => b.count - a.count || a.description.localeCompare(b.description));
}

/** Mean of a metric by local hour of day (0–23); hours with no readings are null. */
export function byHour(records: WeatherRecord[], metric: Metric): (number | null)[] {
  const sums = Array.from({ length: 24 }, () => ({ s: 0, n: 0 }));
  for (const r of records) {
    const v = r[metric];
    if (typeof v !== "number") continue;
    const h = Number(r.localTime.slice(11, 13));
    if (!Number.isInteger(h) || h < 0 || h > 23) continue;
    sums[h]!.s += v;
    sums[h]!.n += 1;
  }
  return sums.map(({ s, n }) => (n ? round1(s / n) : null));
}

const CSV_COLUMNS = [
  "localTime",
  "temperatureC",
  "apparentC",
  "windKph",
  "weatherCode",
  "description",
] as const;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(records: WeatherRecord[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of records) lines.push(CSV_COLUMNS.map((c) => csvCell(r[c])).join(","));
  return `${lines.join("\n")}\n`;
}

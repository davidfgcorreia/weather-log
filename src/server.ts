/**
 * Local dashboard: a small HTTP API over data/weather.jsonl plus the page in web/.
 *
 *   npm run dashboard          → http://127.0.0.1:8787
 *   PORT=9000 npm run dashboard
 *
 * Read-only towards the log. The log is written by the GitHub Action, so the
 * server never appends to it: "Sync" pulls the Action's commits and "Live" asks
 * Open-Meteo for the current reading without saving it.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { readJsonl } from "./store.js";
import { toWeatherRecord, type WeatherRecord } from "./format.js";
import { fetchWeather } from "./update.js";
import {
  aggregate,
  BUCKETS,
  byHour,
  conditions,
  filterRange,
  METRICS,
  stats,
  toCsv,
  type Bucket,
  type Metric,
  type Range,
} from "./analytics.js";

const run = promisify(execFile);
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const WEB = path.join(config.paths.root, "web");

const DATE = /^\d{4}-\d{2}-\d{2}$/;

class BadRequest extends Error {}

function load(): WeatherRecord[] {
  return readJsonl<WeatherRecord>(config.paths.weather).sort((a, b) =>
    a.localTime.localeCompare(b.localTime),
  );
}

function rangeOf(q: URLSearchParams): Range {
  const from = q.get("from") || undefined;
  const to = q.get("to") || undefined;
  for (const [k, v] of [["from", from], ["to", to]] as const) {
    if (v && !DATE.test(v)) throw new BadRequest(`${k} must be YYYY-MM-DD, got "${v}"`);
  }
  return { from, to };
}

function pick<T extends string>(q: URLSearchParams, key: string, allowed: readonly T[], fallback: T): T {
  const v = q.get(key) ?? fallback;
  if (!(allowed as readonly string[]).includes(v)) {
    throw new BadRequest(`${key} must be one of ${allowed.join(", ")}`);
  }
  return v as T;
}

function send(res: http.ServerResponse, status: number, body: string, type: string, extra: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...extra });
  res.end(body);
}

const json = (res: http.ServerResponse, data: unknown, status = 200) =>
  send(res, status, JSON.stringify(data), "application/json; charset=utf-8");

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const q = url.searchParams;
  const route = `${req.method} ${url.pathname}`;

  switch (route) {
    case "GET /api/meta":
      return json(res, { location: config.weather.label, timezone: config.weather.timezone, metrics: METRICS, buckets: BUCKETS });

    case "GET /api/readings": {
      const rows = filterRange(load(), rangeOf(q));
      const limit = Number(q.get("limit") ?? 0);
      return json(res, limit > 0 ? rows.slice(-limit) : rows);
    }

    case "GET /api/stats":
      return json(res, stats(filterRange(load(), rangeOf(q))));

    case "GET /api/aggregate": {
      const bucket = pick<Bucket>(q, "bucket", BUCKETS, "day");
      const metric = pick<Metric>(q, "metric", METRICS, "temperatureC");
      return json(res, aggregate(filterRange(load(), rangeOf(q)), bucket, metric));
    }

    case "GET /api/conditions":
      return json(res, conditions(filterRange(load(), rangeOf(q))));

    case "GET /api/hourly": {
      const metric = pick<Metric>(q, "metric", METRICS, "temperatureC");
      return json(res, byHour(filterRange(load(), rangeOf(q)), metric));
    }

    case "GET /api/export.csv": {
      const range = rangeOf(q);
      const name = `weather_${range.from ?? "start"}_${range.to ?? "end"}.csv`;
      return send(res, 200, toCsv(filterRange(load(), range)), "text/csv; charset=utf-8", {
        "content-disposition": `attachment; filename="${name}"`,
      });
    }

    case "GET /api/live": {
      const api = await fetchWeather(1);
      const record = toWeatherRecord(api, {
        location: config.weather.label,
        timezone: config.weather.timezone,
        now: new Date(),
      });
      return json(res, record);
    }

    case "POST /api/sync": {
      const before = load().length;
      const { stdout, stderr } = await run("git", ["pull", "--ff-only"], { cwd: config.paths.root, timeout: 60_000 });
      return json(res, { output: `${stdout}${stderr}`.trim(), added: load().length - before });
    }

    default:
      return json(res, { error: `No route for ${route}` }, 404);
  }
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function serveStatic(res: http.ServerResponse, pathname: string): void {
  const rel = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.resolve(WEB, rel);
  if (!file.startsWith(WEB + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, "Not found", "text/plain");
  }
  send(res, 200, fs.readFileSync(file, "utf8"), TYPES[path.extname(file)] ?? "application/octet-stream");
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) return serveStatic(res, url.pathname);

  handleApi(req, res, url).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    json(res, { error: message }, error instanceof BadRequest ? 400 : 500);
  });
});

server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${PORT} is already in use. Stop the other server or run with PORT=<n>.`
      : error.message,
  );
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Weather dashboard on http://${HOST}:${PORT}`);
});

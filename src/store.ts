/** Append-only JSONL storage. The weather log is never rewritten, only extended. */

import fs from "node:fs";
import path from "node:path";

/** Appends one record as a single JSON line. Creates the file and directory if needed. */
export function appendJsonl<T>(file: string, record: T): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
}

/**
 * Reads a JSONL file. A missing file reads as empty. Malformed lines are skipped
 * rather than throwing — a half-written line from an interrupted run would
 * otherwise take the whole history down, and the history is the point.
 */
export function readJsonl<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  const out: T[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as T);
    } catch {
      // skip
    }
  }
  return out;
}

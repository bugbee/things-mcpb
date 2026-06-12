/**
 * Read-only access to the Things 3 SQLite database.
 *
 * The Things AppleScript/JXA bridge cannot read checklist items (the scripting
 * dictionary has no checklist class - confirmed against the official Things
 * AppleScript Guide). The only way to surface checklist data on the read path
 * (issue #22) is to read Things' local SQLite database directly, which is what
 * the things.py / things.sh projects do.
 *
 * This module reads the database READ-ONLY via the macOS `sqlite3` CLI (no new
 * dependency) and is intentionally fail-soft: if anything goes wrong (not macOS,
 * sqlite3 missing, database not found, schema change), it returns no data rather
 * than throwing, so responses degrade gracefully to empty checklists.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { homedir } from "os";
import { existsSync, readdirSync } from "fs";
import path from "path";
import { ThingsLogger } from "./utils.js";

const execFileAsync = promisify(execFile);

// Things checklist/task status integers -> string status
// (0 = incomplete/open, 2 = canceled, 3 = completed)
const STATUS_MAP = { 0: "open", 2: "canceled", 3: "completed" };

const GROUP_CONTAINER = "JLMPQHK86H.com.culturedcode.ThingsMac";

export function mapChecklistStatus(status) {
  return STATUS_MAP[status] !== undefined ? STATUS_MAP[status] : "open";
}

/**
 * Things task UUIDs are alphanumeric. Validate before interpolating into SQL
 * (the sqlite3 CLI doesn't take bind parameters on the command line).
 */
export function isValidTaskId(id) {
  return typeof id === "string" && /^[A-Za-z0-9]+$/.test(id);
}

/**
 * Build the checklist query. `index` is a SQL keyword so it must be quoted.
 */
export function buildChecklistQuery(ids) {
  const inList = ids.map((id) => `'${id}'`).join(",");
  return (
    `SELECT task, title, status FROM TMChecklistItem ` +
    `WHERE task IN (${inList}) ORDER BY task, "index";`
  );
}

/**
 * Recursively collect objects that look like a mapped to-do exposing a
 * `checklistItems` array, so we can enrich them in place. Handles arrays and
 * nested structures (e.g. projects with a `todos` array).
 */
export function collectChecklistTargets(data, acc = []) {
  if (Array.isArray(data)) {
    for (const item of data) collectChecklistTargets(item, acc);
  } else if (data && typeof data === "object") {
    if (typeof data.id === "string" && Array.isArray(data.checklistItems)) {
      acc.push(data);
    }
    for (const key of Object.keys(data)) {
      const val = data[key];
      if (val && typeof val === "object") collectChecklistTargets(val, acc);
    }
  }
  return acc;
}

/**
 * Group raw sqlite3 rows ({task, title, status}) into a map of
 * taskId -> [{ name, status, completed }], matching the shape add_todo returns.
 */
export function groupRows(rows) {
  const map = {};
  for (const row of rows) {
    if (!map[row.task]) map[row.task] = [];
    map[row.task].push({
      name: row.title,
      status: mapChecklistStatus(row.status),
      completed: row.status === 3,
    });
  }
  return map;
}

/**
 * Locate the Things SQLite database, checking the newer per-install location
 * first, then the legacy one. Returns null if not found.
 */
export function findDatabasePath() {
  const base = path.join(homedir(), "Library", "Group Containers", GROUP_CONTAINER);

  try {
    const dir = readdirSync(base).find((e) => e.startsWith("ThingsData-"));
    if (dir) {
      const p = path.join(base, dir, "Things Database.thingsdatabase", "main.sqlite");
      if (existsSync(p)) return p;
    }
  } catch (e) {
    // base directory not present (e.g. not macOS) - fall through
  }

  const legacy = path.join(base, "Things Database.thingsdatabase", "main.sqlite");
  if (existsSync(legacy)) return legacy;

  return null;
}

async function queryChecklistRows(dbPath, ids) {
  const { stdout } = await execFileAsync(
    "sqlite3",
    ["-readonly", "-json", dbPath, buildChecklistQuery(ids)],
    { timeout: 10000, maxBuffer: 10 * 1024 * 1024 }
  );
  const text = stdout.trim();
  return text ? JSON.parse(text) : [];
}

/**
 * Fetch checklist items for the given task ids, returning a taskId -> items map.
 * `deps` allows injecting the path finder / query runner for testing.
 */
export async function getChecklistItemsByTask(ids, deps = {}) {
  const findDb = deps.findDatabasePath || findDatabasePath;
  const runQuery = deps.queryChecklistRows || queryChecklistRows;

  const validIds = [...new Set(ids.filter(isValidTaskId))];
  if (validIds.length === 0) return {};

  const dbPath = findDb();
  if (!dbPath) {
    ThingsLogger.debug("Things database not found; checklist read skipped");
    return {};
  }

  try {
    const rows = await runQuery(dbPath, validIds);
    return groupRows(rows);
  } catch (e) {
    ThingsLogger.debug("Checklist read failed", { error: e.message });
    return {};
  }
}

/**
 * Enrich a tool result in place: populate `checklistItems` on any contained
 * to-do from the Things database. Never throws - on any failure the data is
 * returned unchanged (checklists stay as the JXA layer left them).
 *
 * Existing non-empty `checklistItems` (e.g. the items add_todo echoes for a
 * just-created to-do) are preserved when the database returns nothing for that
 * id, avoiding a write/read race wiping the confirmation.
 */
export async function enrichChecklists(data, deps = {}) {
  try {
    const targets = collectChecklistTargets(data);
    if (targets.length === 0) return data;

    const map = await getChecklistItemsByTask(targets.map((t) => t.id), deps);

    for (const target of targets) {
      const items = map[target.id];
      if (items && items.length > 0) {
        target.checklistItems = items;
      }
    }
  } catch (e) {
    ThingsLogger.debug("Checklist enrichment skipped", { error: e.message });
  }
  return data;
}

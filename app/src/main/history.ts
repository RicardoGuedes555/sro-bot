// Historico em SQLite (sql.js: o SQLite oficial em WebAssembly, sem modulo
// nativo). Arquivo em userData/history.sqlite; grava a cada 5 min e ao sair.

import fs from "node:fs";
import path from "node:path";

import { areaStats, type AreaStats, type HistEvent, nearestArea, type Sample } from "../controller/history";
import { readInTeam } from "../controller/team";
import { readTrainSnapshot } from "../controller/train";
import { sendCommand } from "./engine";

// Tipos minimos do sql.js (o pacote nao traz .d.ts).
interface SqlStatement {
  bind(values: unknown[]): void;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
}
interface SqlDatabase {
  run(sql: string, params?: unknown[]): void;
  prepare(sql: string): SqlStatement;
  export(): Uint8Array;
}
interface SqlJs {
  Database: new (data?: Uint8Array) => SqlDatabase;
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const initSqlJs = require("sql.js") as (cfg: { locateFile: (f: string) => string }) => Promise<SqlJs>;

let db: SqlDatabase | undefined;
let file = "";
let dirty = false;
let lastSave = 0;
const SAVE_EVERY_MS = 5 * 60 * 1000;

export async function initHistory(dir: string, wasmDir: string): Promise<void> {
  file = path.join(dir, "history.sqlite");
  const SQL = await initSqlJs({ locateFile: (f) => path.join(wasmDir, f) });
  db = new SQL.Database(fs.existsSync(file) ? fs.readFileSync(file) : undefined);
  db.run(`CREATE TABLE IF NOT EXISTS samples (ts INTEGER, level INTEGER, exp INTEGER, maxExp INTEGER, scene INTEGER,
    x REAL, z REAL, area TEXT, training INTEGER, dead INTEGER, hpPct REAL, members INTEGER)`);
  db.run("CREATE TABLE IF NOT EXISTS events (ts INTEGER, kind TEXT, text TEXT)");
  db.run("CREATE INDEX IF NOT EXISTS samples_ts ON samples(ts)");
  db.run("CREATE INDEX IF NOT EXISTS events_ts ON events(ts)");
}

export function flushHistory(force = false): void {
  if (!db || !dirty || (!force && Date.now() - lastSave < SAVE_EVERY_MS)) return;
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, file);
  dirty = false;
  lastSave = Date.now();
}

// Uma amostra: le o char e o time pelo engine (so leitura).
export async function recordSample(host: string, port: number, training: boolean): Promise<Sample | undefined> {
  if (!db) return undefined;
  const q = (tag: string, body: string) => sendCommand(host, port, tag, body);
  const s = await readTrainSnapshot(q);
  if (!s?.inWorld) return undefined;
  const team = await readInTeam(q);
  const sample: Sample = {
    ts: Date.now(),
    level: s.level,
    exp: s.exp,
    maxExp: s.maxExp ?? 0,
    scene: s.scene,
    x: s.pos?.[0],
    z: s.pos?.[2],
    area: nearestArea(s.scene, s.pos?.[0], s.pos?.[2]),
    training,
    dead: s.dead,
    hpPct: s.hp !== undefined && s.maxHp ? Math.round((1000 * s.hp) / s.maxHp) / 10 : undefined,
    members: team.inTeam ? team.members ?? 1 : 0,
  };
  db.run("INSERT INTO samples VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [
    sample.ts, sample.level, sample.exp, sample.maxExp, sample.scene ?? null, sample.x ?? null, sample.z ?? null,
    sample.area ?? null, sample.training ? 1 : 0, sample.dead ? 1 : 0, sample.hpPct ?? null, sample.members ?? null,
  ]);
  dirty = true;
  flushHistory();
  return sample;
}

export function recordEvent(e: HistEvent): void {
  if (!db) return;
  db.run("INSERT INTO events VALUES (?,?,?)", [e.ts, e.kind, e.text]);
  dirty = true;
}

function rows(sql: string, params: unknown[]): Record<string, unknown>[] {
  if (!db) return [];
  const st = db.prepare(sql);
  st.bind(params);
  const out: Record<string, unknown>[] = [];
  while (st.step()) out.push(st.getAsObject());
  st.free();
  return out;
}

export function historySummary(sinceMs: number): { areas: AreaStats[]; events: HistEvent[]; samples: number } {
  const since = Date.now() - sinceMs;
  const samples = rows("SELECT * FROM samples WHERE ts >= ? ORDER BY ts", [since]).map((r) => ({
    ts: Number(r.ts),
    level: Number(r.level),
    exp: Number(r.exp),
    maxExp: Number(r.maxExp),
    scene: r.scene === null ? undefined : Number(r.scene),
    area: r.area === null ? undefined : String(r.area),
    training: r.training === 1,
    dead: r.dead === 1,
    hpPct: r.hpPct === null ? undefined : Number(r.hpPct),
  }));
  const events = rows("SELECT * FROM events WHERE ts >= ? ORDER BY ts DESC LIMIT 40", [since]).map((r) => ({
    ts: Number(r.ts),
    kind: String(r.kind),
    text: String(r.text),
  }));
  return { areas: areaStats(samples), events, samples: samples.length };
}

// Aba de IA: config, chave (criptografada pelo Windows via safeStorage), leitura
// do estado do jogo pro assistente e chamada ao provedor. So leitura no jogo.

import { safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

import {
  type AiSettings,
  type AiSnapshot,
  type ChatMessage,
  charSummary,
  GEMINI_MODELS_URL,
  geminiRequest,
  MODEL_MISSING_RE,
  parseGeminiModelList,
  normalizeAiSettings,
  ollamaRequest,
  isOpenAiCompat,
  openAiModelsUrl,
  openAiRequest,
  parseModelList,
  pickModel,
  parseGeminiReply,
  parseOllamaReply,
  parseOpenAiReply,
  systemPrompt,
  trimHistory,
} from "../controller/ai";
import { actionsDoc } from "../controller/aiactions";
import { readInTeam, teamBonusPct } from "../controller/team";
import { floatFromBits } from "../controller/update";
import { queryPlayer, sendCommand } from "./engine";

let dir = "";

export function setAiDir(d: string): void {
  dir = d;
}

const settingsFile = () => path.join(dir, "ai.json");
const keyFile = () => path.join(dir, "ai-key.bin");

export function loadAiSettings(): AiSettings {
  try {
    return normalizeAiSettings(JSON.parse(fs.readFileSync(settingsFile(), "utf8")));
  } catch {
    return normalizeAiSettings(null);
  }
}

export function hasAiKey(): boolean {
  return fs.existsSync(keyFile());
}

// key: undefined mantem, "" apaga, texto grava (criptografado).
export function saveAiSettings(raw: Partial<AiSettings>, key?: string): AiSettings {
  const s = normalizeAiSettings(raw);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
  if (key === "") fs.rmSync(keyFile(), { force: true });
  else if (key) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("o Windows nao liberou a criptografia pra guardar a chave");
    fs.writeFileSync(keyFile(), safeStorage.encryptString(key.trim()));
  }
  return s;
}

function readKey(): string | undefined {
  try {
    return safeStorage.decryptString(fs.readFileSync(keyFile()));
  } catch {
    return undefined;
  }
}

// O que o app sabe e o jogo nao (treino, atividades, log), vindo do renderer.
export type AppInfo = Pick<AiSnapshot, "train" | "activities" | "recentLog">;

const CHEST_COLOR: Record<number, string> = { 0: "verde", 1: "azul", 2: "roxo", 3: "laranja" };
const BOX_STATE: Record<number, string> = { 1: "trancado", 2: "destravando", 3: "pronto" };

// Estado do jogo, campo a campo (nunca um objeto inteiro: nada de conta ou token).
export async function aiSnapshot(host: string, port: number, app: AppInfo, route?: string): Promise<AiSnapshot> {
  const q = (tag: string, body: string) => sendCommand(host, port, tag, body);
  const int = async (body: string) => {
    const r = await q("GETP", body);
    return typeof r.int === "number" ? r.int : undefined;
  };
  const snap: AiSnapshot = { ...app, route };
  const p = await queryPlayer(host, port);
  if (!p.ok) return { ...snap, char: undefined };
  snap.char = charSummary(p as unknown as Record<string, unknown>);
  snap.gold = await int("XBagDocument GetItemCount:1,0");
  // Pocoes dos espacos do Recover (4034/4035 HP, 4036/4037/4038 MP) e quantas restam.
  const potions: Record<string, number> = {};
  for (const opt of [4034, 4035, 4036, 4037, 4038]) {
    const id = await int(`XOptionsDocument GetValue:${opt}`);
    if (!id) continue;
    const name = await q("GETP", `Localization Localize:"ItemList_ItemName_${id}"`);
    const count = await int(`XBagDocument GetItemCount:${id},0`);
    if (count !== undefined) potions[typeof name.str === "string" && name.str ? name.str : String(id)] = count;
  }
  snap.potions = potions;
  const team = await readInTeam(q);
  snap.team = { ...team, bonusPct: team.members ? teamBonusPct(team.members) : 0 };
  const keys = await q("KEYS", "XSuperRiskDocument SlotBoxInfo");
  const chests: string[] = [];
  for (const k of Array.isArray(keys.keys) ? (keys.keys as number[]) : []) {
    const item = await int(`XSuperRiskDocument SlotBoxInfo get_Item:${k} itemID`);
    const st = await int(`XSuperRiskDocument SlotBoxInfo get_Item:${k} state`);
    const lt = await int(`XSuperRiskDocument SlotBoxInfo get_Item:${k} leftTime`);
    if (!st || !BOX_STATE[st]) continue; // pego ou descartado: nao ocupa espaco
    const left = lt !== undefined && st === 2 ? `, faltam ${Math.round(floatFromBits(lt) / 60)} min` : "";
    chests.push(`${CHEST_COLOR[(item ?? 0) % 50] ?? item} ${BOX_STATE[st ?? 0] ?? st}${left}`);
  }
  if (chests.length) snap.chests = chests.join("; ");
  return snap;
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}, timeoutMs = 60000): Promise<unknown> {
  // Sem resposta no prazo: diz isso em vez do "operation was aborted due to timeout"
  // (visto num PC de teste em 2026-11-11, lido como "modelo antigo").
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((e) => {
    if (/timeout|aborted/i.test(String(e))) throw new Error(`a IA nao respondeu em ${Math.round(timeoutMs / 1000)} s (provedor lento, fora do ar ou Ollama pesado demais pro PC); tente de novo ou use o Groq`);
    throw e;
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } | string }).error;
    throw new Error(typeof msg === "string" ? msg : msg?.message ?? `HTTP ${res.status}`);
  }
  return json;
}

export async function aiChat(history: ChatMessage[], snap: AiSnapshot): Promise<string> {
  const s = loadAiSettings();
  if (s.mode !== "ai") throw new Error("a IA esta no modo Manual");
  const lv = snap.char?.level;
  const sys = systemPrompt(snap, s.actions !== "off" && lv ? actionsDoc(lv) : undefined);
  const h = trimHistory(history);
  if (s.provider === "gemini") {
    const key = readKey();
    if (!key) throw new Error("falta a chave do Gemini (Configuracoes da IA)");
    const ask = (model: string) => {
      const r = geminiRequest(model, sys, h);
      return postJson(r.url, r.body, { "x-goog-api-key": key }, 120000).then(parseGeminiReply);
    };
    try {
      return await ask(s.model);
    } catch (e) {
      // Mesmo conserto dos outros: modelo que a chave nao tem vira um da lista dela.
      if (!MODEL_MISSING_RE.test(String(e))) throw e;
      const model = pickModel(s.model, await providerModels());
      if (model === s.model) throw e;
      saveAiSettings({ ...s, model });
      return ask(model);
    }
  }
  if (isOpenAiCompat(s.provider)) {
    const key = readKey();
    if (!key) throw new Error(`falta a chave do ${s.provider} (Configuracoes da IA)`);
    const ask = (model: string) => {
      const r = openAiRequest(s.provider as Parameters<typeof openAiRequest>[0], model, sys, h);
      return postJson(r.url, r.body, { Authorization: `Bearer ${key}` }, 120000).then(parseOpenAiReply);
    };
    try {
      return await ask(s.model);
    } catch (e) {
      // Modelo que o provedor nao tem: escolhe um da lista dele, salva e tenta de novo.
      if (!MODEL_MISSING_RE.test(String(e))) throw e;
      const model = pickModel(s.model, await providerModels());
      if (model === s.model) throw e;
      saveAiSettings({ ...s, model });
      return ask(model);
    }
  }
  const r = ollamaRequest(s.ollamaUrl, s.model, sys, h);
  return parseOllamaReply(await postJson(r.url, r.body, {}, 180000));
}

// Modelos do provedor salvo: Ollama (instalados) ou a lista da API (com a chave).
export async function providerModels(): Promise<string[]> {
  const s = loadAiSettings();
  if (s.provider === "ollama") return ollamaModels();
  const key = readKey();
  if (!key) return [];
  if (s.provider === "gemini") {
    try {
      const res = await fetch(GEMINI_MODELS_URL, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(8000) });
      return res.ok ? parseGeminiModelList(await res.json()) : [];
    } catch {
      return [];
    }
  }
  if (!isOpenAiCompat(s.provider)) return [];
  try {
    const res = await fetch(openAiModelsUrl(s.provider), { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
    return res.ok ? parseModelList(await res.json()) : [];
  } catch {
    return [];
  }
}

// Modelos instalados no Ollama (vazio se ele nao estiver rodando).
export async function ollamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${loadAiSettings().ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const j = (await res.json()) as { models?: { name?: string }[] };
    return (j.models ?? []).map((m) => m.name ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

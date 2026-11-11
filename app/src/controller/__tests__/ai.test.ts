import assert from "node:assert";
import { test } from "node:test";

import {
  charSummary,
  geminiRequest,
  normalizeAiSettings,
  ollamaRequest,
  parseGeminiReply,
  parseOllamaReply,
  systemPrompt,
  trimHistory,
} from "../ai";

test("config da IA: Manual por padrao e modelo padrao por provedor", () => {
  assert.deepEqual(normalizeAiSettings(null), {
    mode: "manual", provider: "ollama", model: "llama3.1", ollamaUrl: "http://127.0.0.1:11434", actions: "off",
  });
  assert.equal(normalizeAiSettings({ actions: "auto" }).actions, "auto");
  assert.equal(normalizeAiSettings({ actions: "rm -rf" as never }).actions, "off");
  const g = normalizeAiSettings({ mode: "ai", provider: "gemini", model: " ", ollamaUrl: "javascript:alert(1)" });
  assert.equal(g.mode, "ai");
  assert.equal(g.model, "gemini-2.5-flash");
  assert.equal(g.ollamaUrl, "http://127.0.0.1:11434"); // URL estranha volta pro padrao
  assert.equal(normalizeAiSettings({ ollamaUrl: "http://192.168.1.5:11434/" }).ollamaUrl, "http://192.168.1.5:11434");
});

test("resumo do char: so campos do jogo, em %, nada da conta", () => {
  // CONN real do Heroi (com campos extras que nao devem passar).
  const p = { ok: true, player: "0x7637", name: "Heroi", level: 87, exp: 850143, maxExp: 2258820361,
    hp: 16093, maxHp: 16181, mp: 739, maxMp: 26993, dead: false, inCombat: true, autoPlayOn: true,
    _account: "segredo", _pwd: "segredo" };
  const c = charSummary(p);
  assert.deepEqual(c, {
    name: "Heroi", level: 87, expPct: 0, exp: 850143, maxExp: 2258820361, expToNext: 2258820361 - 850143,
    hpPct: 99.5, mpPct: 2.7, dead: false, inCombat: true, autoPlay: true,
  });
  const sys = systemPrompt({ char: c });
  assert.doesNotMatch(sys, /segredo|0x7637/);
  assert.match(sys, /Nunca use travessao/);
  assert.match(sys, /nao executa/);
});

test("Gemini: chave fora da URL, papeis user/model, erro da API vira excecao", () => {
  const r = geminiRequest("gemini-2.5-flash", "SYS", [{ role: "user", text: "oi" }, { role: "assistant", text: "ola" }]);
  assert.equal(r.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
  assert.doesNotMatch(r.url, /key=/);
  assert.deepEqual((r.body as { contents: { role: string }[] }).contents.map((c) => c.role), ["user", "model"]);
  assert.equal(parseGeminiReply({ candidates: [{ content: { parts: [{ text: "a" }, { text: "b" }] } }] }), "ab");
  assert.throws(() => parseGeminiReply({ error: { message: "API key not valid" } }), /API key not valid/);
  assert.throws(() => parseGeminiReply({}), /vazia/);
});

test("Ollama: system primeiro, sem streaming", () => {
  const r = ollamaRequest("http://127.0.0.1:11434", "llama3.1", "SYS", [{ role: "user", text: "oi" }]);
  assert.equal(r.url, "http://127.0.0.1:11434/api/chat");
  const b = r.body as { stream: boolean; messages: { role: string; content: string }[] };
  assert.equal(b.stream, false);
  assert.deepEqual(b.messages, [{ role: "system", content: "SYS" }, { role: "user", content: "oi" }]);
  assert.equal(parseOllamaReply({ message: { content: "ok" } }), "ok");
  assert.throws(() => parseOllamaReply({ error: "model not found" }), /model not found/);
});

test("conversa curta: so as ultimas mensagens", () => {
  const h = Array.from({ length: 20 }, (_, i) => ({ role: "user" as const, text: String(i) }));
  assert.deepEqual(trimHistory(h).map((m) => m.text), ["8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"]);
});

test("provedores gratis no formato OpenAI: endereco fixo, chave fora do corpo, resposta e erro", async () => {
  const { normalizeAiSettings, openAiRequest, parseOpenAiReply, OPENAI_COMPAT } = await import("../ai");
  assert.equal(normalizeAiSettings({ provider: "groq" }).model, "llama-3.3-70b-versatile");
  assert.equal(normalizeAiSettings({ provider: "openrouter" }).provider, "openrouter");
  assert.equal(normalizeAiSettings({ provider: "xpto" as never }).provider, "ollama");
  const r = openAiRequest("mistral", "mistral-small-latest", "sys", [{ role: "user", text: "oi" }]);
  assert.equal(r.url, OPENAI_COMPAT.mistral);
  assert.deepEqual((r.body as { messages: { role: string }[] }).messages.map((m) => m.role), ["system", "user"]);
  assert.doesNotMatch(JSON.stringify(r.body), /Bearer|key/i);
  assert.equal(parseOpenAiReply({ choices: [{ message: { content: "ok" } }] }), "ok");
  assert.throws(() => parseOpenAiReply({ error: { message: "rate limit" } }), /rate limit/);
  assert.throws(() => parseOpenAiReply({ choices: [] }), /vazia/);
});

test("modelo do Ollama salvo num provedor de API vira o padrao (erro 'does not exist' do Groq)", async () => {
  const { normalizeAiSettings } = await import("../ai");
  assert.equal(normalizeAiSettings({ provider: "groq", model: "llama3.1:latest" }).model, "llama-3.3-70b-versatile");
  assert.equal(normalizeAiSettings({ provider: "ollama", model: "llama3.1:latest" }).model, "llama3.1:latest");
  assert.equal(normalizeAiSettings({ provider: "openrouter", model: "qwen/qwen3-32b:free" }).model, "qwen/qwen3-32b:free");
});

test("lista de modelos do provedor: tira audio/guarda e escolhe um que exista", async () => {
  const { openAiModelsUrl, parseModelList, pickModel } = await import("../ai");
  assert.equal(openAiModelsUrl("groq"), "https://api.groq.com/openai/v1/models");
  const list = parseModelList({ data: [
    { id: "whisper-large-v3" }, { id: "llama-guard-4-12b" }, { id: "openai/gpt-oss-120b" },
    { id: "llama-4-scout" }, { id: "qwen/qwen3-32b" }, { id: "velho", active: false },
  ] });
  assert.deepEqual(list, ["llama-4-scout", "openai/gpt-oss-120b", "qwen/qwen3-32b"]);
  assert.equal(pickModel("llama-3.3-70b-versatile", list), "openai/gpt-oss-120b"); // o salvo sumiu
  assert.equal(pickModel("qwen/qwen3-32b", list), "qwen/qwen3-32b"); // o salvo existe
  assert.equal(pickModel("x", []), "x"); // lista nao lida: mantem
});

test("char pra IA: EXP sem sinal e quanto falta pro proximo nivel", async () => {
  const { charSummary } = await import("../ai");
  // Lv.87 do Heroi: maximo 2.258.820.361 chega como int32 negativo.
  const c = charSummary({ level: 87, exp: 160_000_000, maxExp: -2036146935 });
  assert.equal(c?.maxExp, 2258820361);
  assert.equal(c?.expToNext, 2258820361 - 160_000_000);
  assert.equal(c?.expPct, 7.1);
});

test("Gemini: lista de modelos da chave so com os de conversa, e escolha automatica quando o salvo nao existe", async () => {
  const { parseGeminiModelList, pickModel, MODEL_MISSING_RE } = await import("../ai");
  const list = parseGeminiModelList({
    models: [
      { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent", "countTokens"] },
      { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
      { name: "models/gemini-2.5-flash-preview-tts", supportedGenerationMethods: ["generateContent"] },
      { name: "models/imagen-4.0-generate-001", supportedGenerationMethods: ["predict"] },
      { name: "models/gemini-2.5-flash-image", supportedGenerationMethods: ["generateContent"] },
    ],
  });
  assert.deepEqual(list, ["gemini-2.5-flash", "gemini-2.5-pro"]);
  assert.equal(pickModel("gemini-1.5-flash", list), "gemini-2.5-flash");
  assert.equal(pickModel("gemini-2.5-pro", list), "gemini-2.5-pro");
  assert.equal(pickModel("x", ["gemini-3.0-flash", "gemini-3.0-pro"]), "gemini-3.0-flash");
  assert.ok(MODEL_MISSING_RE.test("models/gemini-1.5-flash is not found for API version v1beta, or is not supported for generateContent."));
  assert.equal(parseGeminiModelList(null).length, 0);
});

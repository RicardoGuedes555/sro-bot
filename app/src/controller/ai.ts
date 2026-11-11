// Aba de IA (fase 1): assistente opcional que conversa sobre o estado real do
// bot e sugere acoes. Nao executa nada no jogo. Modo "manual" (padrao) nao faz
// nenhuma chamada de rede. Provedores: Ollama (local, gratis), Gemini e os de API
// no formato da OpenAI com plano gratis (OpenRouter, Groq, Mistral; chave do
// usuario). Logica pura; o main guarda a config, le o jogo e chama o provedor.

import type { AiActionsMode } from "./aiactions";
import type { Build } from "./build";

export type AiMode = "manual" | "ai";
export type AiProvider = "ollama" | "gemini" | "openrouter" | "groq" | "mistral";

// Provedores no formato da OpenAI (/chat/completions). Endereco fixo: a chave so
// vai pra esses hosts. O Gemini passou a pedir pre-pagamento em 2026-11-07
// (ai.google.dev/gemini-api/docs/billing#prepay); estes tem plano gratis sem
// cartao (limites mudam: conferir no site de cada um).
export const OPENAI_COMPAT: Record<"openrouter" | "groq" | "mistral", string> = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
};

export function isOpenAiCompat(p: AiProvider): p is keyof typeof OPENAI_COMPAT {
  return p in OPENAI_COMPAT;
}

export interface AiSettings {
  mode: AiMode;
  provider: AiProvider;
  model: string;
  ollamaUrl: string;
  actions: AiActionsMode; // off = so sugere; confirm = botao Executar; auto = executa sozinho
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  mode: "manual",
  provider: "ollama",
  model: "",
  ollamaUrl: "http://127.0.0.1:11434",
  actions: "off",
};

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  ollama: "llama3.1",
  gemini: "gemini-2.5-flash",
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-small-latest",
};

const PROVIDERS: AiProvider[] = ["ollama", "gemini", "openrouter", "groq", "mistral"];

// Modelo do Ollama ("llama3.1:latest") salvo num provedor de API da erro
// "does not exist" (visto 2026-11-07 com o Groq): vira o padrao do provedor.
function modelFor(provider: AiProvider, raw: unknown): string {
  const m = typeof raw === "string" ? raw.trim() : "";
  if (!m || (provider !== "ollama" && /:latest$/i.test(m))) return DEFAULT_MODELS[provider];
  return m;
}

export function normalizeAiSettings(raw: Partial<AiSettings> | null | undefined): AiSettings {
  const r = raw ?? {};
  const provider: AiProvider = PROVIDERS.includes(r.provider as AiProvider) ? (r.provider as AiProvider) : "ollama";
  const url = typeof r.ollamaUrl === "string" && /^https?:\/\/[\w.:-]+\/?$/.test(r.ollamaUrl.trim())
    ? r.ollamaUrl.trim().replace(/\/$/, "")
    : DEFAULT_AI_SETTINGS.ollamaUrl;
  return {
    mode: r.mode === "ai" ? "ai" : "manual",
    provider,
    model: modelFor(provider, r.model),
    ollamaUrl: url,
    actions: r.actions === "confirm" || r.actions === "auto" ? r.actions : "off",
  };
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

// Estado que vai pro modelo. So dados do jogo e do bot: nada de conta, senha,
// token ou e-mail (o snapshot e montado campo a campo, nunca um objeto inteiro).
export interface AiSnapshot {
  char?: {
    name?: string; level?: number; expPct?: number; exp?: number; maxExp?: number; expToNext?: number;
    hpPct?: number; mpPct?: number; dead?: boolean; inCombat?: boolean; autoPlay?: boolean;
  };
  gold?: number;
  potions?: Record<string, number>;
  team?: { inTeam: boolean; members?: number; bonusPct?: number };
  chests?: string;
  train?: { running: boolean; spots?: string[]; spotNow?: number; hpGuardPct?: number; deathLimit?: number };
  route?: string;
  activities?: string[];
  recentLog?: string[];
  // Personagem completo: atributos, equipamento (+refino), maestrias e skills.
  build?: Build;
  // Historico das ultimas 24 h: EXP/h por area e os ultimos eventos.
  history?: { areas: { area: string; minutes: number; expPerHour: number; minHpPct?: number; deaths: number }[]; events: string[] };
}

const pct = (a?: number, b?: number) => (a !== undefined && b ? Math.round((1000 * a) / b) / 10 : undefined);

// O engine manda exp/maxExp como int32 (o maximo do Lv.87 chega negativo).
const u32 = (v: number | undefined) => (v !== undefined && v < 0 ? v + 2 ** 32 : v);

export function charSummary(p: Record<string, unknown>): AiSnapshot["char"] {
  const n = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : undefined);
  const exp = u32(n("exp"));
  const maxExp = u32(n("maxExp"));
  return {
    name: typeof p.name === "string" ? p.name : undefined,
    level: n("level"),
    expPct: pct(exp, maxExp),
    // Pra IA estimar o tempo ate o proximo nivel (com o EXP/h do historico).
    exp,
    maxExp,
    expToNext: exp !== undefined && maxExp ? Math.max(0, maxExp - exp) : undefined,
    hpPct: pct(n("hp"), n("maxHp")),
    mpPct: pct(n("mp"), n("maxMp")),
    dead: p.dead === true,
    inCombat: p.inCombat === true,
    autoPlay: p.autoPlayOn === true,
  };
}

// actionsDoc: lista de acoes permitidas (so com as acoes ligadas na aba IA).
export function systemPrompt(s: AiSnapshot, actionsDoc?: string): string {
  return [
    "Voce e o assistente do SRO Bot, um bot do jogo Silkroad Origin Mobile.",
    "Responda em portugues do Brasil, curto e direto. Nunca use travessao.",
    "Use o ESTADO ATUAL abaixo (dados reais lidos do jogo agora). Se algo nao estiver nele, diga que nao sabe.",
    "Tempo ate o proximo nivel = char.expToNext dividido pelo EXP/h (history.areas, a area atual ou a media).",
    "build traz o personagem completo: atributos (ataque, defesa, STR/INT... ja somando o equipamento), equipamento com refino (+N) e grau (D), maestrias e skills (nivel/maximo e efeito).",
    "Em cada peca: base = atributos da peca no +0 (valores do jogo; os de reforco nao sao necessariamente %), porNivel = quanto cada +1 soma. Use pra comparar pecas e dizer qual vale refinar.",
    "Respeite build.tipo: em build INT o que importa e ataque magico, INT, MP e as skills das maestrias de elemento; nunca recomende subir STR ou ataque fisico. Em build STR, o contrario.",
    "O app tem so estas abas: Status, Estatisticas, Atividades (Treino, Tower, Continental, Firm, Guild), Ferramentas e IA. Nao invente abas, botoes ou opcoes; coisas do jogo (refino, pergaminhos, lojas) faca o usuario fazer no proprio jogo.",
    actionsDoc
      ? "Voce pode pedir acoes da lista abaixo; o app valida cada uma e pode pedir confirmacao ao usuario."
      : "Voce so sugere: nao executa acoes. Quando sugerir, diga em qual aba e opcao do app o usuario faz.",
    "Regras do usuario: nada pago (Silk), nunca arriscar o personagem principal, sem tocar na tela.",
    ...(actionsDoc ? ["", actionsDoc] : []),
    "",
    "ESTADO ATUAL (JSON):",
    JSON.stringify(s),
  ].join("\n");
}

// Gemini (generateContent). A chave vai no header, nunca na URL.
export function geminiRequest(model: string, system: string, history: ChatMessage[]): { url: string; body: unknown } {
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] })),
    },
  };
}

export function parseGeminiReply(json: unknown): string {
  const j = json as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
  if (j?.error?.message) throw new Error(j.error.message);
  const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("resposta vazia do Gemini");
  return text;
}

// Ollama (/api/chat, sem streaming).
export function ollamaRequest(baseUrl: string, model: string, system: string, history: ChatMessage[]): { url: string; body: unknown } {
  return {
    url: `${baseUrl}/api/chat`,
    body: {
      model,
      stream: false,
      messages: [{ role: "system", content: system }, ...history.map((m) => ({ role: m.role, content: m.text }))],
    },
  };
}

export function parseOllamaReply(json: unknown): string {
  const j = json as { message?: { content?: string }; error?: string };
  if (j?.error) throw new Error(j.error);
  const text = j?.message?.content ?? "";
  if (!text) throw new Error("resposta vazia do Ollama");
  return text;
}

// OpenAI-compativel (OpenRouter, Groq, Mistral). A chave vai no header Authorization.
export function openAiRequest(provider: keyof typeof OPENAI_COMPAT, model: string, system: string, history: ChatMessage[]): { url: string; body: unknown } {
  return {
    url: OPENAI_COMPAT[provider],
    body: {
      model,
      messages: [{ role: "system", content: system }, ...history.map((m) => ({ role: m.role, content: m.text }))],
    },
  };
}

// Lista de modelos do provedor (GET /models). O catalogo muda: em 2026-11-07 o
// Groq respondeu "llama-3.3-70b-versatile does not exist" pra chave do usuario.
export function openAiModelsUrl(provider: keyof typeof OPENAI_COMPAT): string {
  return OPENAI_COMPAT[provider].replace(/\/chat\/completions$/, "/models");
}

// So modelos de conversa (tira audio, voz, guarda, embedding).
export function parseModelList(json: unknown): string[] {
  const j = json as { data?: { id?: string; active?: boolean }[] };
  return (j?.data ?? [])
    .filter((m) => m.active !== false && typeof m.id === "string")
    .map((m) => m.id as string)
    .filter((id) => !/whisper|tts|guard|embed|audio|transcri|speech|moderation|playai|orpheus/i.test(id))
    .sort();
}

// Modelo a usar: o salvo, se o provedor tiver; senao o melhor da lista (grandes e
// conhecidos primeiro); lista vazia (nao deu pra ler) mantem o salvo.
export function pickModel(saved: string, list: string[]): string {
  if (!list.length || list.includes(saved)) return saved;
  const prefs = [/llama.*70b/i, /gpt-oss-120b/i, /qwen.*32b/i, /llama-4/i, /llama/i, /mistral-small/i, /gpt-oss/i,
    /^gemini-2\.5-flash$/i, /^gemini-[\d.]+-flash$/i, /^gemini-.*flash/i, /^gemini/i];
  for (const re of prefs) {
    const hit = list.find((m) => re.test(m));
    if (hit) return hit;
  }
  return list[0];
}

// Modelos do Gemini (GET /v1beta/models com a chave): so os que conversam
// (generateContent), sem o prefixo "models/"; fora embedding, imagem, audio e afins.
export const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";

export function parseGeminiModelList(json: unknown): string[] {
  const j = json as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
  return (j?.models ?? [])
    .filter((m) => typeof m.name === "string" && (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => (m.name as string).replace(/^models\//, ""))
    .filter((id) => !/embed|aqa|imagen|image|tts|audio|live|veo|learnlm|robotics|computer-use/i.test(id))
    .sort();
}

// Erro de modelo que o provedor nao tem (OpenAI e Gemini: "is not found for API version").
export const MODEL_MISSING_RE = /does not exist|not found|no access|model_not_found|invalid model|not supported for generateContent/i;

export function parseOpenAiReply(json: unknown): string {
  const j = json as { choices?: { message?: { content?: string } }[]; error?: { message?: string } | string };
  if (j?.error) throw new Error(typeof j.error === "string" ? j.error : j.error.message ?? "erro do provedor");
  const text = j?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("resposta vazia do provedor");
  return text;
}

// Mantem a conversa curta (custo e contexto): as ultimas N mensagens.
export function trimHistory(h: ChatMessage[], max = 12): ChatMessage[] {
  return h.slice(-max);
}

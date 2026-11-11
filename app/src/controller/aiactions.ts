// Acoes que a IA pode pedir no jogo (opcional, desligado por padrao). Lista
// fechada: a IA so escreve um bloco ```acao {...}```; quem valida e executa e o
// app, com as travas daqui. Nunca: desligar a caca em combate, nada pago.

import { type MonsterArea, MONSTER_AREAS } from "./areas";

export type AiActionsMode = "off" | "confirm" | "auto";

export type AiActionName =
  | "trocar_ponto"
  | "protecao_hp"
  | "entrar_time"
  | "passada_baus"
  | "continental_agora"
  | "pausar_na_cidade";

export interface AiAction {
  acao: AiActionName;
  area?: number;
  pct?: number;
  ligar?: boolean;
}

// Area no maximo 8 niveis abaixo do char: o char principal (87) aguentou 74-76 com HP
// minimo de 93% e morreu 2 vezes no Antelope (83).
export const SAFE_LEVEL_GAP = 8;

const NAMES: AiActionName[] = ["trocar_ponto", "protecao_hp", "entrar_time", "passada_baus", "continental_agora", "pausar_na_cidade"];

// Areas que a IA pode escolher pro char (do mais forte permitido pra baixo).
export function safeAreas(level: number, areas: MonsterArea[] = MONSTER_AREAS, span = 12): MonsterArea[] {
  const max = level - SAFE_LEVEL_GAP;
  return areas.filter((a) => a.level <= max && a.level >= max - span).sort((a, b) => b.level - a.level);
}

export function actionsDoc(level: number): string {
  const areas = safeAreas(level)
    .map((a) => `${a.id}: ${a.name} (${a.level}) cena ${a.scene} (${Math.round(a.x)}, ${Math.round(a.z)})`)
    .join("; ");
  return [
    "ACOES NO JOGO: voce pode pedir uma acao escrevendo um bloco assim (uma por bloco):",
    "```acao",
    '{"acao": "trocar_ponto", "area": 64}',
    "```",
    "Acoes: trocar_ponto {area: id da lista abaixo} (vira o ponto 1 do Treino; o anterior fica de reserva);",
    "protecao_hp {pct: 10..90} (troca de ponto se o HP cair abaixo disso); entrar_time {ligar: true|false};",
    "passada_baus {} (Continental, so baus); continental_agora {} (rola os dados com pausa segura);",
    "pausar_na_cidade {} (o Treino leva o char pra cidade e para).",
    `Areas permitidas pro char agora (nivel da area ate o do char menos ${SAFE_LEVEL_GAP}): ${areas || "nenhuma"}.`,
    "So peca acao quando ajudar de verdade e explique o porque em uma frase.",
  ].join("\n");
}

const BLOCK = /```acao\s*\n([\s\S]*?)```/g;

export function parseActions(text: string): AiAction[] {
  const out: AiAction[] = [];
  for (const m of text.matchAll(BLOCK)) {
    try {
      const j = JSON.parse(m[1]) as AiAction;
      if (j && NAMES.includes(j.acao)) out.push(j);
    } catch {
      // bloco invalido: ignora
    }
  }
  return out;
}

export function stripActions(text: string): string {
  return text.replace(BLOCK, "").replace(/\n{3,}/g, "\n\n").trim();
}

export type Validated =
  | { ok: true; desc: string; area?: MonsterArea }
  | { ok: false; erro: string };

export function validateAction(a: AiAction, level: number, areas: MonsterArea[] = MONSTER_AREAS): Validated {
  switch (a.acao) {
    case "trocar_ponto": {
      const area = areas.find((x) => x.id === a.area);
      if (!area) return { ok: false, erro: `area ${a.area} nao existe` };
      if (!level) return { ok: false, erro: "nivel do char desconhecido" };
      if (area.level > level - SAFE_LEVEL_GAP)
        return { ok: false, erro: `${area.name} (${area.level}) e forte demais pro nivel ${level} (maximo ${level - SAFE_LEVEL_GAP})` };
      return { ok: true, desc: `Treino: ponto 1 = ${area.name} (${area.level}), cena ${area.scene} (${Math.round(area.x)}, ${Math.round(area.z)})`, area };
    }
    case "protecao_hp": {
      const p = Number(a.pct);
      if (!Number.isFinite(p) || p < 10 || p > 90) return { ok: false, erro: "pct fora de 10..90" };
      return { ok: true, desc: `Treino: trocar de ponto com HP abaixo de ${Math.round(p)}%` };
    }
    case "entrar_time":
      return { ok: true, desc: a.ligar === false ? "Treino: nao entrar em time" : "Treino: sem time, entrar num time aberto" };
    case "passada_baus":
      return { ok: true, desc: "Continental: passada so de baus agora" };
    case "continental_agora":
      return { ok: true, desc: "Continental: rolar os dados agora (com pausa segura do Treino)" };
    case "pausar_na_cidade":
      return { ok: true, desc: "Treino: levar o char pra cidade e parar" };
    default:
      return { ok: false, erro: "acao desconhecida" };
  }
}

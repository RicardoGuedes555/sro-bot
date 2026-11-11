// Retrato do personagem pra IA (pedido do usuario em 2026-11-07: "a quantidade
// maxima possivel do personagem: skill, roupas, armas, def, atack"). So leitura,
// so dados do jogo. Logica pura; o main le pelo engine.
//
// Fontes (ver engine/DISCOVERY.md):
//   atributos: ATTR grava sro_attrvals.txt ("GetAttr(n) = i:.. l:<bits do double>")
//   equipamento: XBagDocument EquipBag get_Item:<slot> (itemID, enhanceInfo = +N)
//   nomes: Localization Localize:"ItemList_ItemName_<id>" e o ScriptName da skill

export const EQUIP_SLOTS = [
  "cabeca", "peito", "pernas", "maos", "pes", "ombros", "arma", "segunda mao", "colar", "brinco", "anel", "anel",
];

// Atributos que interessam (ids _Basic do XAttributeDefine; batem com a tela).
export const ATTR_FIELDS: Record<number, string> = {
  1: "STR",
  3: "INT",
  11: "HP maximo",
  15: "MP maximo",
  19: "ataque fisico min",
  20: "ataque fisico max",
  25: "ataque magico min",
  26: "ataque magico max",
  50: "defesa fisica",
  53: "defesa magica",
  56: "acerto",
  57: "esquiva",
  60: "critico %",
  61: "dano critico %",
  63: "reducao de dano fisico %",
  64: "reducao de dano magico %",
  14: "recuperacao de HP %",
  18: "recuperacao de MP %",
  21: "reforco ataque fisico min",
  22: "reforco ataque fisico max",
  27: "reforco ataque magico min",
  28: "reforco ataque magico max",
  51: "reforco defesa fisica",
  54: "reforco defesa magica",
};

export function parseAttrDump(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  const buf = new DataView(new ArrayBuffer(8));
  for (const m of text.matchAll(/GetAttr\((\d+)\) = i:-?\d+ l:(-?\d+)/g)) {
    const name = ATTR_FIELDS[Number(m[1])];
    if (!name) continue;
    buf.setBigInt64(0, BigInt(m[2]), true);
    const v = buf.getFloat64(0, true);
    if (Number.isFinite(v)) out[name] = Math.round(v * 10) / 10;
  }
  return out;
}

export interface EquipPiece {
  slot: string;
  name: string;
  enhance?: number; // +N
  grau?: number; // EquipRank (a True Flame Spear e 9)
  raridade?: number; // Rarity
  base?: Record<string, number>; // atributos da peca no +0 (EquipConf.Attributes)
  porNivel?: Record<string, number>; // quanto cada +1 soma (EquipConf.EnhanceAttrs)
}

// Atributos da peca: EquipConf.Attributes e EnhanceAttrs sao SeqListRef<double>, um
// struct {DataHandler; byte n (linhas); ...; ushort off}. Linha k: o indexBuffer[off+k]
// do DataHandler aponta pro inicio dela no doubleBuffer, que guarda (id do atributo,
// valor). Lido ao vivo em 2026-11-07: True Flame Spear 19=1001 20=1192 25=1923
// 26=2350 (ataque fisico/magico min/max), cada +1 = 25:56.6.
export function seqHeader(word8: number | undefined, word12: number | undefined): { n: number; off: number } | undefined {
  if (word8 === undefined || word12 === undefined) return undefined;
  return { n: word8 & 0xff, off: word12 & 0xffff };
}

// Elemento j de um UInt16[] lido em palavras de 32 bits ([#j>>1]).
export function u16Of(word: number, j: number): number {
  return j & 1 ? (word >>> 16) & 0xffff : word & 0xffff;
}

// Double a partir das duas palavras de 32 bits ([#i:2:0] e [#i:2:1]).
export function doubleOf(lo: number, hi: number): number {
  const b = new DataView(new ArrayBuffer(8));
  b.setInt32(0, lo, true);
  b.setInt32(4, hi, true);
  return b.getFloat64(0, true);
}

// Nome do atributo: o do ATTR_FIELDS (portugues) ou o do enum XAttributeDefine
// ("XAttr_PhysicalAtkMinIncPer_Basic" -> "PhysicalAtkMinIncPer").
export function attrName(id: number, enumNames: Record<number, string>): string {
  if (ATTR_FIELDS[id]) return ATTR_FIELDS[id];
  const e = enumNames[id];
  return e ? e.replace(/^XAttr_/, "").replace(/_Basic$/, "") : `atributo ${id}`;
}

// Enum do ENUM ({nome: valor}) -> {valor: nome}, so os _Basic (os ids das pecas).
export function basicAttrNames(values: Record<string, number> | undefined): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(values ?? {})) if (k.endsWith("_Basic") && out[v] === undefined) out[v] = k;
  return out;
}

export function attrRows(rows: [number, number][], enumNames: Record<number, string>): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const [id, v] of rows)
    if (Number.isFinite(id) && Number.isFinite(v)) out[attrName(Math.round(id), enumNames)] = Math.round(v * 100) / 100;
  return Object.keys(out).length ? out : undefined;
}

export interface SkillInfo {
  name: string;
  level: number;
  max: number;
  efeito?: string; // descricao do nivel atual (SkillList_CurrentLevelDescription_...)
}

// O GETP le byte como int32 (pega os vizinhos): so o byte de baixo.
export const byte = (v: number | undefined) => (v === undefined ? undefined : v & 0xff);

export interface Build {
  tipo?: string; // "INT (dano magico)", "STR (dano fisico)" ou "hibrido"
  attrs: Record<string, number>;
  equip: EquipPiece[];
  masteries: Record<string, number>; // so as usadas (nivel > 0)
  skills: SkillInfo[];
}

export const MASTERY_NAMES: Record<number, string> = {
  1: "Sword", 2: "Spear/Glaive", 3: "Bow", 4: "Cold", 5: "Lightning", 6: "Fire", 7: "Water/Force",
};

// Tipo da build pelos atributos (a IA recomendou STR pro char principal, que e INT).
export function buildType(attrs: Record<string, number>): string | undefined {
  const s = attrs.STR;
  const i = attrs.INT;
  if (!s || !i) return undefined;
  if (i >= s * 1.5) return "INT (dano magico)";
  if (s >= i * 1.5) return "STR (dano fisico)";
  return "hibrido";
}

// Cache do retrato: refaz a cada 10 min ou quando o nivel muda.
export const BUILD_TTL_MS = 10 * 60 * 1000;

export function buildStale(cachedAt: number, cachedLevel: number | undefined, level: number | undefined, now: number): boolean {
  return !cachedAt || now - cachedAt >= BUILD_TTL_MS || (level !== undefined && level !== cachedLevel);
}

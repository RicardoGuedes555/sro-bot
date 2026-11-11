// Venda do que nao serve (pedido do usuario em 2026-11-07: "vender tudo que nao for
// necessario"; grupos escolhidos por ele). Entram: equipamento de pet comum, restos
// de monstro, drops de monstro (pela descricao "Defeat ..."), itens de evento
// encerrado e kits da Caravana. NUNCA entram: cartas, materiais do Firm, pocoes,
// cristais, tickets, boosters, itens de pet, baus e caixas pra abrir. Logica pura;
// o main acha os itens e vende.
//
// Por metodo (provado ao vivo 2026-11-07 15:33, de qualquer lugar, sem mercador):
//   callx XSellDocument OnBagSelectSellItem 1 -- q:<uid de 64 bits>
//   callsn XSellDocument ReqSellOp 0
// (o Necklace of Battle caiu 9 -> 8 e o gold subiu; a lista de venda esvazia).

export interface JunkItem {
  id: number;
  name: string;
}

export const JUNK_ITEMS: JunkItem[] = [
  // Equipamento de pet comum (qualidade 0). O Amulet of Spirit 361001231 (q4) fica.
  { id: 361000210, name: "Claw of Battle" },
  { id: 361000220, name: "Claw of Life" },
  { id: 361000230, name: "Claw of Spirit" },
  { id: 361001210, name: "Amulet of Battle" },
  { id: 361001220, name: "Amulet of Life" },
  { id: 361001230, name: "Amulet of Spirit" },
  { id: 361002210, name: "Necklace of Battle" },
  { id: 361002220, name: "Necklace of Life" },
  { id: 361002230, name: "Necklace of Spirit" },
  { id: 361003210, name: "Tattoo of Battle" },
  { id: 361003220, name: "Tattoo of Life" },
  { id: 361003230, name: "Tattoo of Spirit" },
  // Restos de monstro do North Taklamakan (so viram elementos no Disjoint).
  { id: 850010287, name: "Dead stone" },
  { id: 850010289, name: "Soldier gauntlet" },
  { id: 850010291, name: "Assassin arrow" },
  { id: 850010292, name: "Bowman rib" },
  { id: 850010293, name: "Bowman gauntlet" },
  { id: 850010294, name: "Niya bow" },
  { id: 850010295, name: "Bowman leg bone" },
  { id: 850010296, name: "Bowman cloth" },
  // Itens de evento encerrado (festival, Halloween, aniversario; vendem por 0).
  // O Mid-Autumn Gift Box (5064) fica: e caixa pra abrir.
  { id: 4437, name: "Ice Crystal" },
  { id: 4438, name: "Ancient Tea Leaf" },
  { id: 5039, name: "Candle Shard" },
  { id: 5040, name: "Color Silk Thread" },
  { id: 5051, name: "Moon Crystal" },
  { id: 5109, name: "Spooky Candy" },
  { id: 5046, name: "Birthday Balloon" },
  // Kits da Caravana (sistema de trade, que o usuario nao usa).
  { id: 351002303, name: "Caravan Recovery Kit (Large)" },
  { id: 351002305, name: "Caravan Recovery Kit (Special)" },
  { id: 351002403, name: "Caravan Universal Pill (Large)" },
];

// Drop de monstro: item 4100xxxxx cuja descricao diz "Defeat <monstro> ... will have a
// chance to receive". Os materiais do Firm (mesma faixa de id) dizem "Used to
// complete the Firm's daily task" e nunca casam.
export function isMonsterDrop(itemID: number | undefined, description: string | undefined): boolean {
  if (itemID === undefined || !description || Math.floor(itemID / 100_000) !== 4100) return false;
  return /^\s*Defeat\b/i.test(description) && /chance to receive/i.test(description) && !/Firm/i.test(description);
}

const JUNK_IDS = new Set(JUNK_ITEMS.map((j) => j.id));

export function isJunk(itemID: number | undefined): boolean {
  return itemID !== undefined && JUNK_IDS.has(itemID);
}

// Abaixo disso de espacos livres o Treino vende o lixo (antes do aviso de 10).
export const SELL_BELOW_FREE = 15;
// Itens marcados por venda (um por ReqSellOp): com 2 ou mais o servidor respondeu
// "Items are waiting" e nao vendeu (2026-11-07 16:00); com 1 vendeu sempre.
export const SELL_BATCH = 1;
// Vendas por rodada, recusas seguidas antes de parar e releituras da mochila
// (quando o indice ja nao tem o item esperado).
export const SELL_MAX_PER_RUN = 80;
export const SELL_MAX_FAILS = 3;
export const SELL_MAX_SCANS = 4;

export function shouldSell(emptySlots: number | undefined): boolean {
  return emptySlots !== undefined && emptySlots >= 0 && emptySlots < SELL_BELOW_FREE;
}

// Quantidade plausivel: equipamento de pet nao empilha (tem que ser 1); o resto de
// 1 a 999 (pilha do jogo). Fora disso a copia local esta estranha (o
// DoSelectItemNumber deixou 256/512 nos de pet em 2026-11-07): nao vende.
export function plausibleCount(itemID: number | undefined, count: number | undefined): boolean {
  if (itemID === undefined || count === undefined) return false;
  return Math.floor(itemID / 1_000_000) === 361 ? count === 1 : count >= 1 && count <= 999;
}

export interface BagEntry {
  id?: number;
  count?: number;
  drop?: boolean; // drop de monstro (pela descricao)
}

// Indices da mochila a vender, em lotes.
export function sellBatches(items: BagEntry[]): number[][] {
  const idx = items.map((it, i) => ((isJunk(it.id) || it.drop) && plausibleCount(it.id, it.count) ? i : -1)).filter((i) => i >= 0);
  const out: number[][] = [];
  for (let i = 0; i < idx.length; i += SELL_BATCH) out.push(idx.slice(i, i + SELL_BATCH));
  return out;
}

// Ordem da venda: pilhas primeiro (pela janela de quantidade, vendem sempre), depois
// os avulsos (equipamento de pet), que o servidor as vezes recusa calado (2026-11-07,
// causa nao achada). Cada grupo de tras pra frente.
export function sellOrder(items: BagEntry[], indices: number[]): number[] {
  const desc = (a: number, b: number) => b - a;
  const stacks = indices.filter((i) => (items[i]?.count ?? 0) > 1).sort(desc);
  const singles = indices.filter((i) => (items[i]?.count ?? 0) <= 1).sort(desc);
  return [...stacks, ...singles];
}

// NAO usar o DoSelectItemNumber(XItem): em lote (2026-11-07 15:40) ele trocou a
// quantidade local dos itens pra 256/512 e o servidor nao vendeu nada. O caminho
// certo e marcar pelo uid de 64 bits (OnBagSelectSellItem), que vendeu a
// quantidade real (9 -> 8). O GETP so devolve 32 bits do uid; o inteiro sai do
// dump OBJV ("0x18 uid : System.UInt64 ... p=0x<hex>").
export function uidFromObjv(text: string): string | undefined {
  const m = /\buid : System\.UInt64\b.*?\bp=0x([0-9a-fA-F]{1,16})\b/.exec(text);
  return m ? BigInt("0x" + m[1]).toString() : undefined;
}

// itemID e quantidade do mesmo dump (o que esta de fato no indice agora).
export function itemFromObjv(text: string): { id?: number; count?: number } {
  const id = /\bitemID : System\.Int32\s+i=(-?\d+)/.exec(text);
  const count = /\bitemCount : System\.Int32\s+i=(-?\d+)/.exec(text);
  return { id: id ? Number(id[1]) : undefined, count: count ? Number(count[1]) : undefined };
}

// A mochila se reordena quando sai ou entra item (a caca segue soltando loot): o
// indice lido no inicio pode apontar pra outro item no meio da rodada. Em 2026-11-07
// 21:31, depois de vender o indice 145 (Soul Weapons), ele virou um material do
// Firm. Por isso o item do indice e conferido na hora (dump) e o pedido so sai se a
// lista de venda tiver exatamente o item esperado.
export function sameItem(expectedId: number, dump: { id?: number; count?: number }): boolean {
  return dump.id === expectedId && plausibleCount(dump.id, dump.count);
}

export function readyToSell(expectedId: number, listCount: number | undefined, listId: number | undefined): boolean {
  return listCount === 1 && listId === expectedId;
}

// Vendeu se o total daquele item na mochila caiu (o gold nao serve: a caca tambem soma).
export function soldByTotal(before: number | undefined, after: number | undefined): boolean {
  return before !== undefined && after !== undefined && after < before;
}

export const objvItemBody = (index: number) => `XBagDocument ItemBag Items get_Item:${Math.floor(index)}`;
export const itemTotalBody = (id: number) => `XBagDocument GetItemCount:${Math.floor(id)},0`;
export const SELL_LIST_COUNT = "XSellDocument m_SellList get_Count";
export const SELL_LIST_ID = "XSellDocument m_SellList get_Item:0 itemID";
export const selectForSaleBody = (uid: string) => `callx XSellDocument OnBagSelectSellItem 1 -- q:${uid}`;
export const CLEAR_SELL_LIST_BODY = "callp XSellDocument m_SellList Clear 0";
// Pilha: o OnBagSelectSellItem abre a janela de quantidade (XSelectSellItemDlg,
// "Quantity 999", seletor em 1). Confirma o maximo e vende por ela (provado ao vivo
// 2026-11-07 16:42: Marksman Seal 8070 -> 7071, +99.900 de gold). Item avulso nao
// abre a janela. A mochila do jogo (ItemSystemDlg) pode ficar aberta: fecha no fim.
export const SELL_QTY_VISIBLE = "getv XSelectSellItemDlg IsVisible";
export const SELL_QTY_MAX = "XSelectSellItemDlg m_MaxCanSellNum";
export const SELL_QTY_NOW = "XSelectSellItemDlg m_SellNumber";
export const sellQtyBody = (n: number) => `callx XSelectSellItemDlg OnNumpadBtnConfirmClicked 2 -- n i:${Math.floor(n)}`;
export const SELL_QTY_OK = "callsn XSelectSellItemDlg OnSellItem 1";
export const SELL_QTY_CLOSE = "callsn XSelectSellItemDlg OnCloseView 1";
export const BAG_VISIBLE = "getv ItemSystemDlg IsVisible";
export const BAG_CLOSE = "callsn ItemSystemDlg _OnCloseBtnClick 1";
export const SELL_BODY = "callsn XSellDocument ReqSellOp 0";

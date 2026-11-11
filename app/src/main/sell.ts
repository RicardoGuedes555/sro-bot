// Venda do lixo (ver controller/sell): acha os itens da lista na mochila, marca em
// lotes e vende; confere pelo numero de itens e pelo gold.

import {
  BAG_CLOSE,
  BAG_VISIBLE,
  type BagEntry,
  CLEAR_SELL_LIST_BODY,
  SELL_QTY_CLOSE,
  SELL_QTY_MAX,
  SELL_QTY_NOW,
  SELL_QTY_OK,
  SELL_QTY_VISIBLE,
  sellQtyBody,
  isJunk,
  isMonsterDrop,
  itemFromObjv,
  itemTotalBody,
  readyToSell,
  sameItem,
  SELL_LIST_COUNT,
  SELL_LIST_ID,
  SELL_MAX_SCANS,
  soldByTotal,
  objvItemBody,
  SELL_BODY,
  SELL_MAX_FAILS,
  SELL_MAX_PER_RUN,
  selectForSaleBody,
  sellBatches,
  sellOrder,
  uidFromObjv,
} from "../controller/sell";

type Query = (tag: string, body: string) => Promise<Record<string, unknown>>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (r: Record<string, unknown>) => (r.ok === true && typeof r.int === "number" ? r.int : undefined);

// Le o arquivo do OBJV gravado pelo engine (o main passa o leitor com o serial atual).
let readObjv: (() => Promise<string>) | undefined;
export function setObjvReader(fn: () => Promise<string>): void {
  readObjv = fn;
}

// Copias que o servidor recusou (uid): ficam de fora ate reabrir o app. Em
// 2026-11-07 a recusa foi por copia, nao por tipo (Claw of Life vendeu 2 de 2, uma
// Necklace of Battle vendeu a tarde e outra copia foi recusada a noite); suspeita:
// as copias que o DoSelectItemNumber em lote mexeu ficaram presas no servidor.
const refusedUids = new Set<string>();

// Descricao traduzida por item (cache: nao muda).
const descCache = new Map<number, string>();
async function description(q: Query, id: number): Promise<string> {
  let d = descCache.get(id);
  if (d === undefined) {
    const r = await q("GETP", `Localization Localize:"ItemList_ItemDescription_${id}"`);
    d = typeof r.str === "string" ? r.str : "";
    descCache.set(id, d);
  }
  return d;
}

async function bagIDs(q: Query): Promise<BagEntry[]> {
  const n = num(await q("GETP", "XBagDocument ItemBag Items get_Count")) ?? 0;
  const out: BagEntry[] = [];
  for (let i = 0; i < n; i++) {
    const id = num(await q("GETP", `XBagDocument ItemBag Items get_Item:${i} itemID`));
    const drop = id !== undefined && Math.floor(id / 100_000) === 4100 && isMonsterDrop(id, await description(q, id));
    // A quantidade so importa pro que vai ser vendido (le so dele).
    const count = isJunk(id) || drop ? num(await q("GETP", `XBagDocument ItemBag Items get_Item:${i} itemCount`)) : undefined;
    out.push({ id, count, drop });
  }
  return out;
}

// Vende tudo da lista que estiver na mochila, um item por pedido: pilhas primeiro,
// depois avulsos, cada grupo de tras pra frente (sellOrder). A mochila se reordena com a venda e com o loot da caca, entao cada indice
// e conferido na hora (dump OBJV): se ja nao tem o item esperado, rele a mochila.
// O pedido so sai com a lista de venda contendo exatamente aquele item. Venda conta
// se o total daquele item caiu; 3 recusas seguidas param.
export async function sellJunk(q: Query, log: (m: string) => void): Promise<number> {
  const gold = async () => num(await q("GETP", "XBagDocument GetItemCount:1,0")) ?? 0;
  const count = async () => num(await q("GETP", "XBagDocument ItemBag Items get_Count")) ?? 0;
  const goldBefore = await gold();
  const itemsBefore = await count();
  let sold = 0;
  let refused = 0;
  let skipped = 0;
  let fails = 0;
  let tries = 0;
  for (let scan = 0; scan < SELL_MAX_SCANS && fails < SELL_MAX_FAILS && tries < SELL_MAX_PER_RUN; scan++) {
    const bag = await bagIDs(q);
    const candidates = sellOrder(bag, sellBatches(bag).flat());
    let shifted = false;
    for (const i of candidates) {
      if (fails >= SELL_MAX_FAILS || tries >= SELL_MAX_PER_RUN) break;
      const expected = bag[i].id as number;
      if ((await q("OBJV", objvItemBody(i))).ok !== true || !readObjv) continue;
      const dump = await readObjv();
      // Mudou de lugar: rele a mochila em vez de mexer em outro item.
      if (!sameItem(expected, itemFromObjv(dump))) {
        shifted = true;
        break;
      }
      const uid = uidFromObjv(dump);
      if (!uid || refusedUids.has(uid)) continue;
      tries++;
      const total0 = num(await q("GETP", itemTotalBody(expected)));
      await q("SKIL", CLEAR_SELL_LIST_BODY);
      await sleep(300);
      await q("SKIL", selectForSaleBody(uid));
      // Pilha: janela de quantidade (pode demorar a abrir). Confirma o maximo.
      let dlg = false;
      for (let t = 0; t < 5 && !dlg; t++) {
        await sleep(300);
        dlg = (await q("SKIL", SELL_QTY_VISIBLE)).bool === true;
        if (!dlg && num(await q("GETP", SELL_LIST_COUNT))) break; // avulso: ja entrou na lista
      }
      if (dlg) {
        const max = num(await q("GETP", SELL_QTY_MAX)) ?? 0;
        if (max > 0) await q("SKIL", sellQtyBody(max));
        await sleep(300);
        if (max > 0 && num(await q("GETP", SELL_QTY_NOW)) === max) await q("SKIL", SELL_QTY_OK);
        else await q("SKIL", SELL_QTY_CLOSE);
        await sleep(400);
      }
      const listCount = num(await q("GETP", SELL_LIST_COUNT));
      const listId = listCount ? num(await q("GETP", SELL_LIST_ID)) : undefined;
      if (!readyToSell(expected, listCount, listId)) {
        // Nada (ou outra coisa) marcado: nao manda o pedido.
        await q("SKIL", CLEAR_SELL_LIST_BODY);
        skipped++;
        continue;
      }
      await q("SKIL", SELL_BODY);
      let ok = false;
      for (let t = 0; t < 6 && !ok; t++) {
        await sleep(400);
        ok = soldByTotal(total0, num(await q("GETP", itemTotalBody(expected))));
      }
      if (ok) {
        sold++;
        fails = 0;
      } else {
        refusedUids.add(uid);
        refused++;
        fails++;
      }
    }
    if (!shifted) break;
  }
  if ((await q("SKIL", SELL_QTY_VISIBLE)).bool === true) await q("SKIL", SELL_QTY_CLOSE);
  await q("SKIL", CLEAR_SELL_LIST_BODY);
  if ((await q("SKIL", BAG_VISIBLE)).bool === true) await q("SKIL", BAG_CLOSE);
  const freed = Math.max(0, itemsBefore - (await count()));
  if (sold || refused || skipped)
    log(`venda do lixo: ${freed} espaco(s) liberado(s), ${sold} venda(s), ${refused} recusada(s), ${skipped} pulada(s), +${Math.max(0, (await gold()) - goldBefore).toLocaleString("pt-BR")} de gold.`);
  return freed;
}

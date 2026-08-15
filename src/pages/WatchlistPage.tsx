import { useState, useEffect, useCallback } from 'react';
import { Star, Plus, X, Search, GripVertical, Trash2 } from 'lucide-react';
import {
  listWatchlists, createWatchlists, createWatchlist, deleteWatchlist,
  listWatchlistItems, addWatchlistItems, deleteWatchlistItem, swapWatchlistItemOrder,
} from '../lib/data/watchlists.repo';
import { subscribeLivePrice } from '../lib/binance';
import { CRYPTO_INSTRUMENTS, ALL_INSTRUMENTS } from '../lib/types';

interface Watchlist {
  id: string;
  name: string;
  category: string;
  is_default: boolean;
}

interface WatchlistItem {
  id: string;
  watchlist_id: string;
  symbol: string;
  label: string;
  market: string;
  display_order: number;
}


export default function WatchlistPage() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [newListName, setNewListName] = useState('');
  const [showNewList, setShowNewList] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const lists = (await listWatchlists()) as Watchlist[];
    setWatchlists(lists);
    if (lists.length > 0 && !activeListId) setActiveListId(lists[0].id);
    if (lists.length === 0) {
      // Create default watchlists
      const defaults = [
        { name: 'Crypto', category: 'crypto', is_default: true },
        { name: 'Favorites', category: 'favorites', is_default: true },
      ];
      const created = (await createWatchlists(defaults)) as Watchlist[];
      if (created.length > 0) {
        setWatchlists(created as Watchlist[]);
        setActiveListId((created as Watchlist[])[0].id);
        // Add top crypto to the Crypto list
        const cryptoList = (created as Watchlist[]).find((l) => l.category === 'crypto');
        if (cryptoList) {
          const cryptoItems = CRYPTO_INSTRUMENTS.filter((i) => i.live).slice(0, 6).map((inst, idx) => ({
            watchlist_id: cryptoList.id, symbol: inst.symbol, label: inst.label,
            market: 'crypto', display_order: idx,
          }));
          await addWatchlistItems(cryptoItems);
        }
      }
    }
    setLoading(false);
  }, [activeListId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load items for active watchlist
  useEffect(() => {
    if (!activeListId) return;
    (async () => {
      setItems((await listWatchlistItems(activeListId)) as WatchlistItem[]);
    })();
  }, [activeListId]);

  // Subscribe to live prices for items
  const liveSymbols = items.filter((i) => i.market === 'crypto').map((i) => i.symbol);
  useEffect(() => {
    if (liveSymbols.length === 0) return;
    const unsub = subscribeLivePrice(liveSymbols, (sym, price) => {
      setLivePrices((prev) => ({ ...prev, [sym]: price }));
    });
    return () => unsub();
  }, [liveSymbols.join(',')]);

  const activeList = watchlists.find((l) => l.id === activeListId);
  const filteredInstruments = ALL_INSTRUMENTS.filter((inst) => {
    const s = search.toLowerCase();
    return !s || inst.label.toLowerCase().includes(s) || inst.symbol.toLowerCase().includes(s);
  }).filter((inst) => {
    if (!activeList) return true;
    if (activeList.category === 'favorites') return true;
    if (activeList.category === 'custom') return true;
    return inst.market === activeList.category;
  }).filter((inst) => !items.some((i) => i.symbol === inst.symbol));

  const addItem = async (symbol: string, label: string, market: string) => {
    if (!activeListId) return;
    const order = items.length;
    await addWatchlistItems([{ watchlist_id: activeListId, symbol, label, market, display_order: order }]);
    setShowAdd(false); setSearch('');
    setItems((await listWatchlistItems(activeListId)) as WatchlistItem[]);
  };

  const removeItem = async (id: string) => {
    await deleteWatchlistItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const createList = async () => {
    if (!newListName.trim()) return;
    const data = await createWatchlist(newListName.trim());
    if (data) {
      setWatchlists((prev) => [...prev, data as Watchlist]);
      setActiveListId(data.id);
      setNewListName(''); setShowNewList(false);
    }
  };

  const deleteList = async (id: string) => {
    await deleteWatchlist(id);
    setWatchlists((prev) => prev.filter((l) => l.id !== id));
    if (activeListId === id) setActiveListId(watchlists[0]?.id ?? null);
  };

  const moveItem = async (id: string, dir: -1 | 1) => {
    const sorted = [...items].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((i) => i.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx], b = sorted[swapIdx];
    await swapWatchlistItemOrder(a, b);
    setItems((await listWatchlistItems(activeListId)) as WatchlistItem[]);
  };

  if (loading) return <div className="px-4 lg:px-6 py-12 text-center text-muted text-sm">Loading watchlists…</div>;

  return (
    <div className="px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Star className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">Watchlists</h1>
          <p className="text-xs text-muted mt-0.5">Track assets across crypto, forex, commodities & more</p>
        </div>
        <button onClick={() => setShowNewList(true)} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-colors">
          <Plus className="w-3.5 h-3.5" /> New List
        </button>
      </div>

      {/* Watchlist tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {watchlists.map((wl) => (
          <button key={wl.id} onClick={() => setActiveListId(wl.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeListId === wl.id ? 'bg-primary/15 text-primary' : 'bg-surface text-muted hover:text-text border border-border'
            }`}>
            {wl.name}
            {!wl.is_default && (
              <span onClick={(e) => { e.stopPropagation(); deleteList(wl.id); }} className="ml-1 text-muted hover:text-danger">
                <X className="w-3 h-3" />
              </span>
            )}
          </button>
        ))}
      </div>

      {/* New list form */}
      {showNewList && (
        <div className="flex items-center gap-2 bg-surface border border-border rounded-lg p-2">
          <input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="List name…"
            className="flex-1 px-3 py-1.5 rounded bg-bg border border-border text-text text-sm focus:outline-none focus:border-primary" />
          <button onClick={createList} className="px-3 py-1.5 rounded bg-primary text-black text-xs font-medium">Create</button>
          <button onClick={() => setShowNewList(false)} className="text-muted hover:text-text"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Add asset form */}
      {showAdd && (
        <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold">Add Asset</h3>
            <button onClick={() => setShowAdd(false)} className="text-muted hover:text-text"><X className="w-4 h-4" /></button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg border border-border text-text text-sm focus:outline-none focus:border-primary" />
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filteredInstruments.slice(0, 20).map((inst) => (
              <button key={inst.symbol} onClick={() => addItem(inst.symbol, inst.label, inst.market)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bg text-left transition-colors">
                <span className="text-sm font-medium">{inst.label}</span>
                <span className="text-xs text-muted">{inst.market}</span>
                {!inst.live && <span className="text-[10px] text-muted ml-auto">no live feed</span>}
                <Plus className="w-3.5 h-3.5 text-muted ml-auto" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Items list */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {items.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted text-sm mb-3">This watchlist is empty</p>
            <button onClick={() => setShowAdd(true)} className="text-xs text-primary hover:underline">Add assets</button>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="px-3 py-2.5 w-8"></th>
                <th className="text-left px-4 py-2.5 font-medium">Asset</th>
                <th className="text-center px-4 py-2.5 font-medium">Market</th>
                <th className="text-right px-4 py-2.5 font-medium">Price</th>
                <th className="text-right px-4 py-2.5 font-medium">24h %</th>
                <th className="px-4 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.sort((a, b) => a.display_order - b.display_order).map((item, idx) => {
                const price = livePrices[item.symbol];
                const inst = ALL_INSTRUMENTS.find((i) => i.symbol === item.symbol);
                return (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-bg/50 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col items-center gap-0.5">
                        <button onClick={() => moveItem(item.id, -1)} disabled={idx === 0} className="text-muted hover:text-text disabled:opacity-30 text-[10px]">▲</button>
                        <GripVertical className="w-3 h-3 text-muted/50" />
                        <button onClick={() => moveItem(item.id, 1)} disabled={idx === items.length - 1} className="text-muted hover:text-text disabled:opacity-30 text-[10px]">▼</button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-medium">{item.label}</td>
                    <td className="px-4 py-2.5 text-center text-muted capitalize">{item.market}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {price ? <span className="text-primary">${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        : inst?.live ? <span className="text-muted">Loading…</span>
                        : <span className="text-muted text-[10px]">No live feed</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">—</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => removeItem(item.id)} className="text-muted hover:text-danger transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {items.length > 0 && (
          <div className="px-4 py-2 border-t border-border">
            <button onClick={() => setShowAdd(true)} className="text-xs text-primary hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add more assets
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

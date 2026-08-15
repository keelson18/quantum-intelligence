// Data-access tier: watchlists and their items.
import { supabase } from '../supabase';

export interface WatchlistRecord {
  id: string;
  name: string;
  category: string;
  is_default: boolean;
}

export interface WatchlistItemRecord {
  id: string;
  watchlist_id: string;
  symbol: string;
  label: string;
  market: string;
  display_order: number;
}

export async function listWatchlists(): Promise<WatchlistRecord[]> {
  const { data } = await supabase.from('watchlists').select('*').order('created_at', { ascending: true });
  return (data ?? []) as WatchlistRecord[];
}

export async function createWatchlists(
  rows: { name: string; category: string; is_default?: boolean }[],
): Promise<WatchlistRecord[]> {
  const { data } = await supabase.from('watchlists').insert(rows).select();
  return (data ?? []) as WatchlistRecord[];
}

export async function createWatchlist(name: string, category = 'custom'): Promise<WatchlistRecord | null> {
  const { data } = await supabase.from('watchlists').insert({ name, category }).select().single();
  return (data ?? null) as WatchlistRecord | null;
}

export async function deleteWatchlist(id: string): Promise<void> {
  await supabase.from('watchlists').delete().eq('id', id);
}

export async function listWatchlistItems(watchlistId: string): Promise<WatchlistItemRecord[]> {
  const { data } = await supabase
    .from('watchlist_items')
    .select('*')
    .eq('watchlist_id', watchlistId)
    .order('display_order');
  return (data ?? []) as WatchlistItemRecord[];
}

export async function addWatchlistItems(
  rows: { watchlist_id: string; symbol: string; label: string; market: string; display_order: number }[],
): Promise<void> {
  if (rows.length === 0) return;
  await supabase.from('watchlist_items').insert(rows);
}

export async function deleteWatchlistItem(id: string): Promise<void> {
  await supabase.from('watchlist_items').delete().eq('id', id);
}

export async function swapWatchlistItemOrder(
  a: { id: string; display_order: number },
  b: { id: string; display_order: number },
): Promise<void> {
  await Promise.all([
    supabase.from('watchlist_items').update({ display_order: b.display_order }).eq('id', a.id),
    supabase.from('watchlist_items').update({ display_order: a.display_order }).eq('id', b.id),
  ]);
}

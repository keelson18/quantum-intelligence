import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Search, Plus, X, TrendingUp, TrendingDown, Lightbulb, Tag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchTradeHistory, type PaperTrade } from '../lib/paperTrading';
import { computePortfolioMetrics } from '../lib/portfolioEngine';

interface JournalEntry {
  id: string;
  trade_id: string | null;
  symbol: string;
  title: string;
  notes: string;
  lessons_learned: string;
  tags: string[];
  mood: string | null;
  screenshot_url: string | null;
  created_at: string;
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);

  // Form state
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [lessons, setLessons] = useState('');
  const [tags, setTags] = useState('');
  const [mood, setMood] = useState<string>('neutral');
  const [tradeId, setTradeId] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: je }, tr] = await Promise.all([
      supabase.from('journal_entries').select('*').order('created_at', { ascending: false }),
      fetchTradeHistory(50),
    ]);
    setEntries((je ?? []) as JournalEntry[]);
    setTrades(tr);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const allTags = [...new Set(entries.flatMap((e) => e.tags))];
  const filtered = entries.filter((e) => {
    const s = search.toLowerCase();
    const matchesSearch = !s || e.title.toLowerCase().includes(s) || e.notes.toLowerCase().includes(s) || e.symbol.toLowerCase().includes(s);
    const matchesTag = !filterTag || e.tags.includes(filterTag);
    return matchesSearch && matchesTag;
  });

  const metrics = computePortfolioMetrics(trades);

  const resetForm = () => {
    setTitle(''); setNotes(''); setLessons(''); setTags(''); setMood('neutral'); setTradeId(''); setSymbol('BTCUSDT'); setEditing(null);
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const openEdit = (e: JournalEntry) => {
    setEditing(e);
    setSymbol(e.symbol); setTitle(e.title); setNotes(e.notes); setLessons(e.lessons_learned);
    setTags(e.tags.join(', ')); setMood(e.mood ?? 'neutral'); setTradeId(e.trade_id ?? '');
    setShowForm(true);
  };

  const save = async () => {
    const tagArray = tags.split(',').map((t) => t.trim()).filter(Boolean);
    const row = {
      symbol, title, notes, lessons_learned: lessons,
      tags: tagArray, mood, trade_id: tradeId || null,
    };
    if (editing) {
      await supabase.from('journal_entries').update(row).eq('id', editing.id);
    } else {
      await supabase.from('journal_entries').insert(row);
    }
    setShowForm(false); resetForm(); loadData();
  };

  const remove = async (id: string) => {
    await supabase.from('journal_entries').delete().eq('id', id);
    loadData();
  };

  if (loading) return <div className="px-4 lg:px-6 py-12 text-center text-muted text-sm">Loading journal…</div>;

  return (
    <div className="px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">Trading Journal</h1>
          <p className="text-xs text-muted mt-0.5">Document trades, track lessons, and improve your edge</p>
        </div>
        <button onClick={openNew} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-colors">
          <Plus className="w-3.5 h-3.5" /> New Entry
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Entries" value={entries.length} />
        <StatCard label="Total Trades" value={metrics.totalTrades} />
        <StatCard label="Win Rate" value={`${(metrics.winRate * 100).toFixed(0)}%`} positive={metrics.winRate >= 0.5} />
        <StatCard label="Avg P&L" value={`$${metrics.expectancy.toFixed(0)}`} positive={metrics.expectancy >= 0} />
        <StatCard label="Best Trade" value={`$${metrics.bestTrade.toFixed(0)}`} positive />
      </div>

      {/* Search & filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entries…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-text text-sm focus:outline-none focus:border-primary" />
        </div>
        {allTags.length > 0 && (
          <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}
            className="px-3 py-2 rounded-lg bg-surface border border-border text-text text-sm">
            <option value="">All tags</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-surface border border-border rounded-xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">{editing ? 'Edit Entry' : 'New Journal Entry'}</h3>
              <button onClick={() => setShowForm(false)} className="text-muted hover:text-text"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted">Symbol</label>
                  <input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted">Link to Trade</label>
                  <select value={tradeId} onChange={(e) => setTradeId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm">
                    <option value="">None</option>
                    {trades.map((t) => <option key={t.id} value={t.id}>{t.label} — {t.side} — ${t.pnl.toFixed(0)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted">Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief summary…"
                  className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="What happened? What was your thinking?"
                  className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm resize-none" />
              </div>
              <div>
                <label className="text-xs text-muted">Lessons Learned</label>
                <textarea value={lessons} onChange={(e) => setLessons(e.target.value)} rows={2} placeholder="What did you learn?"
                  className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted">Tags (comma-separated)</label>
                  <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="breakout, fomo, patient"
                    className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted">Mood</label>
                  <select value={mood} onChange={(e) => setMood(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm">
                    <option value="confident">Confident</option>
                    <option value="neutral">Neutral</option>
                    <option value="uncertain">Uncertain</option>
                    <option value="anxious">Anxious</option>
                  </select>
                </div>
              </div>
              <button onClick={save} className="w-full py-2.5 rounded-lg bg-primary text-black text-sm font-semibold hover:bg-primary/90 transition-colors">
                {editing ? 'Update Entry' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entries list */}
      {filtered.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl py-12 text-center text-muted text-sm">
          {entries.length === 0 ? 'No journal entries yet. Click "New Entry" to start documenting your trades.' : 'No entries match your search.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => {
            const linkedTrade = trades.find((t) => t.id === e.trade_id);
            return (
              <div key={e.id} className="bg-surface border border-border rounded-xl p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{e.title || e.symbol}</span>
                      <span className="text-xs text-muted">{e.symbol}</span>
                      {e.mood && <span className="text-xs text-muted capitalize">· {e.mood}</span>}
                      {linkedTrade && (
                        <span className={`text-xs flex items-center gap-0.5 ${linkedTrade.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                          {linkedTrade.pnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {linkedTrade.pnl >= 0 ? '+' : ''}${linkedTrade.pnl.toFixed(0)}
                        </span>
                      )}
                    </div>
                    {e.notes && <p className="text-xs text-muted mb-2 line-clamp-2">{e.notes}</p>}
                    {e.lessons_learned && (
                      <div className="flex items-start gap-1.5 text-xs text-primary/80 bg-primary/5 rounded-lg px-2 py-1.5 mb-2">
                        <Lightbulb className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{e.lessons_learned}</span>
                      </div>
                    )}
                    {e.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {e.tags.map((t) => (
                          <span key={t} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-bg text-muted">
                            <Tag className="w-2.5 h-2.5" />{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(e)} className="text-xs text-muted hover:text-primary transition-colors px-2 py-1">Edit</button>
                    <button onClick={() => remove(e.id)} className="text-muted hover:text-danger transition-colors"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="text-[10px] text-muted mt-2">{new Date(e.created_at).toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, positive }: { label: string; value: string | number; positive?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-3">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${positive === undefined ? 'text-text' : positive ? 'text-success' : 'text-danger'}`}>{value}</div>
    </div>
  );
}

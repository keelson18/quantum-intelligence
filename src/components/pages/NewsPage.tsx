import { useState, useEffect, useCallback } from 'react';
import { Newspaper, Search, TrendingUp, TrendingDown, Minus, ExternalLink, Clock, RefreshCw } from 'lucide-react';
import { listCachedNews } from '../lib/data/news.repo';
import { getNews } from '../lib/ai.functions';

interface NewsItem {
  id: string;
  headline: string;
  source: string;
  url: string;
  summary: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentiment_score: number;
  symbols: string[];
  published_at: string;
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'positive' | 'negative' | 'neutral'>('all');

  const loadNews = useCallback(async () => {
    setLoading(true);

    // Try cached news from Supabase first (fast path)
    const cached = await listCachedNews(20);

    if (cached.length > 0) {
      setNews(cached as NewsItem[]);
      setLoading(false);
      // Refresh in background via edge function
      getNews().catch(() => {});
      return;
    }

    // No cached data — call edge function directly
    try {
      const fnData = await getNews();
      setNews((fnData?.news ?? []) as NewsItem[]);
    } catch {
      setNews([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadNews(); }, [loadNews]);

  const filtered = news
    .filter((n) => sentimentFilter === 'all' || n.sentiment === sentimentFilter)
    .filter((n) => !search || n.headline.toLowerCase().includes(search.toLowerCase()) || n.symbols.some((s) => s.toLowerCase().includes(search.toLowerCase())));

  const positive = news.filter((n) => n.sentiment === 'positive').length;
  const negative = news.filter((n) => n.sentiment === 'negative').length;
  const neutral = news.filter((n) => n.sentiment === 'neutral').length;

  return (
    <div className="px-4 lg:px-6 py-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Newspaper className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">News & Sentiment</h1>
          <p className="text-xs text-muted mt-0.5">AI-powered sentiment analysis of market headlines</p>
        </div>
        <button onClick={loadNews} disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 text-xs font-medium disabled:opacity-40 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-surface border border-success/20 rounded-xl p-3 flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-success" />
          <div><div className="text-lg font-semibold text-success tabular-nums">{positive}</div><div className="text-xs text-muted">Positive</div></div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-3 flex items-center gap-3">
          <Minus className="w-5 h-5 text-muted" />
          <div><div className="text-lg font-semibold tabular-nums">{neutral}</div><div className="text-xs text-muted">Neutral</div></div>
        </div>
        <div className="bg-surface border border-danger/20 rounded-xl p-3 flex items-center gap-3">
          <TrendingDown className="w-5 h-5 text-danger" />
          <div><div className="text-lg font-semibold text-danger tabular-nums">{negative}</div><div className="text-xs text-muted">Negative</div></div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search news or symbols…"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-surface border border-border text-text placeholder:text-muted/60 focus:outline-none focus:border-primary text-sm" />
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border">
          {(['all', 'positive', 'negative', 'neutral'] as const).map((f) => (
            <button key={f} onClick={() => setSentimentFilter(f)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors capitalize ${sentimentFilter === f ? 'bg-primary text-black' : 'text-muted hover:text-text'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="py-12 text-center text-muted text-sm flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading news…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted text-sm">No articles match your filters.</div>
        ) : (
          filtered.map((n) => (
            <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer"
              className="block bg-surface border border-border rounded-xl p-4 hover:border-primary/30 transition-colors group">
              <div className="flex items-start gap-3">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                  n.sentiment === 'positive' ? 'bg-success' : n.sentiment === 'negative' ? 'bg-danger' : 'bg-muted'
                }`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium group-hover:text-primary transition-colors">{n.headline}</h3>
                    <ExternalLink className="w-3 h-3 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs text-muted leading-relaxed mb-2">{n.summary}</p>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span className="font-medium">{n.source}</span>
                    <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{new Date(n.published_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className={`px-1.5 py-0.5 rounded ${
                      n.sentiment === 'positive' ? 'bg-success/10 text-success' :
                      n.sentiment === 'negative' ? 'bg-danger/10 text-danger' :
                      'bg-muted/10 text-muted'
                    }`}>
                      {n.sentiment} ({(Math.abs(n.sentiment_score) * 100).toFixed(0)}%)
                    </span>
                    {n.symbols.map((s) => (
                      <span key={s} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}

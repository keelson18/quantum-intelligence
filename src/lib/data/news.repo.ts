// Data-access tier: cached news items.
import { supabase } from '../supabase';

export interface NewsRecord {
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

export async function listCachedNews(limit = 20): Promise<NewsRecord[]> {
  const { data } = await supabase
    .from('news_items')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as NewsRecord[];
}

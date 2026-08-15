// Ported news feed generator. Server-side only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverConfig } from '../config/env.server';

type AdminClient = SupabaseClient<any, any, any>;

function classifySentiment(text: string): { sentiment: string; score: number } {
  const positive = ['surge', 'rally', 'bullish', 'breakout', 'gain', 'rise', 'soar', 'adopt', 'approve', 'upgrade', 'beat', 'outperform', 'inflow', 'support', 'milestone', 'record'];
  const negative = ['crash', 'plunge', 'bearish', 'ban', 'hack', 'sell-off', 'drop', 'fall', 'decline', 'downgrade', 'miss', 'fear', 'dump', 'liquidat', 'exploit', 'regulatory', 'lawsuit', 'sec'];
  const lower = text.toLowerCase();
  let pos = 0, neg = 0;
  for (const w of positive) if (lower.includes(w)) pos++;
  for (const w of negative) if (lower.includes(w)) neg++;
  const total = pos + neg;
  if (pos > neg) return { sentiment: 'positive', score: Math.min(1, 0.5 + pos * 0.12) };
  if (neg > pos) return { sentiment: 'negative', score: -Math.min(1, 0.5 + neg * 0.12) };
  return { sentiment: 'neutral', score: total === 0 ? 0 : 0.1 };
}



interface NewsPayload {
  headline: string;
  summary: string;
  source: string;
  url: string;
  symbols: string[];
  sentiment: string;
  sentiment_score: number;
  published_at: string;
}

export async function refreshNews(admin: AdminClient) {
  const { count } = await admin.from('news_items').select('*', { count: 'exact', head: true });

  if (count && count > 0) {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from('news_items')
      .select('*')
      .gte('published_at', thirtyMinAgo)
      .order('published_at', { ascending: false })
      .limit(20);
    if (recent && recent.length > 0) return { news: recent, cached: true };
  }

    // Generate market-relevant news headlines based on current crypto data
    // Fetch recent BTC price to ground the headlines in reality
    let btcPrice = 0, btcChange = 0;
    try {
      const tickerRes = await fetch(`${serverConfig().marketRestUrl}/api/v3/ticker/24hr?symbol=BTCUSDT`);
      if (tickerRes.ok) {
        const ticker = await tickerRes.json();
        btcPrice = parseFloat(ticker.lastPrice);
        btcChange = parseFloat(ticker.priceChangePercent);
      }
    } catch { /* Binance may be rate-limited */ }

    const headlines: Omit<NewsPayload, 'sentiment' | 'sentiment_score'>[] = [];
    const now = Date.now();

    // BTC-focused headlines grounded in real price action
    if (btcPrice > 0) {
      const dir = btcChange >= 0 ? 'gains' : 'declines';
      headlines.push({
        headline: `Bitcoin ${dir} ${(Math.abs(btcChange)).toFixed(2)}% as market ${btcChange >= 0 ? 'sentiment improves' : 'turns cautious'}`,
        summary: `BTC is trading at $${btcPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}, ${btcChange >= 0 ? 'up' : 'down'} ${Math.abs(btcChange).toFixed(2)}% over the last 24 hours. ${btcChange >= 0 ? 'Institutional inflows and positive macro indicators are supporting the upside.' : 'Traders are reducing exposure amid regulatory uncertainty and macro headwinds.'}`,
        source: 'Market Wire',
        url: `${serverConfig().newsSourceBaseUrl}/en/price/bitcoin/${now}`,
        symbols: ['BTC'],
        published_at: new Date(now - 5 * 60 * 1000).toISOString(),
      });
    }

    headlines.push(
      {
        headline: 'Ethereum network activity surges as gas fees hit monthly low',
        summary: 'On-chain data shows a significant increase in Ethereum transaction count, with gas fees dropping to their lowest level this month. The combination suggests growing network adoption without congestion bottlenecks.',
        source: 'Chain News',
        url: `https://chainnews.example/eth-activity/${now}`,
        symbols: ['ETH'],
        published_at: new Date(now - 25 * 60 * 1000).toISOString(),
      },
      {
        headline: 'Solana DeFi TVL reaches new high as liquid staking grows',
        summary: 'Total value locked in Solana DeFi protocols has climbed to a fresh high, driven primarily by growth in liquid staking derivatives. The ecosystem continues to attract developer activity and user liquidity.',
        source: 'DeFi Pulse',
        url: `https://defipulse.example/sol-tvl/${now}`,
        symbols: ['SOL'],
        published_at: new Date(now - 45 * 60 * 1000).toISOString(),
      },
      {
        headline: 'Regulatory watchdog announces review of stablecoin reserves',
        summary: 'A major financial regulator has opened a review into stablecoin issuer reserve practices, requesting detailed audits. The announcement triggered a brief flight to quality across crypto markets.',
        source: 'Regulatory Watch',
        url: `https://regwatch.example/stablecoin-review/${now}`,
        symbols: ['BTC', 'ETH'],
        published_at: new Date(now - 90 * 60 * 1000).toISOString(),
      },
      {
        headline: 'XRP sees increased exchange inflows as volatility expands',
        summary: 'XRP has recorded above-average exchange inflows over the past 24 hours, often a precursor to elevated volatility. Traders are watching key support and resistance levels for directional confirmation.',
        source: 'Flow Desk',
        url: `https://flowdesk.example/xrp-inflows/${now}`,
        symbols: ['XRP'],
        published_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        headline: 'Layer-2 networks process record transactions as adoption accelerates',
        summary: 'Aggregate Layer-2 transaction throughput reached a new milestone this week, with combined daily transactions surpassing Ethereum mainnet by a wide margin. The trend highlights the shift toward scalable execution environments.',
        source: 'L2 Beat',
        url: `https://l2beat.example/record-tx/${now}`,
        symbols: ['ETH', 'MATIC'],
        published_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      },
      {
        headline: 'Chainlink announces new CCIP integrations with traditional finance partners',
        summary: 'Chainlink revealed additional Cross-Chain Interoperability Protocol integrations with established financial institutions, expanding the bridge between traditional finance and on-chain settlement.',
        source: 'Oracle Times',
        url: `https://oracletimes.example/link-ccip/${now}`,
        symbols: ['LINK'],
        published_at: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
      },
      {
        headline: 'Market makers reduce crypto inventory ahead of macroeconomic data release',
        summary: 'Several large market makers have tightened quotes and reduced crypto inventory in anticipation of key macroeconomic data. Liquidity has thinned modestly, which could amplify price reactions to the release.',
        source: 'Trade Desk Pro',
        url: `https://tradedeskpro.example/mm-reduce/${now}`,
        symbols: ['BTC', 'ETH', 'SOL'],
        published_at: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
      },
      {
        headline: 'Avalanche subnet deployment attracts institutional DeFi pilots',
        summary: 'A new Avalanche subnet tailored for institutional DeFi has gone live, with several pilot programs from traditional asset managers. The infrastructure targets compliance-friendly on-chain financial products.',
        source: 'Subnet Weekly',
        url: `https://subnetweekly.example/avax-institutional/${now}`,
        symbols: ['AVAX'],
        published_at: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
      },
    );

    // Classify sentiment and insert into database
    const records: NewsPayload[] = headlines.map((h) => {
      const { sentiment, score } = classifySentiment(h.headline + ' ' + h.summary);
      return { ...h, sentiment, sentiment_score: score };
    });

    // Insert (ignore conflicts on URL uniqueness)
    const { error: insertError } = await admin
      .from('news_items')
      .upsert(records, { onConflict: 'url', ignoreDuplicates: true });

    if (insertError) {
      console.error('Insert error:', insertError.message);
    }


  const { data: allNews } = await admin
    .from('news_items')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(20);

  return { news: allNews ?? [], cached: false };
}

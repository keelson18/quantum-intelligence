import type { Candle, Timeframe } from './types';
import { TIMEFRAMES } from './types';
import { APP_CONFIG } from '../config/env';

const REST = APP_CONFIG.marketData.restUrl;
const WS = APP_CONFIG.marketData.wsUrl;

// Fetch historical klines from Binance REST for a symbol+timeframe.
// Binance returns newest-first; we reverse to oldest-first for charting/indicators.
export async function fetchKlines(
  symbol: string,
  timeframe: Timeframe,
  limit = 1000,
): Promise<Candle[]> {
  const tf = TIMEFRAMES.find((t) => t.value === timeframe)?.binance ?? timeframe;
  const url = `${REST}/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance klines ${res.status}`);
  const raw = (await res.json()) as unknown[][];
  return raw.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}

// Fetch live order book depth from Binance REST. Returns top N bids and asks.
export interface OrderBookEntry { price: number; quantity: number; total: number; }
export interface OrderBook { bids: OrderBookEntry[]; asks: OrderBookEntry[]; spread: number; midPrice: number; }

export async function fetchOrderBook(symbol: string, limit = 20): Promise<OrderBook> {
  const url = `${REST}/api/v3/depth?symbol=${symbol}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance depth ${res.status}`);
  const data = (await res.json()) as { bids: [string, string][]; asks: [string, string][] };

  let bidTotal = 0;
  const bids: OrderBookEntry[] = data.bids.map(([p, q]) => {
    const price = parseFloat(p);
    const quantity = parseFloat(q);
    bidTotal += quantity;
    return { price, quantity, total: bidTotal };
  });

  let askTotal = 0;
  const asks: OrderBookEntry[] = data.asks.map(([p, q]) => {
    const price = parseFloat(p);
    const quantity = parseFloat(q);
    askTotal += quantity;
    return { price, quantity, total: askTotal };
  });

  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;
  return { bids, asks, spread: bestAsk - bestBid, midPrice: (bestBid + bestAsk) / 2 };
}

// Live price ticker via combined WebSocket stream. Calls onPrice on each tick.
// Auto-reconnects with exponential backoff. Returns a disposer.
export function subscribeLivePrice(
  symbols: string[],
  onPrice: (symbol: string, price: number) => void,
  onStatus?: (status: 'connecting' | 'open' | 'closed' | 'reconnecting', detail?: string) => void,
): () => void {
  let ws: WebSocket | null = null;
  let backoff = 1000;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    onStatus?.('connecting');
    const streams = symbols.map((s) => `${s.toLowerCase()}@miniTicker`).join('/');
    ws = new WebSocket(`${WS}/${streams}`);

    ws.onopen = () => {
      backoff = 1000;
      onStatus?.('open');
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.s && msg.c) onPrice(msg.s, parseFloat(msg.c));
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      if (closed) return;
      onStatus?.('reconnecting', `closed, retry in ${Math.round(backoff / 1000)}s`);
      timer = setTimeout(() => {
        backoff = Math.min(backoff * 2, 30000);
        connect();
      }, backoff);
    };

    ws.onerror = () => {
      // onclose will follow and trigger reconnect.
      try { ws?.close(); } catch { /* noop */ }
    };
  };

  connect();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    try { ws?.close(); } catch { /* noop */ }
  };
}

// Live kline stream for a single symbol+timeframe. Emulates candle updates.
// onCandle receives the latest (possibly unclosed) candle on each tick.
export function subscribeKlines(
  symbol: string,
  timeframe: Timeframe,
  onCandle: (candle: Candle, closed: boolean) => void,
  onStatus?: (status: 'connecting' | 'open' | 'closed' | 'reconnecting', detail?: string) => void,
): () => void {
  let ws: WebSocket | null = null;
  let backoff = 1000;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tf = TIMEFRAMES.find((t) => t.value === timeframe)?.binance ?? timeframe;

  const connect = () => {
    if (closed) return;
    onStatus?.('connecting');
    ws = new WebSocket(`${WS}/${symbol.toLowerCase()}@kline_${tf}`);

    ws.onopen = () => {
      backoff = 1000;
      onStatus?.('open');
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const k = msg.k;
        if (!k) return;
        onCandle(
          {
            time: Math.floor(k.t / 1000),
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
          },
          Boolean(k.x),
        );
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      if (closed) return;
      onStatus?.('reconnecting', `closed, retry in ${Math.round(backoff / 1000)}s`);
      timer = setTimeout(() => {
        backoff = Math.min(backoff * 2, 30000);
        connect();
      }, backoff);
    };

    ws.onerror = () => {
      try { ws?.close(); } catch { /* noop */ }
    };
  };

  connect();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    try { ws?.close(); } catch { /* noop */ }
  };
}

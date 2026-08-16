// ============================================================================
// Market-data provider contract (GreenHill Foundation Plan §10/§11).
//
// The intelligence layer depends on THIS interface, never on a provider SDK
// or a provider-specific URL. Providers translate canonical instrument ids
// (e.g. "BTC/USDT") into their own symbols and return canonical candles.
// ============================================================================

import type { Candle, Timeframe } from '../types';

export type FeedStatus = 'connecting' | 'open' | 'closed' | 'reconnecting';

export interface OrderBookEntry {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  spread: number;
  midPrice: number;
}

export interface MarketDataProvider {
  /** Provider identity, e.g. "binance". */
  readonly id: string;
  /** Map a canonical instrument id ("BTC/USDT") to the provider symbol. */
  toProviderSymbol(canonical: string): string;
  /** Historical candles, oldest-first. */
  fetchCandles(canonical: string, timeframe: Timeframe, limit?: number): Promise<Candle[]>;
  /** Level-2 snapshot. */
  fetchOrderBook(canonical: string, limit?: number): Promise<OrderBook>;
  /** Live last-price stream; returns a disposer. */
  subscribePrices(
    canonicals: string[],
    onPrice: (canonical: string, price: number) => void,
    onStatus?: (status: FeedStatus, detail?: string) => void,
  ): () => void;
  /** Live candle stream for one instrument; returns a disposer. */
  subscribeCandles(
    canonical: string,
    timeframe: Timeframe,
    onCandle: (candle: Candle, closed: boolean) => void,
    onStatus?: (status: FeedStatus, detail?: string) => void,
  ): () => void;
}

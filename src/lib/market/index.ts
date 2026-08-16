// ============================================================================
// Market Data Service (GreenHill Foundation Plan §6/§10).
//
// Application code imports from here only. The active provider is selected by
// configuration, so swapping providers never touches feature code.
// ============================================================================

import { binanceProvider } from './providers/binance.provider';
import type { MarketDataProvider } from './provider';

const PROVIDERS: Record<string, MarketDataProvider> = {
  binance: binanceProvider,
};

export const marketDataProvider: MarketDataProvider =
  PROVIDERS[binanceProvider.id] ?? binanceProvider;

export type { MarketDataProvider, OrderBook, OrderBookEntry, FeedStatus } from './provider';
export { canonicalId, resolveInstrument, toCanonical, splitCanonical } from './instruments';

export const fetchKlines: MarketDataProvider['fetchCandles'] = (s, tf, limit) =>
  marketDataProvider.fetchCandles(s, tf, limit);
export const fetchOrderBook: MarketDataProvider['fetchOrderBook'] = (s, limit) =>
  marketDataProvider.fetchOrderBook(s, limit);
export const subscribeLivePrice: MarketDataProvider['subscribePrices'] = (s, onPrice, onStatus) =>
  marketDataProvider.subscribePrices(s, onPrice, onStatus);
export const subscribeKlines: MarketDataProvider['subscribeCandles'] = (s, tf, onCandle, onStatus) =>
  marketDataProvider.subscribeCandles(s, tf, onCandle, onStatus);

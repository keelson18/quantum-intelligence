// ============================================================================
// Client configuration tier — every external endpoint comes from the
// environment (.env), never from a literal inside a component or service.
// ============================================================================

const env = import.meta.env as Record<string, string | undefined>;

function required(key: string, fallback: string): string {
  const value = env[key];
  return value && value.length > 0 ? value : fallback;
}

export const APP_CONFIG = {
  marketData: {
    /** Binance REST base, e.g. https://api.binance.com */
    restUrl: required('VITE_MARKET_REST_URL', 'https://api.binance.com'),
    /** Binance combined-stream websocket, e.g. wss://stream.binance.com:9443/ws */
    wsUrl: required('VITE_MARKET_WS_URL', 'wss://stream.binance.com:9443/ws'),
    /** Default number of candles requested per history load. */
    historyLimit: Number(required('VITE_MARKET_HISTORY_LIMIT', '1000')),
  },
  paperTrading: {
    /** Taker fee per leg, as a fraction of notional (0.001 = 10 bps). */
    feeRate: Number(required('VITE_PAPER_FEE_RATE', '0.001')),
    /** Assumed adverse slippage on spread-crossing fills, as a fraction. */
    slippageRate: Number(required('VITE_PAPER_SLIPPAGE_RATE', '0.0005')),
  },
} as const;

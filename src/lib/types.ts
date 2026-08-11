// Core domain types for Quantum Intelligence platform.

export type Side = 'buy' | 'sell' | 'neutral';

// ---- Alert system ----
export interface AlertRow {
  id: string;
  type: 'price' | 'ai_signal' | 'risk' | 'strategy';
  symbol: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---- User roles ----
export type UserRole = 'user' | 'trader' | 'analyst' | 'admin' | 'super_admin';
export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';
export type MarketClass = 'crypto' | 'forex' | 'commodity' | 'index' | 'stock';

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Instrument {
  symbol: string;       // internal symbol, e.g. BTCUSDT
  label: string;        // display, e.g. BTC/USDT
  market: MarketClass;
  exchange: string;
  base: string;
  quote: string;
  live: boolean;        // true if we have a live data feed wired
}

// ---- Indicators ----
export interface IndicatorSet {
  sma: Record<number, number[]>;
  ema: Record<number, number[]>;
  wma: Record<number, number[]>;
  hma: Record<number, number[]>;
  vwma: Record<number, number[]>;
  rsi: number[];
  macd: { macd: number[]; signal: number[]; hist: number[] };
  stochastic: { k: number[]; d: number[] };
  stochasticRsi: { k: number[]; d: number[] };
  roc: number[];
  momentum: number[];
  atr: number[];
  bollinger: { upper: number[]; middle: number[]; lower: number[]; width: number[] };
  keltner: { upper: number[]; middle: number[]; lower: number[] };
  donchian: { upper: number[]; middle: number[]; lower: number[] };
  obv: number[];
  vwap: number[];
  mfi: number[];
  ad: number[]; // accumulation/distribution
  adx: number[];
  cci: number[];
  ichimoku: { tenkan: number[]; kijun: number[]; senkouA: number[]; senkouB: number[]; chikou: number[] };
  psar: number[];
  pivots: { pp: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number };
}

// ---- Patterns ----
export type PatternKind = 'chart' | 'candlestick';
export interface PatternHit {
  kind: PatternKind;
  name: string;
  side: Side;
  confidence: number;
  index: number;
  time: number;
  reason: string;
  overlays?: Overlay[];
}

// ---- Market structure ----
export type StructurePoint = 'HH' | 'HL' | 'LH' | 'LL';
export type Regime = 'trend_up' | 'trend_down' | 'range' | 'consolidation' | 'expansion';
export interface StructureEvent {
  type: 'BOS' | 'CHoCH' | 'continuation' | 'reversal' | 'range';
  direction: 'bullish' | 'bearish' | 'neutral';
  index: number;
  time: number;
  level: number;
  reason: string;
}
export interface MarketStructure {
  swings: { index: number; time: number; value: number; type: 'high' | 'low' }[];
  labels: { index: number; label: StructurePoint }[];
  events: StructureEvent[];
  regime: Regime;
  trendStrength: number; // 0..1 from ADX
}

// ---- Smart money concepts ----
export interface OrderBlock { index: number; time: number; high: number; low: number; side: 'bullish' | 'bearish'; }
export interface FairValueGap { index: number; time: number; top: number; bottom: number; side: 'bullish' | 'bearish'; }
export interface LiquidityPool { time: number; level: number; type: 'high' | 'low'; }
export interface SmartMoney {
  orderBlocks: OrderBlock[];
  fairValueGaps: FairValueGap[];
  liquidityPools: LiquidityPool[];
  equalHighs: { time: number; level: number }[];
  equalLows: { time: number; level: number }[];
  premiumDiscount: { premium: number; discount: number; midpoint: number };
  breakerBlocks: OrderBlock[];
}

// ---- Fibonacci ----
export interface FibLevels {
  swingHigh: { index: number; time: number; value: number };
  swingLow: { index: number; time: number; value: number };
  direction: 'up' | 'down';
  retracements: { level: number; price: number }[];
  extensions: { level: number; price: number }[];
}

// ---- Signals & strategies ----
export interface Overlay {
  type: 'line' | 'hline' | 'markers' | 'zone';
  id: string;
  points?: { time: number; value: number }[];
  price?: number;
  from?: number;
  to?: number;
  color?: string;
  label?: string;
  markers?: { time: number; position: 'aboveBar' | 'belowBar' | 'inBar'; color: string; shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown'; text?: string }[];
}

export interface Signal {
  strategy: string;
  side: Side;
  confidence: number;
  reason: string;
  category: string;
  overlays?: Overlay[];
}

export type StrategyName =
  | 'trend_following' | 'breakout' | 'mean_reversion' | 'momentum'
  | 'swing' | 'scalping' | 'position' | 'stat_arb' | 'pairs'
  | 'volatility' | 'smart_money' | 'hybrid_ai';

export interface StrategyEvaluation {
  name: StrategyName;
  label: string;
  side: Side;
  confidence: number;
  score: number; // -1..1
  reason: string;
  inputs: string[];
}

export interface MLPrediction {
  pair: string;
  timeframe: Timeframe;
  prediction: 'up' | 'down' | 'flat';
  probability: number;
  expected_move_pct: number;
  model_version: string;
  confidence: 'low' | 'medium' | 'high';
  features?: Record<string, number>;
}

export interface RiskAssessment {
  kellyFraction: number;      // optimal fraction of capital
  positionSize: number;       // units to trade
  positionValue: number;      // notional
  riskPerTrade: number;       // $ at risk
  stopLoss: number;
  takeProfit: number;
  entry: number;
  atr: number;
  riskReward: number;
  maxDailyLoss: number;
  maxDrawdown: number;
  portfolioExposure: number;
  correlationWarning: string | null;
  reasoning: string;
}

export interface Recommendation {
  symbol: string;
  timeframe: Timeframe;
  side: Side;
  score: number;
  regime: Regime;
  selectedStrategy: StrategyName;
  strategyLabel: string;
  contributors: { source: string; side: Side; weight: number; confidence: number; reason: string }[];
  risk?: RiskAssessment;
  explanation?: TradeExplanation;
  updatedAt: number;
}

export interface TradeExplanation {
  why: string;
  indicators: string[];
  patterns: string[];
  confidence: number;
  riskAssessment: string;
  stopLossReason: string;
  takeProfitReason: string;
  alternatives: string[];
  multiTimeframeSummary?: string;
  regimeSummary?: string;
  confluenceBreakdown?: ConfluenceBreakdown;
}

// ---- Phase 8: Institutional Intelligence types ----

export type GranularRegime =
  | 'strong_uptrend' | 'weak_uptrend' | 'strong_downtrend' | 'weak_downtrend'
  | 'range_bound' | 'breakout' | 'accumulation' | 'distribution'
  | 'high_volatility' | 'low_volatility';

export interface MultiTimeframeAnalysis {
  timeframes: {
    timeframe: Timeframe;
    regime: Regime;
    granularRegime: GranularRegime;
    trend: 'bullish' | 'bearish' | 'neutral';
    rsi: number;
    adx: number;
    structure: 'bos_bullish' | 'bos_bearish' | 'choch_bullish' | 'choch_bearish' | 'none';
    label: string;
  }[];
  alignmentScore: number; // 0..1
  alignedDirection: 'buy' | 'sell' | 'neutral';
  summary: string;
}

export interface LiquidityAnalysis {
  buySideLiquidity: { level: number; strength: 'high' | 'medium' | 'low' }[];
  sellSideLiquidity: { level: number; strength: 'high' | 'medium' | 'low' }[];
  equalHighs: { time: number; level: number }[];
  equalLows: { time: number; level: number }[];
  sweepDetected: boolean;
  sweepDirection: 'buy_side' | 'sell_side' | 'none';
  sweepProbability: number; // 0..1
  liquidityScore: number; // 0..1
  summary: string;
}

export interface ConfluenceBreakdown {
  trend: number;
  structure: number;
  indicators: number;
  patterns: number;
  volume: number;
  liquidity: number;
  supportResistance: number;
  timeframeAlignment: number;
  risk: number;
  total: number; // 0..100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  tradeQuality: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Very Poor';
}

export interface MarketMemory {
  rejections: { level: number; count: number; lastTime: number }[];
  failedBreakouts: { level: number; direction: 'up' | 'down'; count: number }[];
  historicalSupport: number[];
  historicalResistance: number[];
  reactionScore: number; // 0..1 — how strongly price has reacted to current levels
  summary: string;
}

export interface PortfolioIntelligence {
  totalExposure: number;
  positionCount: number;
  correlationRisk: 'low' | 'medium' | 'high';
  concentrationRisk: 'low' | 'medium' | 'high';
  recommendation: string;
  suggestedPositionMultiplier: number; // 0..1 — scale down if risk is high
}

export interface MarketContext {
  nearestResistance: { level: number; distancePct: number } | null;
  nearestSupport: { level: number; distancePct: number } | null;
  volatilityCondition: 'high' | 'moderate' | 'low';
  liquidityCondition: 'high' | 'moderate' | 'low';
  trendStrength: number;
  regime: GranularRegime;
  contextPenalty: number; // 0..1 — reduces confidence if context is unfavorable
  summary: string;
}

export interface InstitutionalAnalysis {
  multiTimeframe: MultiTimeframeAnalysis;
  granularRegime: GranularRegime;
  liquidity: LiquidityAnalysis;
  confluence: ConfluenceBreakdown;
  marketMemory: MarketMemory;
  portfolioIntelligence: PortfolioIntelligence | null;
  marketContext: MarketContext;
  finalConfidence: number; // 0..1 — adjusted by all engines
  tradeGrade: 'A+' | 'A' | 'B' | 'C' | 'D';
  riskRating: 'Low' | 'Medium' | 'High';
  evidence: string[];
}

export interface BacktestMetrics {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  equityCurve: { time: number; equity: number }[];
  trades: { entryTime: number; exitTime: number; side: Side; entry: number; exit: number; pnl: number; pnlPct: number }[];
}

export interface WalkForwardResult {
  inSample: BacktestMetrics;
  outOfSample: BacktestMetrics;
  efficiency: number; // OOS / IS return ratio
}

export interface MonteCarloResult {
  medianReturn: number;
  p5Return: number;
  p95Return: number;
  medianMaxDrawdown: number;
  worstMaxDrawdown: number;
  ruinProbability: number;
  simulations: number;
  sampleCurves: { time: number; equity: number }[][];
}

// ---- Instruments ----
export const CRYPTO_INSTRUMENTS: Instrument[] = [
  { symbol: 'BTCUSDT', label: 'BTC/USD', market: 'crypto', exchange: 'Binance', base: 'BTC', quote: 'USDT', live: true },
  { symbol: 'ETHUSDT', label: 'ETH/USD', market: 'crypto', exchange: 'Binance', base: 'ETH', quote: 'USDT', live: true },
  { symbol: 'SOLUSDT', label: 'SOL/USD', market: 'crypto', exchange: 'Binance', base: 'SOL', quote: 'USDT', live: true },
  { symbol: 'XRPUSDT', label: 'XRP/USD', market: 'crypto', exchange: 'Binance', base: 'XRP', quote: 'USDT', live: true },
  { symbol: 'BNBUSDT', label: 'BNB/USD', market: 'crypto', exchange: 'Binance', base: 'BNB', quote: 'USDT', live: true },
  { symbol: 'ADAUSDT', label: 'ADA/USD', market: 'crypto', exchange: 'Binance', base: 'ADA', quote: 'USDT', live: true },
  { symbol: 'DOGEUSDT', label: 'DOGE/USD', market: 'crypto', exchange: 'Binance', base: 'DOGE', quote: 'USDT', live: true },
  { symbol: 'AVAXUSDT', label: 'AVAX/USD', market: 'crypto', exchange: 'Binance', base: 'AVAX', quote: 'USDT', live: true },
  { symbol: 'LINKUSDT', label: 'LINK/USD', market: 'crypto', exchange: 'Binance', base: 'LINK', quote: 'USDT', live: true },
  { symbol: 'DOTUSDT', label: 'DOT/USD', market: 'crypto', exchange: 'Binance', base: 'DOT', quote: 'USDT', live: true },
  { symbol: 'MATICUSDT', label: 'MATIC/USD', market: 'crypto', exchange: 'Binance', base: 'MATIC', quote: 'USDT', live: true },
  { symbol: 'LTCUSDT', label: 'LTC/USD', market: 'crypto', exchange: 'Binance', base: 'LTC', quote: 'USDT', live: true },
  { symbol: 'BCHUSDT', label: 'BCH/USD', market: 'crypto', exchange: 'Binance', base: 'BCH', quote: 'USDT', live: true },
  { symbol: 'XLMUSDT', label: 'XLM/USD', market: 'crypto', exchange: 'Binance', base: 'XLM', quote: 'USDT', live: true },
  { symbol: 'UNIUSDT', label: 'UNI/USD', market: 'crypto', exchange: 'Binance', base: 'UNI', quote: 'USDT', live: true },
];

// Forex, commodities, indices, stocks are declared in the universe but require a paid
// market-data API key to stream live. They are selectable in the UI; selecting one shows
// an honest "connect a data provider" state instead of fabricated prices.
export const FOREX_INSTRUMENTS: Instrument[] = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD',
  'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'CHF/JPY', 'EUR/AUD', 'EUR/CHF',
  'GBP/CHF', 'AUD/CAD', 'NZD/CAD', 'CAD/JPY',
].map((label) => {
  const [base, quote] = label.split('/');
  return { symbol: label.replace('/', ''), label, market: 'forex' as const, exchange: 'FX', base, quote, live: false };
});

export const COMMODITY_INSTRUMENTS: Instrument[] = [
  { symbol: 'XAUUSD', label: 'Gold (XAU/USD)', market: 'commodity', exchange: 'OANDA', base: 'XAU', quote: 'USD', live: false },
  { symbol: 'XAGUSD', label: 'Silver (XAG/USD)', market: 'commodity', exchange: 'OANDA', base: 'XAG', quote: 'USD', live: false },
  { symbol: 'WTIUSD', label: 'Crude Oil (WTI)', market: 'commodity', exchange: 'OANDA', base: 'WTI', quote: 'USD', live: false },
  { symbol: 'BRENTUSD', label: 'Brent Oil', market: 'commodity', exchange: 'OANDA', base: 'BRENT', quote: 'USD', live: false },
  { symbol: 'NATGASUSD', label: 'Natural Gas', market: 'commodity', exchange: 'OANDA', base: 'NATGAS', quote: 'USD', live: false },
  { symbol: 'COPPERUSD', label: 'Copper', market: 'commodity', exchange: 'OANDA', base: 'COPPER', quote: 'USD', live: false },
  { symbol: 'XPTUSD', label: 'Platinum', market: 'commodity', exchange: 'OANDA', base: 'XPT', quote: 'USD', live: false },
  { symbol: 'XPDUSD', label: 'Palladium', market: 'commodity', exchange: 'OANDA', base: 'XPD', quote: 'USD', live: false },
];

export const INDEX_INSTRUMENTS: Instrument[] = [
  { symbol: 'SPX500', label: 'S&P 500', market: 'index', exchange: 'IG', base: 'SPX', quote: 'USD', live: false },
  { symbol: 'NAS100', label: 'NASDAQ 100', market: 'index', exchange: 'IG', base: 'NAS', quote: 'USD', live: false },
  { symbol: 'DJI', label: 'Dow Jones', market: 'index', exchange: 'IG', base: 'DJI', quote: 'USD', live: false },
  { symbol: 'UK100', label: 'FTSE 100', market: 'index', exchange: 'IG', base: 'UKX', quote: 'GBP', live: false },
  { symbol: 'GER40', label: 'DAX', market: 'index', exchange: 'IG', base: 'DAX', quote: 'EUR', live: false },
  { symbol: 'FRA40', label: 'CAC 40', market: 'index', exchange: 'IG', base: 'CAC', quote: 'EUR', live: false },
  { symbol: 'JPN225', label: 'Nikkei 225', market: 'index', exchange: 'IG', base: 'NKY', quote: 'JPY', live: false },
  { symbol: 'HK50', label: 'Hang Seng', market: 'index', exchange: 'IG', base: 'HSI', quote: 'HKD', live: false },
  { symbol: 'AUS200', label: 'ASX 200', market: 'index', exchange: 'IG', base: 'AXJO', quote: 'AUD', live: false },
];

// Representative stocks from NYSE / NASDAQ / LSE / TSX / Euronext.
export const STOCK_INSTRUMENTS: Instrument[] = [
  { symbol: 'AAPL', label: 'Apple (NASDAQ)', market: 'stock', exchange: 'NASDAQ', base: 'AAPL', quote: 'USD', live: false },
  { symbol: 'MSFT', label: 'Microsoft (NASDAQ)', market: 'stock', exchange: 'NASDAQ', base: 'MSFT', quote: 'USD', live: false },
  { symbol: 'GOOGL', label: 'Alphabet (NASDAQ)', market: 'stock', exchange: 'NASDAQ', base: 'GOOGL', quote: 'USD', live: false },
  { symbol: 'AMZN', label: 'Amazon (NASDAQ)', market: 'stock', exchange: 'NASDAQ', base: 'AMZN', quote: 'USD', live: false },
  { symbol: 'TSLA', label: 'Tesla (NASDAQ)', market: 'stock', exchange: 'NASDAQ', base: 'TSLA', quote: 'USD', live: false },
  { symbol: 'NVDA', label: 'NVIDIA (NASDAQ)', market: 'stock', exchange: 'NASDAQ', base: 'NVDA', quote: 'USD', live: false },
  { symbol: 'JPM', label: 'JPMorgan (NYSE)', market: 'stock', exchange: 'NYSE', base: 'JPM', quote: 'USD', live: false },
  { symbol: 'V', label: 'Visa (NYSE)', market: 'stock', exchange: 'NYSE', base: 'V', quote: 'USD', live: false },
  { symbol: 'SHEL', label: 'Shell (LSE)', market: 'stock', exchange: 'LSE', base: 'SHEL', quote: 'GBP', live: false },
  { symbol: 'BP', label: 'BP (LSE)', market: 'stock', exchange: 'LSE', base: 'BP', quote: 'GBP', live: false },
  { symbol: 'RY', label: 'RBC (TSX)', market: 'stock', exchange: 'TSX', base: 'RY', quote: 'CAD', live: false },
  { symbol: 'AIR', label: 'Airbus (Euronext)', market: 'stock', exchange: 'Euronext', base: 'AIR', quote: 'EUR', live: false },
];

export const ALL_INSTRUMENTS: Instrument[] = [
  ...CRYPTO_INSTRUMENTS,
  ...FOREX_INSTRUMENTS,
  ...COMMODITY_INSTRUMENTS,
  ...INDEX_INSTRUMENTS,
  ...STOCK_INSTRUMENTS,
];

export const TIMEFRAMES: { value: Timeframe; label: string; binance: string }[] = [
  { value: '1m', label: '1m', binance: '1m' },
  { value: '3m', label: '3m', binance: '3m' },
  { value: '5m', label: '5m', binance: '5m' },
  { value: '15m', label: '15m', binance: '15m' },
  { value: '30m', label: '30m', binance: '30m' },
  { value: '1h', label: '1h', binance: '1h' },
  { value: '4h', label: '4h', binance: '4h' },
  { value: '1d', label: 'D', binance: '1d' },
  { value: '1w', label: 'W', binance: '1w' },
  { value: '1M', label: 'M', binance: '1M' },
];

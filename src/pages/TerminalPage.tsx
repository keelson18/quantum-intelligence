import { useState, useEffect, useCallback, useMemo } from 'react';
import { Terminal, TrendingUp, TrendingDown, Wifi, WifiOff, Send } from 'lucide-react';
import { fetchKlines, subscribeKlines, subscribeLivePrice, fetchOrderBook, type OrderBook } from '../lib/market';
import { CRYPTO_INSTRUMENTS, type Candle, type Timeframe, type Side } from '../lib/types';
import { openPosition, closePosition, fetchOpenPositions, type PaperPosition } from '../lib/paperTrading';

type WsStatus = 'connecting' | 'open' | 'closed' | 'reconnecting';

export default function TerminalPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
  const [orderSide, setOrderSide] = useState<Side>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [quantity, setQuantity] = useState('0.01');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [trailingStop, setTrailingStop] = useState('');
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [tickerPrices, setTickerPrices] = useState<Record<string, number>>({});
  const [tickerStatus, setTickerStatus] = useState<WsStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const data = await fetchKlines(symbol, timeframe, 200);
        if (!disposed) { setCandles(data); setLivePrice(data[data.length - 1]?.close ?? null); }
      } catch { if (!disposed) setCandles([]); }
    })();
    const unsub = subscribeKlines(symbol, timeframe, (c) => {
      setCandles((prev) => {
        const arr = [...prev];
        const last = arr[arr.length - 1];
        if (last && last.time === c.time) arr[arr.length - 1] = c;
        else if (!last || c.time > last.time) arr.push(c);
        return arr;
      });
      setLivePrice(c.close);
    }, (s) => setWsStatus(s));
    return () => { disposed = true; unsub(); };
  }, [symbol, timeframe]);

  useEffect(() => {
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const book = await fetchOrderBook(symbol, 8);
        if (!cancelled) setOrderBook(book);
      } catch { /* rate-limited */ }
    }, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [symbol]);

  const tickSymbols = useMemo(
    () => CRYPTO_INSTRUMENTS.filter((i) => i.live).slice(0, 8).map((i) => i.symbol),
    [],
  );
  useEffect(() => {
    const unsub = subscribeLivePrice(tickSymbols, (sym, price) => {
      setTickerPrices((prev) => ({ ...prev, [sym]: price }));
    }, (s) => setTickerStatus(s));
    return () => unsub();
  }, [tickSymbols]);

  const loadPositions = useCallback(async () => {
    const open = await fetchOpenPositions();
    setPositions(open);
  }, []);
  useEffect(() => { loadPositions(); }, [loadPositions]);

  const submitOrder = async () => {
    setError(null); setSuccess(null);
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) { setError('Enter a valid quantity'); return; }
    const price = orderType === 'market' ? (livePrice ?? 0) : parseFloat(limitPrice);
    if (orderType !== 'market' && (!price || price <= 0)) { setError('Enter a valid price'); return; }

    const label = CRYPTO_INSTRUMENTS.find((c) => c.symbol === symbol)?.label ?? symbol;
    const sl = stopLoss ? parseFloat(stopLoss) : null;
    const tp = takeProfit ? parseFloat(takeProfit) : null;
    const trailing = trailingStop ? parseFloat(trailingStop) : null;

    const result = await openPosition({
      symbol, label,
      side: orderSide === 'buy' ? 'long' : 'short',
      quantity: qty,
      order_type: orderType,
      limit_price: orderType !== 'market' ? price : null,
      stop_loss: sl, take_profit: tp, trailing_stop_pct: trailing,
      strategy: 'manual',
    }, livePrice ?? 0);

    if (result) {
      setSuccess(`${orderType === 'market' ? 'Filled' : 'Pending'}: ${orderSide.toUpperCase()} ${qty} ${symbol.replace('USDT', '')} @ ${orderType === 'market' ? '$' + (livePrice ?? 0).toFixed(2) : '$' + price.toFixed(2)}`);
      loadPositions();
    } else {
      setError('Order failed. Please try again.');
    }
  };

  const handleClosePos = async (id: string) => {
    const price = livePrice ?? 0;
    if (price <= 0) return;
    await closePosition(id, price, 'manual');
    loadPositions();
  };

  const last24Change = candles.length >= 25
    ? ((candles[candles.length - 1].close - candles[candles.length - 25].close) / candles[candles.length - 25].close) * 100
    : 0;

  const maxTotal = Math.max(
    ...(orderBook ? [...orderBook.bids, ...orderBook.asks].map((e) => e.total) : [1]),
  );

  return (
    <div className="px-4 lg:px-6 py-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Terminal className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">Trading Terminal</h1>
          <p className="text-xs text-muted mt-0.5">Paper trading with live market data</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs">
          {wsStatus === 'open' ? <Wifi className="w-3.5 h-3.5 text-success" /> : <WifiOff className="w-3.5 h-3.5 text-danger" />}
          <span className={wsStatus === 'open' ? 'text-success' : 'text-danger'}>{wsStatus}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 overflow-x-auto py-2 mb-3 border-y border-border">
        {tickerStatus === 'open' ? <Wifi className="w-3 h-3 text-success shrink-0" /> : <WifiOff className="w-3 h-3 text-muted shrink-0" />}
        {tickSymbols.map((sym) => {
          const price = tickerPrices[sym];
          const label = CRYPTO_INSTRUMENTS.find((c) => c.symbol === sym)?.label ?? sym;
          return (
            <button key={sym} onClick={() => setSymbol(sym)}
              className={`flex items-center gap-2 text-xs whitespace-nowrap shrink-0 transition-colors ${symbol === sym ? 'text-primary' : 'text-muted hover:text-text'}`}>
              <span className="font-medium">{label}</span>
              {price && <span className="tabular-nums">${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)}
                className="px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm font-medium">
                {CRYPTO_INSTRUMENTS.filter((i) => i.live).map((i) => (
                  <option key={i.symbol} value={i.symbol}>{i.label}</option>
                ))}
              </select>
              <div className="flex gap-1 p-1 rounded-lg bg-bg border border-border">
                {(['1m', '5m', '15m', '1h'] as Timeframe[]).map((tf) => (
                  <button key={tf} onClick={() => setTimeframe(tf)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${timeframe === tf ? 'bg-primary text-black' : 'text-muted hover:text-text'}`}>
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4 mb-3">
              <div className="text-2xl font-bold tabular-nums">
                ${livePrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—'}
              </div>
              <div className={`text-sm flex items-center gap-1 ${last24Change >= 0 ? 'text-success' : 'text-danger'}`}>
                {last24Change >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {Math.abs(last24Change).toFixed(2)}%
              </div>
            </div>
            {candles.length > 2 && <PriceSparkline candles={candles.slice(-60)} />}
          </div>

          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold">Order Book</h3>
              {orderBook && <span className="text-xs text-muted">Spread: ${orderBook.spread.toFixed(2)}</span>}
            </div>
            {orderBook ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <div className="text-[10px] text-muted text-center mb-1">Bids</div>
                  {orderBook.bids.slice(0, 6).map((b, i) => (
                    <div key={i} className="relative flex items-center justify-between text-xs py-1 px-2 rounded overflow-hidden">
                      <div className="absolute right-0 top-0 bottom-0 bg-success/10" style={{ width: `${(b.total / maxTotal) * 100}%` }} />
                      <span className="relative tabular-nums text-success">${b.price.toFixed(2)}</span>
                      <span className="relative tabular-nums text-muted">{b.quantity.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-0.5">
                  <div className="text-[10px] text-muted text-center mb-1">Asks</div>
                  {orderBook.asks.slice(0, 6).map((a, i) => (
                    <div key={i} className="relative flex items-center justify-between text-xs py-1 px-2 rounded overflow-hidden">
                      <div className="absolute left-0 top-0 bottom-0 bg-danger/10" style={{ width: `${(a.total / maxTotal) * 100}%` }} />
                      <span className="relative tabular-nums text-danger">${a.price.toFixed(2)}</span>
                      <span className="relative tabular-nums text-muted">{a.quantity.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted py-4 text-center">Loading order book…</div>
            )}
          </div>

          {/* Open positions */}
          {positions.length > 0 && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold mb-3">Open Paper Positions</h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {positions.map((p) => {
                  const dir = p.side === 'long' ? 1 : -1;
                  const curPrice = livePrices_sync(p.symbol, tickerPrices, livePrice);
                  const pnl = (curPrice - p.entry_price) * dir * p.quantity;
                  return (
                    <div key={p.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-bg/50">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${p.side === 'long' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                        {p.side}
                      </span>
                      <span className="font-medium">{p.label}</span>
                      <span className="text-muted">{p.quantity}</span>
                      <span className="text-muted tabular-nums">@ ${p.entry_price.toFixed(2)}</span>
                      <span className={`tabular-nums ml-auto ${pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </span>
                      <button onClick={() => handleClosePos(p.id)} className="text-muted hover:text-danger transition-colors text-[10px] px-1.5 py-0.5 rounded bg-bg">Close</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-xs font-semibold mb-3">Order Entry <span className="text-muted font-normal text-[10px]">(Paper)</span></h3>
            <div className="flex gap-1 p-1 rounded-lg bg-bg border border-border mb-3">
              <button onClick={() => setOrderSide('buy')}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${orderSide === 'buy' ? 'bg-success text-black' : 'text-muted hover:text-text'}`}>
                Buy / Long
              </button>
              <button onClick={() => setOrderSide('sell')}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${orderSide === 'sell' ? 'bg-danger text-black' : 'text-muted hover:text-text'}`}>
                Sell / Short
              </button>
            </div>
            <div className="flex gap-1 p-1 rounded-lg bg-bg border border-border mb-3">
              {(['market', 'limit', 'stop'] as const).map((t) => (
                <button key={t} onClick={() => setOrderType(t)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium capitalize transition-colors ${orderType === t ? 'bg-primary text-black' : 'text-muted hover:text-text'}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {orderType !== 'market' && (
                <div>
                  <label className="text-xs text-muted">{orderType === 'limit' ? 'Limit' : 'Stop'} Price</label>
                  <input value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} placeholder={livePrice?.toFixed(2) ?? '0.00'}
                    className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm tabular-nums focus:outline-none focus:border-primary" />
                </div>
              )}
              <div>
                <label className="text-xs text-muted">Quantity</label>
                <input value={quantity} onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm tabular-nums focus:outline-none focus:border-primary" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted">SL</label>
                  <input value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="—"
                    className="w-full px-2 py-1.5 rounded-lg bg-bg border border-border text-text text-xs tabular-nums focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs text-muted">TP</label>
                  <input value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="—"
                    className="w-full px-2 py-1.5 rounded-lg bg-bg border border-border text-text text-xs tabular-nums focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs text-muted">Trail %</label>
                  <input value={trailingStop} onChange={(e) => setTrailingStop(e.target.value)} placeholder="—"
                    className="w-full px-2 py-1.5 rounded-lg bg-bg border border-border text-text text-xs tabular-nums focus:outline-none focus:border-primary" />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Est. Value</span>
                <span className="tabular-nums font-medium">
                  ${(parseFloat(quantity || '0') * (orderType === 'market' ? (livePrice ?? 0) : (parseFloat(limitPrice) || 0))).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
              {error && <div className="text-xs text-danger">{error}</div>}
              {success && <div className="text-xs text-success">{success}</div>}
              <button onClick={submitOrder}
                className={`w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  orderSide === 'buy' ? 'bg-success text-black hover:bg-success/90' : 'bg-danger text-black hover:bg-danger/90'
                }`}>
                <Send className="w-3.5 h-3.5" />
                {orderSide === 'buy' ? 'Buy' : 'Sell'} {symbol.replace('USDT', '')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function livePrices_sync(symbol: string, tickerPrices: Record<string, number>, livePrice: number | null): number {
  return tickerPrices[symbol] ?? livePrice ?? 0;
}

function PriceSparkline({ candles }: { candles: Candle[] }) {
  if (candles.length < 2) return null;
  const vals = candles.map((c) => c.close);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const w = 600, h = 120;
  const points = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={up ? '#22c55e' : '#ef4444'} strokeWidth="1.5" />
    </svg>
  );
}

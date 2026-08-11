import AITrainingPanel from '../components/AITrainingPanel';
import { GraduationCap } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { fetchKlines } from '../lib/binance';
import type { Candle, Timeframe } from '../lib/types';

export default function LearningPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [candles, setCandles] = useState<Candle[]>([]);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchKlines(symbol, timeframe, 500);
      setCandles(data);
    } catch { setCandles([]); }
  }, [symbol, timeframe]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="px-4 lg:px-6 py-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <GraduationCap className="w-5 h-5 text-primary" />
        </div>
        <h1 className="text-base font-semibold tracking-tight">AI Learning</h1>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)}
          className="px-2.5 py-2 rounded-lg bg-surface border border-border text-text text-sm">
          {['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}
          className="px-2.5 py-2 rounded-lg bg-surface border border-border text-text text-sm">
          {['15m', '1h', '4h', '1d'].map((tf) => <option key={tf} value={tf}>{tf}</option>)}
        </select>
      </div>
      <div className="max-w-2xl">
        <AITrainingPanel symbol={symbol} timeframe={timeframe} candles={candles} />
      </div>
    </div>
  );
}

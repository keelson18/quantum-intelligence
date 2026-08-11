import { useEffect, useRef } from 'react';
import {
  createChart, ColorType, CrosshairMode, type IChartApi, type ISeriesApi, type Time,
} from 'lightweight-charts';
import type { EpochMetrics } from '../ai/types';
import { useTheme } from '../context/ThemeContext';

interface Props {
  metrics: EpochMetrics[];
}

// ModelMetrics — visualizes training loss and accuracy curves using lightweight-charts.
// Shows train/val loss on one chart and train/val accuracy on another.
export default function ModelMetrics({ metrics }: Props) {
  const { theme } = useTheme();
  const lossContainerRef = useRef<HTMLDivElement>(null);
  const accContainerRef = useRef<HTMLDivElement>(null);
  const lossChartRef = useRef<IChartApi | null>(null);
  const accChartRef = useRef<IChartApi | null>(null);
  const lossSeriesRef = useRef<{ train: ISeriesApi<'Line'>; val: ISeriesApi<'Line'> } | null>(null);
  const accSeriesRef = useRef<{ train: ISeriesApi<'Line'>; val: ISeriesApi<'Line'> } | null>(null);

  const bg = theme === 'dark' ? '#000000' : '#ffffff';
  const text = theme === 'dark' ? '#e5e5e5' : '#171717';
  const grid = theme === 'dark' ? '#1a1a1a' : '#f0f0f0';
  const border = theme === 'dark' ? '#262626' : '#e5e5e5';

  // Create charts once.
  useEffect(() => {
    if (!lossContainerRef.current || !accContainerRef.current) return;

    const makeChart = (container: HTMLDivElement) => {
      const chart = createChart(container, {
        layout: { background: { type: ColorType.Solid, color: bg }, textColor: text, fontSize: 11 },
        grid: { vertLines: { color: grid }, horzLines: { color: grid } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: border },
        timeScale: { borderColor: border, timeVisible: false },
        width: container.clientWidth,
        height: 120,
      });
      return chart;
    };

    lossChartRef.current = makeChart(lossContainerRef.current);
    accChartRef.current = makeChart(accContainerRef.current);

    lossSeriesRef.current = {
      train: lossChartRef.current.addLineSeries({ color: '#10a37f', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'train' }),
      val: lossChartRef.current.addLineSeries({ color: '#ef4444', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'val' }),
    };
    accSeriesRef.current = {
      train: accChartRef.current.addLineSeries({ color: '#10a37f', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'train' }),
      val: accChartRef.current.addLineSeries({ color: '#ef4444', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'val' }),
    };

    const handleResize = () => {
      if (lossChartRef.current && lossContainerRef.current) lossChartRef.current.applyOptions({ width: lossContainerRef.current.clientWidth });
      if (accChartRef.current && accContainerRef.current) accChartRef.current.applyOptions({ width: accContainerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      lossChartRef.current?.remove();
      accChartRef.current?.remove();
      lossChartRef.current = null;
      accChartRef.current = null;
    };
  }, [bg, text, grid, border]);

  // Update chart data when metrics change.
  useEffect(() => {
    if (!lossSeriesRef.current || !accSeriesRef.current) return;
    const lossData = metrics.map((m) => ({ time: m.epoch as Time, value: m.loss }));
    const valLossData = metrics.map((m) => ({ time: m.epoch as Time, value: m.valLoss }));
    const accData = metrics.filter((m) => m.accuracy != null).map((m) => ({ time: m.epoch as Time, value: m.accuracy! }));
    const valAccData = metrics.filter((m) => m.valAccuracy != null).map((m) => ({ time: m.epoch as Time, value: m.valAccuracy! }));

    lossSeriesRef.current.train.setData(lossData);
    lossSeriesRef.current.val.setData(valLossData);
    accSeriesRef.current.train.setData(accData);
    accSeriesRef.current.val.setData(valAccData);

    lossChartRef.current?.timeScale().fitContent();
    accChartRef.current?.timeScale().fitContent();
  }, [metrics]);

  if (metrics.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-muted mb-1">Loss (lower is better)</div>
        <div ref={lossContainerRef} className="w-full h-[120px]" />
      </div>
      <div>
        <div className="text-xs text-muted mb-1">Accuracy (higher is better)</div>
        <div ref={accContainerRef} className="w-full h-[120px]" />
      </div>
    </div>
  );
}

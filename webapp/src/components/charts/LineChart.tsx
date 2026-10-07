'use client';

import { useMemo } from 'react';
import { formatJalali } from '@/lib/jalali';

export interface ChartSeries {
  name: string;
  color: string;
  points: { x: string; y: number }[];
}

/**
 * Minimal dependency-free line chart. X = Jalali dates (chronological,
 * left→right), Y = values. Used for progress / SPI / CPI trends.
 */
export function LineChart({
  series, height = 220, percent = false, title,
}: { series: ChartSeries[]; height?: number; percent?: boolean; title?: string }) {
  const W = 760;
  const H = height;
  const PAD_L = 52, PAD_R = 14, PAD_T = 14, PAD_B = 28;

  const geom = useMemo(() => {
    const pts = series.flatMap((s) => s.points).filter((p) => Number.isFinite(p.y));
    if (pts.length === 0) return null;
    const xs = [...new Set(pts.map((p) => p.x))].sort();
    const xIndex = new Map(xs.map((x, i) => [x, i]));
    let yMin = Math.min(...pts.map((p) => p.y));
    let yMax = Math.max(...pts.map((p) => p.y));
    if (percent) { yMin = Math.min(0, yMin); }
    const span = yMax - yMin || Math.abs(yMax) || 1;
    yMin -= span * 0.08;
    yMax += span * 0.08;
    const px = (x: string) => PAD_L + (xIndex.get(x)! / Math.max(1, xs.length - 1)) * (W - PAD_L - PAD_R);
    const py = (y: number) => PAD_T + (1 - (y - yMin) / (yMax - yMin)) * (H - PAD_T - PAD_B);
    return { xs, xIndex, yMin, yMax, px, py };
  }, [series, percent, H]);

  if (!geom) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">داده‌ای برای نمودار وجود ندارد</div>
    );
  }

  const { xs, yMin, yMax, px, py } = geom;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * (yMax - yMin));
  const xLabelEvery = Math.max(1, Math.ceil(xs.length / 7));

  const fmtY = (v: number) => (percent ? `${(v * 100).toFixed(0)}٪` : v.toFixed(2));

  return (
    <div>
      {title && <div className="mb-1 text-sm font-bold text-slate-700">{title}</div>}
      <div className="mb-2 flex flex-wrap gap-3">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ direction: 'ltr' }} role="img">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={py(t)} y2={py(t)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={PAD_L - 6} y={py(t) + 3.5} textAnchor="end" fontSize="10" fill="#64748b">
              {fmtY(t)}
            </text>
          </g>
        ))}
        {xs.map((x, i) =>
          i % xLabelEvery === 0 || i === xs.length - 1 ? (
            <text key={x} x={px(x)} y={H - 8} textAnchor="middle" fontSize="9.5" fill="#64748b">
              {formatJalali(x)}
            </text>
          ) : null
        )}
        {series.map((s) => {
          const valid = [...s.points].sort((a, b) => a.x.localeCompare(b.x)).filter((p) => Number.isFinite(p.y));
          const d = valid.map((p) => `${px(p.x)},${py(p.y)}`).join(' ');
          return (
            <g key={s.name}>
              <polyline points={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {valid.map((p) => (
                <circle key={p.x} cx={px(p.x)} cy={py(p.y)} r="2.6" fill={s.color}>
                  <title>{`${formatJalali(p.x, { long: true })} — ${fmtY(p.y)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

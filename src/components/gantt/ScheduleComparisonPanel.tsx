import React, { useMemo, useState } from 'react';

type Layer = 'baseline' | 'official' | 'actual' | 'shadow';

const colors: Record<Layer, { label: string; bar: string; track: string }> = {
  baseline: { label: 'Baseline', bar: 'border-slate-400 bg-slate-200/80', track: 'border-slate-300' },
  official: { label: 'Official Forecast', bar: 'border-blue-600 bg-blue-500', track: 'border-blue-200' },
  actual: { label: 'Actual', bar: 'border-emerald-700 bg-emerald-500', track: 'border-emerald-200' },
  shadow: { label: 'Shadow (Fresh)', bar: 'border-dashed border-violet-600 bg-violet-200', track: 'border-violet-200' },
};

function dateValue(value: string | null | undefined) {
  return value ? Date.parse(`${value}T00:00:00Z`) : NaN;
}

function formatDate(value: string | null | undefined) {
  return value ? value.slice(5) : '—';
}

function pct(value: unknown) {
  const n = Number(value || 0);
  return `${Math.round(n * 10) / 10}%`;
}

export function ScheduleComparisonPanel({ comparison, compact = false }: { comparison: any; compact?: boolean }) {
  const [visible, setVisible] = useState<Record<Layer, boolean>>({ baseline: true, official: true, actual: true, shadow: true });
  const rows = comparison?.taskRows || [];
  const freshShadow = comparison?.shadow?.fresh === true;
  const bounds = useMemo(() => {
    const dates = rows.flatMap((row: any) => [row.baseline?.start, row.baseline?.end, row.official?.start, row.official?.end, row.shadow?.start, row.shadow?.end, row.actual?.first_activity_date, row.actual?.latest_activity_date]).filter(Boolean).map(dateValue).filter(Number.isFinite);
    if (!dates.length) return { start: Date.now(), end: Date.now() + 86400000 };
    return { start: Math.min(...dates), end: Math.max(...dates) };
  }, [rows]);
  const span = Math.max(bounds.end - bounds.start, 86400000);
  const left = (date: string | null | undefined) => `${Math.max(0, Math.min(100, ((dateValue(date) - bounds.start) / span) * 100))}%`;
  const width = (start: string | null | undefined, end: string | null | undefined) => {
    if (!start || !end) return '0%';
    return `${Math.max(1, Math.min(100, ((dateValue(end) - dateValue(start) + 86400000) / span) * 100))}%`;
  };
  const toggle = (layer: Layer) => setVisible((current) => ({ ...current, [layer]: !current[layer] }));

  if (!comparison) return null;
  return (
    <section data-testid="schedule-comparison-panel" className={`border border-slate-200 bg-white ${compact ? 'rounded-lg p-3' : 'rounded-xl p-4'} shadow-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">4-Layer Schedule Comparison</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">As of {comparison.asOf} · {comparison.timezone || 'local calendar'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
          {(Object.keys(colors) as Layer[]).map((layer) => (
            <button key={layer} type="button" aria-pressed={visible[layer]} onClick={() => toggle(layer)} data-testid={`comparison-toggle-${layer}`} className={`rounded-md border px-2 py-1 ${visible[layer] ? 'bg-white text-slate-800' : 'bg-slate-100 text-slate-400 line-through'}`}>
              <span className={`mr-1 inline-block h-2 w-2 rounded-sm ${colors[layer].bar}`} />{colors[layer].label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        {[
          ['Baseline progress', pct(comparison.kpi?.baseline_progress), 'text-slate-700'],
          ['Actual progress', pct(comparison.kpi?.actual_progress), 'text-emerald-700'],
          ['Progress delta', `${Number(comparison.kpi?.progress_delta || 0) > 0 ? '+' : ''}${pct(comparison.kpi?.progress_delta)}`, 'text-blue-700'],
          ['Official end', formatDate(comparison.kpi?.official_end), 'text-blue-700'],
          ['Shadow end', freshShadow ? formatDate(comparison.shadow?.end) : '—', freshShadow ? 'text-violet-700' : 'text-slate-400'],
        ].map(([label, value, tone]) => <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"><div className="text-[10px] font-semibold text-slate-500">{label}</div><div className={`mt-0.5 text-sm font-extrabold ${tone}`}>{value}</div></div>)}
      </div>

      {comparison.shadow?.stale_warning && <div data-testid="comparison-shadow-stale" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Shadow is stale and is hidden as a current candidate. Recalculation is required.</div>}

      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[220px_1fr] border-b border-slate-200 pb-1 text-[10px] font-bold text-slate-500"><div>Task</div><div className="flex justify-between"><span>{new Date(bounds.start).toISOString().slice(5, 10)}</span><span>{new Date(bounds.end).toISOString().slice(5, 10)}</span></div></div>
          {rows.map((row: any) => <div key={row.task_id} data-testid={`comparison-task-${row.task_id}`} className="grid grid-cols-[220px_1fr] items-center border-b border-slate-100 py-2 last:border-b-0"><div className="pr-2"><div className="truncate text-xs font-bold text-slate-800" title={row.task_name}>{row.task_name}</div><div className="text-[10px] text-slate-500">{row.primary_worker_name || '—'} · Actual {pct(row.actual?.progress)} · {row.actual?.provenance || 'NONE'}</div></div><div className="relative h-12 rounded border border-slate-100 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px)] bg-[length:24px_100%]">{visible.baseline && row.baseline?.start && <div aria-label="Baseline" className={`absolute top-1 h-2 rounded border ${colors.baseline.bar}`} style={{ left: left(row.baseline.start), width: width(row.baseline.start, row.baseline.end) }} />} {visible.official && row.official?.start && <div aria-label="Official Forecast" className={`absolute top-4 h-2 rounded border ${colors.official.bar}`} style={{ left: left(row.official.start), width: width(row.official.start, row.official.end) }} />} {visible.actual && (row.actual?.activity_dates || []).map((date: string) => <div key={`${row.task_id}-actual-${date}`} aria-label="Actual activity" className={`absolute top-7 h-2 rounded border ${colors.actual.bar}`} style={{ left: left(date), width: width(date, date) }} />)} {visible.shadow && freshShadow && row.shadow?.start && <div aria-label="Shadow Candidate" className={`absolute top-10 h-2 rounded border-2 ${colors.shadow.bar}`} style={{ left: left(row.shadow.start), width: width(row.shadow.start, row.shadow.end) }} />}</div></div>)}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-semibold text-slate-500"><span>Baseline: reference</span><span>Official: approved schedule</span><span>Actual: evidence only</span><span>Shadow: tentative, fresh only</span></div>
    </section>
  );
}

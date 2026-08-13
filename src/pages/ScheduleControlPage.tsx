import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, History, RefreshCw, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { api, getCurrentWorkerId, setCurrentWorker } from '../services/api';
import { isExecutiveViewer, Project, Worker } from '../types';
import { WorkerSelector } from '../components/common/WorkerSelector';
import { LanguageSelector } from '../components/common/LanguageSelector';

const parseCodes = (value?: string | null): string[] => {
  try { return value ? JSON.parse(value) : []; } catch { return []; }
};

function Tone({ value }: { value?: string | null }) {
  const text = value || '—';
  const classes = text.includes('BLOCK') || text.includes('REJECT')
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : text.includes('APPROVAL') || text.includes('PENDING')
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : text.includes('APPLY') || text.includes('APPROVED') || text.includes('CURRENT')
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-slate-200 bg-slate-50 text-slate-600';
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${classes}`}>{text}</span>;
}

export function ScheduleControlPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [currentWorker, setCurrentWorkerState] = useState<Worker | null>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [history, setHistory] = useState<any>({ versions: [], adjustments: [], approvals: [] });
  const [restorePreview, setRestorePreview] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isManager = Boolean(currentWorker && currentWorker.access_role === 'EDITOR' && Number(currentWorker.can_manage_schedule_engine) === 1);
  const isExecutive = isExecutiveViewer(currentWorker);
  const shadow = forecast?.shadow_version;
  const official = forecast?.official_forecast;
  const approval = forecast?.approval_request;
  const staleShadow = forecast?.stale_shadow_version;
  const canDirectApply = isManager && shadow?.approval_classification === 'AUTO_APPLY_ELIGIBLE';
  const canApprove = isManager && shadow?.approval_classification === 'APPROVAL_REQUIRED' && approval?.status === 'PENDING';

  const load = async () => {
    const [detail, workerRows, current, versionHistory] = await Promise.all([
      api.getProjectDetail(projectId), api.getWorkers(), api.getCurrentForecast(projectId), api.getForecastHistory(projectId),
    ]);
    setProject(detail.project);
    setWorkers(workerRows);
    setForecast(current);
    setHistory(versionHistory);
    const selected = getCurrentWorkerId();
    setCurrentWorkerState(workerRows.find((item) => item.id === selected || item.name === selected) || workerRows[0] || null);
  };

  useEffect(() => { load().catch((reason) => setError(reason.message || String(reason))); }, [projectId]);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await load(); setRestorePreview(null); }
    catch (reason: any) { setError(`${reason.code ? `[${reason.code}] ` : ''}${reason.message || String(reason)}`); }
    finally { setBusy(false); }
  };

  const restorableVersions = useMemo(() => (history.versions || []).filter((item: any) => item.id !== official?.id), [history.versions, official?.id]);

  return (
    <div data-testid="schedule-control-page" className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/projects/${projectId}`)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>
          <div><h1 className="text-base font-black">Official Forecast Schedule Control</h1><p className="text-[10px] text-slate-500">{project?.name || projectId} · Checkpoint 3B</p></div>
        </div>
        <div className="flex items-center gap-2"><LanguageSelector /><WorkerSelector currentWorker={currentWorker} onWorkerChange={(worker) => { setCurrentWorker(worker); setCurrentWorkerState(worker); }} /></div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
        {isExecutive && <section data-testid="forecast-executive-readonly" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">CEO/COO accounts can review forecast history but cannot apply, approve, reject, or restore.</section>}
        {!isManager && !isExecutive && <section className="rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-600">Select a schedule manager to execute controlled Forecast actions. Server authorization remains mandatory.</section>}
        {error && <section className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</section>}
        {staleShadow && <section data-testid="forecast-stale-shadow-warning" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">The newest Shadow candidate is stale and cannot be applied. Create a new Shadow run after the authoritative schedule change.</section>}
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Official Forecast', official ? `V${official.version_number} · ${official.project_forecast_end || '—'}` : '—'],
            ['Shadow Candidate', shadow ? `S${shadow.shadow_version_number} · ${shadow.shadow_forecast_end_date || '—'}` : '—'],
            ['Classification', shadow?.approval_classification || 'NO_SHADOW'],
            ['Approval', approval?.status || 'NOT_REQUIRED'],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><div className="mt-2 text-sm font-black"><Tone value={String(value)} /></div></div>)}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">Candidate review</h2><p className="mt-1 text-xs text-slate-500">Official Forecast writes only append a new version and a complete Task snapshot.</p></div><button disabled={busy} onClick={() => act(load)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"><RefreshCw className="h-3.5 w-3.5" />Refresh</button></div>
          {shadow ? <div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-lg bg-slate-50 p-3 text-xs"><p>Current official end: <b>{official?.project_forecast_end || '—'}</b></p><p className="mt-1">Shadow end: <b>{shadow.shadow_forecast_end_date || '—'}</b></p><p className="mt-1">Confidence: <Tone value={shadow.data_confidence} /></p></div><div className="rounded-lg bg-slate-50 p-3 text-xs"><p className="font-bold">Reason codes</p><p className="mt-1 text-slate-600">{parseCodes(shadow.approval_reasons_json).join(', ') || '—'}</p></div></div> : <p className="mt-4 text-sm text-slate-500">No current unapplied Shadow candidate exists for this project.</p>}
          {shadow && <div data-testid="forecast-run-provenance" className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Official Forecast Version', official?.id || '—'],
              ['Shadow Version', shadow.shadow_version_id || '—'],
              ['Shadow Run', shadow.run_id || '—'],
              ['Engine Version', shadow.engine_version || '—'],
              ['Source Worklog', shadow.source_worklog_id || '—'],
              ['Source Revision', shadow.source_revision_id || '—'],
              ['Approval Required', shadow.approval_classification === 'APPROVAL_REQUIRED' ? 'YES' : 'NO'],
              ['Constraint Result', parseCodes(shadow.constraint_results_json).join(', ') || 'NONE'],
            ].map(([label, value]) => <div key={label} className="min-w-0"><p className="font-bold text-slate-500">{label}</p><p className="truncate font-mono text-slate-800" title={value}>{value}</p></div>)}
          </div>}
          {shadow?.approval_classification === 'BLOCKED' && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800"><AlertTriangle className="mr-1 inline h-4 w-4" />Blocked Shadow cannot be force-applied.</div>}
          <div className="mt-4 flex flex-wrap gap-2">
            {canDirectApply && <button data-testid="forecast-apply-button" disabled={busy} onClick={() => act(() => api.applyShadowForecast(shadow.shadow_version_id))} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" />Controlled apply</button>}
            {canApprove && <button data-testid="forecast-approve-button" disabled={busy} onClick={() => act(() => api.approveShadowForecast(shadow.shadow_version_id))} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" />Approve & apply</button>}
            {canApprove && <div className="flex gap-2"><input aria-label="forecast reject reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Reject reason required" className="rounded-lg border border-slate-300 px-3 py-2 text-xs" /><button data-testid="forecast-reject-button" disabled={busy || !rejectReason.trim()} onClick={() => act(() => api.rejectShadowForecast(shadow.shadow_version_id, rejectReason))} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 disabled:opacity-50"><X className="h-3.5 w-3.5" />Reject</button></div>}
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-black"><History className="h-4 w-4 text-violet-600" />Forecast version history</h2>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">Version</th><th className="p-2">Source</th><th className="p-2">Forecast end</th><th className="p-2">Created</th><th className="p-2">Restore</th></tr></thead><tbody>{(history.versions || []).map((version: any) => <tr key={version.id} className="border-t border-slate-100"><td className="p-2 font-black">V{version.version_number}</td><td className="p-2"><Tone value={version.source_type} /></td><td className="p-2">{version.project_forecast_end || '—'}</td><td className="p-2 text-slate-500">{version.created_at ? new Date(version.created_at).toLocaleString() : '—'}</td><td className="p-2">{isManager && version.id !== official?.id && <button disabled={busy} onClick={() => act(async () => setRestorePreview(await api.getRestorePreview(projectId, version.id)))} className="inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700"><RotateCcw className="h-3 w-3" />Preview</button>}</td></tr>)}</tbody></table></div>
        </section>
        {restorePreview && <section data-testid="forecast-restore-preview" className="rounded-xl border border-violet-200 bg-violet-50 p-4 shadow-sm"><h2 className="font-black text-violet-900">Restore preview</h2><p className="mt-1 text-xs text-violet-800">Current end {restorePreview.project_end_before || '—'} → restored end {restorePreview.project_end_after || '—'}. This creates a new version; no historical version is modified.</p><div className="mt-3 flex gap-2"><button disabled={busy} onClick={() => act(() => api.restoreForecastVersion(projectId, restorePreview.target_version.id, restorePreview.current_version.id))} className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Restore as new version</button><button disabled={busy} onClick={() => setRestorePreview(null)} className="rounded-lg border border-violet-200 px-4 py-2 text-xs font-bold text-violet-700">Cancel</button></div></section>}
      </main>
    </div>
  );
}

export default ScheduleControlPage;

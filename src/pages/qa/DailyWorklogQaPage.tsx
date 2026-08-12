import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, Database, ShieldAlert, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TestActorModeBadge } from '../../components/common/TestActorModeBadge';
import { WorkerSelector } from '../../components/common/WorkerSelector';
import { api, getCurrentWorkerId } from '../../services/api';
import type { Worker } from '../../types';

const dateInZone = (timezone = 'Asia/Seoul') => new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const labels = {
  ko: {
    title: '일일 업무기록 API 검증', subtitle: 'Checkpoint 2 · Actual / Capacity Foundation',
    actor: '인증된 테스트 행위자', date: '직원 현지 업무일', office: '오피스 정책', capacity: '유효 Capacity',
    task: '배정 작업', role: '역할', morning: '오전 계획 제출', eod: 'EOD Actual 제출',
    actual: '실제 시간(분)', progress: '공정률', remaining: '잔여 예상(분)', result: '업무 결과',
    gap: '부족시간 사유', overtime: '초과근무 사유', revision: '현재 Revision', audit: '감사 이벤트',
    aggregate: 'Task Actual 집계', guard: '권한 검증', readonly: 'CEO/COO는 조회·출력만 가능하며 쓰기 API는 403으로 차단됩니다.',
  },
  vi: {
    title: 'Kiểm thử API nhật ký công việc', subtitle: 'Checkpoint 2 · Nền tảng Actual / Capacity',
    actor: 'Test Actor đã xác thực', date: 'Ngày làm việc địa phương', office: 'Chính sách văn phòng', capacity: 'Capacity hiệu lực',
    task: 'Công việc được giao', role: 'Vai trò', morning: 'Gửi kế hoạch buổi sáng', eod: 'Gửi Actual cuối ngày',
    actual: 'Thời gian thực tế (phút)', progress: 'Tiến độ', remaining: 'Thời gian còn lại (phút)', result: 'Kết quả công việc',
    gap: 'Lý do thiếu giờ', overtime: 'Lý do tăng ca', revision: 'Revision hiện tại', audit: 'Sự kiện audit',
    aggregate: 'Tổng hợp Task Actual', guard: 'Kiểm tra quyền', readonly: 'CEO/COO chỉ được xem/in; API ghi trả về 403.',
  },
};

export function DailyWorklogQaPage() {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [localDate, setLocalDate] = useState(dateInZone());
  const [context, setContext] = useState<any>(null);
  const [worklog, setWorklog] = useState<any>(null);
  const [actual, setActual] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ code: string; error?: boolean } | null>(null);
  const refreshSequence = useRef(0);
  const [form, setForm] = useState({ actual: 420, progress: 10, remaining: 480, result: 'Checkpoint 2 QA actual fact', gap: 'QA recording gap', overtime: 'QA overtime verification' });
  const lang = worker?.ui_language === 'vi' ? 'vi' : 'ko';
  const t = labels[lang];

  useEffect(() => {
    api.getWorkers().then((workers) => {
      const id = getCurrentWorkerId();
      setWorker(workers.find((item) => item.id === id || item.name === id) || workers.find((item) => item.access_role === 'EDITOR') || workers[0] || null);
    }).catch((error) => setMessage({ code: error.code || error.message, error: true }));
  }, []);

  const refresh = async (selected = worker, date = localDate) => {
    if (!selected) return;
    const sequence = ++refreshSequence.current;
    setBusy(true);
    try {
      const next = await api.getWorklogContext(selected.id, date);
      if (sequence !== refreshSequence.current) return;
      setContext(next);
      if (next.worklog?.id) {
        const full = await api.getWorklog(next.worklog.id);
        if (sequence !== refreshSequence.current) return;
        setWorklog(full);
        const taskId = next.scheduled_tasks?.[0]?.task_id;
        const taskActual = taskId ? await api.getTaskActual(taskId) : null;
        if (sequence !== refreshSequence.current) return;
        setActual(taskActual);
        setForm((previous) => ({
          ...previous,
          actual: Number(next.worklog.actual_recorded_minutes ?? previous.actual),
          progress: Number(taskActual?.aggregate?.current_progress ?? previous.progress),
          remaining: Number(taskActual?.aggregate?.remaining_estimated_minutes ?? previous.remaining),
        }));
      } else {
        setWorklog(null); setActual(null);
      }
      setMessage(null);
    } catch (error: any) {
      if (sequence !== refreshSequence.current) return;
      setMessage({ code: error.code || error.message, error: true });
    } finally {
      if (sequence === refreshSequence.current) setBusy(false);
    }
  };

  useEffect(() => { if (worker) refresh(worker, localDate); }, [worker, localDate]);
  const task = context?.scheduled_tasks?.[0];
  const role = task?.assignment_role || 'UNASSIGNED';
  const isReadOnly = context?.permissions?.is_read_only;
  const canProgress = role === 'PRIMARY';
  const capacity = Number(context?.capacity?.effective_capacity_minutes || 0);
  const variance = Number(form.actual) - capacity;
  const gap = variance < -30;
  const overtime = variance > 0;

  const commonEntry = useMemo(() => ({
    project_id: task?.project_id, task_id: task?.task_id, assignment_id: task?.assignment_id,
    work_category: 'NORMAL_ASSIGNED_TASK', actual_minutes: Number(form.actual), work_result: form.result,
    ...(canProgress ? { progress_after: Number(form.progress), remaining_estimated_minutes: Number(form.remaining), completion_reported: Number(form.progress) === 100 } : {}),
  }), [task, form, canProgress]);

  const submitMorning = async () => {
    if (!worker || !task) return;
    setBusy(true);
    try {
      const result = await api.submitMorning({ employee_id: worker.id, local_work_date: localDate, entries: [{
        project_id: task.project_id, task_id: task.task_id, assignment_id: task.assignment_id,
        work_category: 'NORMAL_ASSIGNED_TASK', planned_minutes: 60, target_progress: Number(form.progress), expected_deliverable: form.result,
      }] });
      setMessage({ code: `MORNING_WORKLOG_API_PASS · ${result.status}` }); await refresh();
    } catch (error: any) { setMessage({ code: error.code || error.message, error: true }); setBusy(false); }
  };

  const submitEod = async () => {
    if (!worker || !task) return;
    setBusy(true);
    try {
      const id = context?.worklog?.id || 'new';
      const result = await api.submitEod(id, {
        employee_id: worker.id, local_work_date: localDate, entries: [commonEntry],
        ...(gap ? { gap_reason_code: 'RECORDING_OMISSION', gap_reason_text: form.gap } : {}),
        ...(overtime ? { overtime_reason: form.overtime, overtime_evidence: { source: 'QA_HARNESS', task_id: task.task_id } } : {}),
      });
      setMessage({ code: `EOD_WORKLOG_API_PASS · ${result.status}` }); await refresh();
    } catch (error: any) { setMessage({ code: error.code || error.message, error: true }); setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900" data-testid="daily-worklog-qa-page">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3"><Link to="/projects" className="rounded-lg border p-2"><ArrowLeft className="h-4 w-4" /></Link><div><h1 className="font-black">{t.title}</h1><p className="text-xs text-slate-500">{t.subtitle}</p></div></div>
          <div className="flex items-center gap-2"><TestActorModeBadge /><WorkerSelector currentWorker={worker} onWorkerChange={(next) => { setMessage(null); setWorker(next); setLocalDate(dateInZone(next.country_code === 'VN' ? 'Asia/Ho_Chi_Minh' : 'Asia/Seoul')); }} /></div>
        </div>
      </header>
      <section className="mx-auto max-w-[1500px] space-y-4 p-6">
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">Checkpoint 2: Actual / Capacity Foundation · Forecast 일정은 아직 재산정되지 않습니다.</div>
        {message && <div data-testid="qa-result" className={`rounded-xl border px-4 py-3 font-mono text-sm font-bold ${message.error ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>{message.code}</div>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Card label={t.actor} value={worker?.name || '-'} testId="qa-actor" />
          <label className="rounded-xl border bg-white p-4 text-xs font-bold text-slate-500">{t.date}<input data-testid="qa-local-date" type="date" value={localDate} onChange={(event) => setLocalDate(event.target.value)} className="mt-2 w-full rounded-lg border px-2 py-2 text-sm text-slate-900" /></label>
          <Card label={t.office} value={`${context?.capacity?.office_code || '-'} · ${context?.capacity?.timezone || '-'}`} testId="qa-office" />
          <Card label="Work / Lunch" value={`${context?.capacity?.work_start_local || '-'}–${context?.capacity?.work_end_local || '-'} · ${context?.capacity?.lunch_start_local || '-'}–${context?.capacity?.lunch_end_local || '-'}`} testId="qa-hours" />
          <Card label={t.capacity} value={`${capacity} min`} testId="qa-capacity" />
          <Card label={t.revision} value={String(context?.worklog?.current_revision_number || 0)} testId="qa-revision" />
        </div>
        {isReadOnly && <div data-testid="qa-readonly-guard" className="flex items-center gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm font-bold text-rose-800"><ShieldAlert className="h-5 w-5" />{t.readonly}</div>}
        <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold text-slate-500">{t.task}</p><h2 className="font-black">{task?.project_name || '-'} · {task?.task_name || '-'}</h2></div><span data-testid="qa-assignment-role" className={`rounded-full px-3 py-1 text-xs font-black ${canProgress ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>{t.role}: {role}</span></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label={t.actual} value={form.actual} onChange={(value) => setForm({ ...form, actual: Number(value) })} testId="qa-actual" />
              <Field label={t.progress} value={form.progress} disabled={!canProgress} onChange={(value) => setForm({ ...form, progress: Number(value) })} testId="qa-progress" />
              <Field label={t.remaining} value={form.remaining} disabled={!canProgress} onChange={(value) => setForm({ ...form, remaining: Number(value) })} testId="qa-remaining" />
              <label className="text-xs font-bold text-slate-500">{t.result}<input value={form.result} onChange={(event) => setForm({ ...form, result: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900" /></label>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-xs font-bold text-slate-500">{t.gap}<input value={form.gap} onChange={(event) => setForm({ ...form, gap: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900" /></label><label className="text-xs font-bold text-slate-500">{t.overtime}<input value={form.overtime} onChange={(event) => setForm({ ...form, overtime: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900" /></label></div>
            <div className="mt-4 flex flex-wrap items-center gap-2"><button data-testid="qa-submit-morning" disabled={busy || isReadOnly || !task} onClick={submitMorning} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">{t.morning}</button><button data-testid="qa-submit-eod" disabled={busy || isReadOnly || !task} onClick={submitEod} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">{t.eod}</button><span data-testid="qa-variance" className={`rounded-lg px-3 py-2 text-xs font-bold ${gap ? 'bg-amber-100 text-amber-800' : overtime ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>Variance {variance > 0 ? '+' : ''}{variance} · {gap ? 'GAP_REASON_REQUIRED' : overtime ? 'PENDING_REVIEW' : 'NORMAL_RANGE'}</span></div>
            <div data-testid="qa-stored-fact" className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
              <StoredMetric label="Stored status" value={context?.worklog?.status || 'NOT_CREATED'} />
              <StoredMetric label="Stored Actual" value={`${Number(context?.worklog?.actual_recorded_minutes || 0)} min`} />
              <StoredMetric label="Stored Capacity" value={`${Number(context?.worklog?.capacity_minutes ?? capacity)} min`} />
              <StoredMetric label="Gap" value={Number(context?.worklog?.has_gap) === 1 ? `${context?.worklog?.gap_reason_code || 'REASON_RECORDED'}` : 'NONE'} />
              <StoredMetric label="Overtime" value={Number(context?.worklog?.overtime_candidate_minutes || 0) > 0 ? `${context.worklog.overtime_candidate_minutes} min · ${context.worklog.overtime_approval_status}` : 'NONE'} />
            </div>
          </div>
          <div className="space-y-4">
            <Panel icon={<Database className="h-4 w-4" />} title={t.aggregate} testId="qa-aggregate"><pre>{JSON.stringify(actual?.aggregate || {}, null, 2)}</pre></Panel>
            <Panel icon={<Clock3 className="h-4 w-4" />} title={t.audit} testId="qa-audit"><div className="space-y-1">{(worklog?.audit_events || []).slice(-4).map((event: any) => <div key={event.id} className="rounded bg-slate-50 p-2 text-xs"><b>{event.event_type}</b> · {event.event_time_utc}</div>)}{!worklog?.audit_events?.length && <p className="text-xs text-slate-500">No audit events</p>}</div></Panel>
            <Panel icon={isReadOnly ? <ShieldAlert className="h-4 w-4" /> : canProgress ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />} title={t.guard} testId="qa-role-guard"><p className="text-xs font-bold">{isReadOnly ? 'WORKLOG_READ_ONLY_ACTOR (HTTP 403)' : canProgress ? 'PRIMARY_PROGRESS_ALLOWED' : 'SUPPORT_PROGRESS_FORBIDDEN'}</p></Panel>
          </div>
        </div>
      </section>
    </main>
  );
}

function Card({ label, value, testId }: { label: string; value: string; testId: string }) { return <div data-testid={testId} className="rounded-xl border bg-white p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 break-words text-sm font-black">{value}</p></div>; }
function Field({ label, value, onChange, disabled, testId }: { label: string; value: number; onChange: (value: string) => void; disabled?: boolean; testId: string }) { return <label className="text-xs font-bold text-slate-500">{label}<input data-testid={testId} type="number" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" /></label>; }
function Panel({ icon, title, children, testId }: React.PropsWithChildren<{ icon: React.ReactNode; title: string; testId: string }>) { return <div data-testid={testId} className="rounded-xl border bg-white p-4 shadow-sm"><h3 className="mb-3 flex items-center gap-2 text-sm font-black">{icon}{title}</h3><div className="max-h-48 overflow-auto text-[10px]">{children}</div></div>; }
function StoredMetric({ label, value }: { label: string; value: string }) { return <div><p className="font-bold text-slate-500">{label}</p><p className="mt-1 break-words font-black text-slate-900">{value}</p></div>; }

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

type Draft = { actual: number; progress: number; remaining: number; result: string; gap: string; overtime: string; category: string };
const draftDefaults = (capacity = 0): Draft => ({
  actual: capacity, progress: 0, remaining: 0, result: '', gap: '', overtime: '', category: 'COMPANY_DUTY',
});

const labels = {
  ko: {
    title: '일일 업무기록 API 검증', subtitle: 'Checkpoint 2.1 · Actual / Capacity 정합성',
    qa: 'QA HARNESS', notUi: '검증용 화면이며 최종 직원 업무일지 UI가 아닙니다.',
    notice: 'Checkpoint 2: Actual / Capacity 기반 · Forecast 일정은 아직 자동 재산정되지 않습니다.',
    actor: '인증된 테스트 행위자', date: '직원 현지 업무일', office: '오피스 정책', workLunch: '근무 / 점심', capacity: '유효 Capacity',
    task: '배정 작업', noTask: '배정 작업이 선택되지 않았습니다.', role: '역할', draft: '제출 예정 입력값', stored: '현재 저장된 유효 업무일지',
    morning: '오전 계획 제출', eod: 'EOD Actual 제출', actual: '입력 Actual', progress: '입력 공정률', remaining: '입력 잔여 예상', result: '업무 결과',
    category: '비Task 업무 유형', gap: '부족시간 사유', overtime: '초과근무 사유', preview: '제출 전 예상 상태',
    revision: '현재 유효 Revision', aggregate: 'Task Actual 집계', audit: '감사 이벤트', guard: '권한 검증',
    worklogId: '업무일지 ID', effectiveRevision: '유효 Revision', storedStatus: '저장 상태', storedActual: '저장 Actual',
    storedProgress: '저장 공정률', storedRemaining: '저장 잔여 예상', storedCapacity: '저장 Capacity', storedGap: '저장 부족시간',
    storedOvertime: '저장 초과근무', lastUpdated: '최종 갱신', updatedBy: '갱신자', changeType: '변경 유형',
    readonly: 'CEO/COO는 조회·출력만 가능하며 일반 제출 버튼은 제공되지 않습니다.', verify403: '쓰기 API 403 검증',
    support: '지원 담당자는 실제시간과 수행내용만 입력할 수 있습니다.', emptyAggregate: '배정 작업이 없어 Task Actual 집계 대상이 없습니다.',
    loading: '현재 Context를 불러오는 중입니다.',
  },
  vi: {
    title: 'Kiểm thử API nhật ký công việc', subtitle: 'Checkpoint 2.1 · Tính nhất quán Actual / Capacity',
    qa: 'QA HARNESS', notUi: 'Đây là màn hình kiểm thử, không phải giao diện nhật ký công việc chính thức.',
    notice: 'Checkpoint 2: Nền tảng Actual / Capacity · Lịch Forecast chưa được tự động tính toán lại.',
    actor: 'Test Actor đã xác thực', date: 'Ngày làm việc địa phương', office: 'Chính sách văn phòng', workLunch: 'Giờ làm / Nghỉ trưa', capacity: 'Capacity hiệu lực',
    task: 'Công việc được giao', noTask: 'Chưa chọn công việc được giao.', role: 'Vai trò', draft: 'Dữ liệu dự kiến gửi', stored: 'Nhật ký công việc hiệu lực hiện tại',
    morning: 'Gửi kế hoạch buổi sáng', eod: 'Gửi Actual cuối ngày', actual: 'Actual nhập', progress: 'Tiến độ nhập', remaining: 'Thời gian còn lại nhập', result: 'Kết quả công việc',
    category: 'Loại công việc không gắn Task', gap: 'Lý do thiếu giờ', overtime: 'Lý do tăng ca', preview: 'Trạng thái dự kiến trước khi gửi',
    revision: 'Revision hiệu lực hiện tại', aggregate: 'Tổng hợp Task Actual', audit: 'Sự kiện audit', guard: 'Kiểm tra quyền',
    worklogId: 'ID nhật ký', effectiveRevision: 'Revision hiệu lực', storedStatus: 'Trạng thái đã lưu', storedActual: 'Thời gian thực tế đã lưu',
    storedProgress: 'Tiến độ đã lưu', storedRemaining: 'Thời gian còn lại đã lưu', storedCapacity: 'Capacity đã lưu', storedGap: 'Thiếu giờ đã lưu',
    storedOvertime: 'Tăng ca đã lưu', lastUpdated: 'Cập nhật gần nhất', updatedBy: 'Người cập nhật', changeType: 'Loại thay đổi',
    readonly: 'CEO/COO chỉ được xem/in; các nút gửi thông thường không được hiển thị.', verify403: 'Kiểm thử API ghi 403',
    support: 'Nhân sự hỗ trợ chỉ có thể nhập thời gian thực tế và nội dung công việc.', emptyAggregate: 'Không có công việc được giao để tổng hợp Task Actual.',
    loading: 'Đang tải Context hiện tại.',
  },
};

const roleCode = (raw: string | undefined, readOnly: boolean, manager: boolean) => {
  if (readOnly) return 'READ_ONLY_EXECUTIVE';
  if (manager) return 'MANAGER';
  if (raw === 'PRIMARY') return 'PRIMARY';
  if (raw === 'CO_ASSIGNEE') return 'SUPPORT';
  return 'UNASSIGNED';
};

const roleLabel = (code: string, lang: 'ko' | 'vi') => ({
  ko: { PRIMARY: '주 담당', SUPPORT: '지원 담당', UNASSIGNED: '미배정', TEMPORARY_PRIMARY: '임시 주 담당', MANAGER: '관리자', READ_ONLY_EXECUTIVE: '조회 전용' },
  vi: { PRIMARY: 'Phụ trách chính', SUPPORT: 'Hỗ trợ', UNASSIGNED: 'Chưa phân công', TEMPORARY_PRIMARY: 'Phụ trách chính tạm thời', MANAGER: 'Quản lý', READ_ONLY_EXECUTIVE: 'Chỉ xem' },
}[lang] as Record<string, string>)[code] || code;

export function DailyWorklogQaPage() {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [localDate, setLocalDate] = useState(dateInZone());
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [context, setContext] = useState<any>(null);
  const [worklog, setWorklog] = useState<any>(null);
  const [actual, setActual] = useState<any>(null);
  const [draft, setDraft] = useState<Draft>(draftDefaults());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ code: string; error?: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestSequence = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const lang: 'ko' | 'vi' = worker?.ui_language === 'vi' ? 'vi' : 'ko';
  const t = labels[lang];

  useEffect(() => {
    api.getWorkers().then((workers) => {
      const id = getCurrentWorkerId();
      setWorker(workers.find((item) => item.id === id || item.name === id) || workers.find((item) => item.access_role === 'EDITOR') || workers[0] || null);
    }).catch((error) => setMessage({ code: error.code || error.message, error: true }));
  }, []);

  const clearContext = () => {
    abortRef.current?.abort();
    requestSequence.current += 1;
    setContext(null); setWorklog(null); setActual(null); setSelectedTaskId(''); setMessage(null);
  };

  useEffect(() => {
    if (!worker) return;
    const sequence = ++requestSequence.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true); setContext(null); setWorklog(null); setActual(null); setSelectedTaskId('');
    api.getWorklogContext(worker.id, localDate, controller.signal).then(async (next) => {
      if (sequence !== requestSequence.current) return;
      const firstTaskId = next.scheduled_tasks?.[0]?.task_id || '';
      const [full, taskActual] = await Promise.all([
        next.worklog?.id ? api.getWorklog(next.worklog.id, controller.signal) : Promise.resolve(null),
        firstTaskId ? api.getTaskActual(firstTaskId, controller.signal) : Promise.resolve(null),
      ]);
      if (sequence !== requestSequence.current) return;
      setContext(next); setWorklog(full); setActual(taskActual); setSelectedTaskId(firstTaskId);
      setDraft(draftDefaults(Number(next.capacity?.effective_capacity_minutes || 0)));
    }).catch((error: any) => {
      if (error?.name !== 'AbortError' && sequence === requestSequence.current) setMessage({ code: error.code || error.message, error: true });
    }).finally(() => { if (sequence === requestSequence.current) setBusy(false); });
    return () => controller.abort();
  }, [worker, localDate, reloadKey]);

  useEffect(() => {
    if (!selectedTaskId || !context) return;
    const sequence = ++requestSequence.current;
    abortRef.current?.abort();
    const controller = new AbortController(); abortRef.current = controller; setBusy(true); setActual(null); setMessage(null);
    api.getTaskActual(selectedTaskId, controller.signal).then((result) => {
      if (sequence === requestSequence.current) setActual(result);
    }).catch((error: any) => {
      if (error?.name !== 'AbortError' && sequence === requestSequence.current) setMessage({ code: error.code || error.message, error: true });
    }).finally(() => { if (sequence === requestSequence.current) setBusy(false); });
    return () => controller.abort();
  }, [selectedTaskId]);

  const task = context?.scheduled_tasks?.find((item: any) => item.task_id === selectedTaskId) || null;
  const isReadOnly = Boolean(context?.permissions?.is_read_only);
  const stableRole = roleCode(task?.assignment_role, isReadOnly, Boolean(context?.actor?.is_manager && !task));
  const canProgress = stableRole === 'PRIMARY';
  const isSupport = stableRole === 'SUPPORT';
  const capacity = Number(context?.capacity?.effective_capacity_minutes || 0);
  const variance = Number(draft.actual) - capacity;
  const gap = variance < -30;
  const overtime = variance > 0;
  const effectiveRevision = worklog?.revisions?.find((row: any) => row.id === worklog?.effective_revision_id) || null;
  const effectiveEntries = (worklog?.entries || []).filter((row: any) => row.revision_id === worklog?.effective_revision_id);
  const effectiveTaskEntry = selectedTaskId ? effectiveEntries.find((row: any) => row.task_id === selectedTaskId) || null : null;
  const contextKey = [worker?.id, localDate, selectedTaskId || 'NO_TASK', worklog?.id || 'NO_WORKLOG', worklog?.effective_revision_id || 'NO_REVISION'].join('::');
  const canSubmit = Boolean(worker && !isReadOnly && !busy);

  const entry = useMemo(() => task ? {
    project_id: task.project_id, task_id: task.task_id, assignment_id: task.assignment_id,
    work_category: 'NORMAL_ASSIGNED_TASK', actual_minutes: Number(draft.actual), work_result: draft.result,
    ...(canProgress ? { progress_after: Number(draft.progress), remaining_estimated_minutes: Number(draft.remaining), completion_reported: Number(draft.progress) === 100 } : {}),
  } : { work_category: draft.category, actual_minutes: Number(draft.actual), work_result: draft.result }, [task, draft, canProgress]);

  const refreshCurrent = () => setReloadKey((value) => value + 1);
  const submitMorning = async () => {
    if (!worker) return; setBusy(true); setMessage(null);
    try {
      const morningEntry = task ? {
        project_id: task.project_id, task_id: task.task_id, assignment_id: task.assignment_id,
        work_category: 'NORMAL_ASSIGNED_TASK', planned_minutes: 60, target_progress: canProgress ? Number(draft.progress) : undefined, expected_deliverable: draft.result,
      } : { work_category: draft.category, planned_minutes: 60, memo: draft.result };
      const result = await api.submitMorning({ employee_id: worker.id, local_work_date: localDate, entries: [morningEntry] });
      setMessage({ code: `MORNING_WORKLOG_API_PASS · ${result.status}` }); refreshCurrent();
    } catch (error: any) { setMessage({ code: error.code || error.message, error: true }); } finally { setBusy(false); }
  };
  const submitEod = async () => {
    if (!worker) return; setBusy(true); setMessage(null);
    try {
      const result = await api.submitEod(context?.worklog?.id || 'new', {
        employee_id: worker.id, local_work_date: localDate, entries: [entry],
        ...(gap ? { gap_reason_code: 'RECORDING_OMISSION', gap_reason_text: draft.gap } : {}),
        ...(overtime ? { overtime_reason: draft.overtime, overtime_evidence: { source: 'QA_HARNESS', task_id: task?.task_id || null } } : {}),
      });
      setMessage({ code: `EOD_WORKLOG_API_PASS · ${result.status}` }); refreshCurrent();
    } catch (error: any) { setMessage({ code: error.code || error.message, error: true }); } finally { setBusy(false); }
  };
  const verify403 = async () => {
    if (!worker) return; setBusy(true);
    const result = await api.verifyExecutiveWorklogGuard(worker.id, localDate);
    setMessage({ code: `${result.code} · HTTP ${result.status}`, error: result.status !== 403 || result.code !== 'WORKLOG_READ_ONLY_ACTOR' });
    setBusy(false);
  };

  return <main className="min-h-screen bg-slate-100 text-slate-900" data-testid="daily-worklog-qa-page" data-context-key={contextKey}>
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-6 py-3">
      <div className="flex items-center gap-3"><Link to="/projects" className="rounded-lg border p-2"><ArrowLeft className="h-4 w-4" /></Link><div><div className="mb-1 flex items-center gap-2"><span className="rounded bg-slate-900 px-2 py-0.5 text-[10px] font-black text-white">{t.qa}</span><span className="text-[10px] font-bold text-slate-500">{t.notUi}</span></div><h1 className="font-black">{t.title}</h1><p className="text-xs text-slate-500">{t.subtitle}</p></div></div>
      <div className="flex items-center gap-2"><TestActorModeBadge /><WorkerSelector currentWorker={worker} onWorkerChange={(next) => { clearContext(); setWorker(next); setLocalDate(dateInZone(next.country_code === 'VN' ? 'Asia/Ho_Chi_Minh' : 'Asia/Seoul')); }} /></div>
    </div></header>
    <section className="mx-auto max-w-[1500px] space-y-4 p-6">
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{t.notice}</div>
      {message && <div data-testid="qa-result" className={`rounded-xl border px-4 py-3 font-mono text-sm font-bold ${message.error ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>{message.code}</div>}
      {busy && !context && <div data-testid="qa-loading" className="rounded-xl border bg-white p-4 text-sm font-bold text-slate-500">{t.loading}</div>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Card label={t.actor} value={worker?.name || '-'} testId="qa-actor" />
        <label className="rounded-xl border bg-white p-4 text-xs font-bold text-slate-500">{t.date}<input data-testid="qa-local-date" type="date" value={localDate} onChange={(event) => { clearContext(); setLocalDate(event.target.value); }} className="mt-2 w-full rounded-lg border px-2 py-2 text-sm text-slate-900" /></label>
        <Card label={t.office} value={`${context?.capacity?.office_code || '-'} · ${context?.capacity?.timezone || '-'}`} testId="qa-office" />
        <Card label={t.workLunch} value={`${context?.capacity?.work_start_local || '-'}–${context?.capacity?.work_end_local || '-'} · ${context?.capacity?.lunch_start_local || '-'}–${context?.capacity?.lunch_end_local || '-'}`} testId="qa-hours" />
        <Card label={t.capacity} value={`${capacity} min`} testId="qa-capacity" />
        <Card label={t.revision} value={worklog ? `${worklog.effective_revision_number || 0} · ${worklog.revision_integrity}` : '0 · N/A'} testId="qa-revision" />
      </div>
      {isReadOnly && <div data-testid="qa-readonly-guard" className="flex items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm font-bold text-rose-800"><span className="flex items-center gap-3"><ShieldAlert className="h-5 w-5" />{t.readonly}</span><button data-testid="qa-verify-403" onClick={verify403} disabled={busy} className="rounded-lg border border-rose-400 bg-white px-4 py-2 text-xs font-black disabled:opacity-40">{t.verify403}</button></div>}
      <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-4">
          <section data-testid="qa-draft" className="rounded-xl border-2 border-sky-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-sm font-black text-sky-800">{t.draft}</h2><p className="mb-4 text-xs text-slate-500">Context: {contextKey}</p>
            <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]"><label className="text-xs font-bold text-slate-500">{t.task}<select data-testid="qa-task-select" value={selectedTaskId} onChange={(event) => { setSelectedTaskId(event.target.value); setActual(null); setMessage(null); }} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900"><option value="">{t.noTask}</option>{(context?.scheduled_tasks || []).map((item: any) => <option key={item.task_id} value={item.task_id}>{item.project_name} · {item.task_name}</option>)}</select></label><span data-testid="qa-assignment-role" className="self-end rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">{t.role}: {roleLabel(stableRole, lang)} ({stableRole})</span></div>
            {!task && <label className="mb-3 block text-xs font-bold text-slate-500">{t.category}<select data-testid="qa-category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"><option value="COMPANY_DUTY">COMPANY_DUTY</option><option value="TRAINING">TRAINING</option><option value="ADMINISTRATION">ADMINISTRATION</option><option value="INTERNAL_COMMUNICATION">INTERNAL_COMMUNICATION</option><option value="MEETING">MEETING</option></select></label>}
            {isSupport && <div data-testid="qa-support-notice" className="mb-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs font-bold text-violet-800">{t.support}</div>}
            <div className={`grid gap-3 ${canProgress ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2'}`}><Field label={t.actual} value={draft.actual} onChange={(value) => setDraft({ ...draft, actual: Number(value) })} testId="qa-actual" />{canProgress && <><Field label={t.progress} value={draft.progress} onChange={(value) => setDraft({ ...draft, progress: Number(value) })} testId="qa-progress" /><Field label={t.remaining} value={draft.remaining} onChange={(value) => setDraft({ ...draft, remaining: Number(value) })} testId="qa-remaining" /></>}<label className="text-xs font-bold text-slate-500">{t.result}<input data-testid="qa-result-input" value={draft.result} onChange={(e) => setDraft({ ...draft, result: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900" /></label></div>
            <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-xs font-bold text-slate-500">{t.gap}<input value={draft.gap} onChange={(e) => setDraft({ ...draft, gap: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label><label className="text-xs font-bold text-slate-500">{t.overtime}<input value={draft.overtime} onChange={(e) => setDraft({ ...draft, overtime: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label></div>
            {!isReadOnly && <div className="mt-4 flex flex-wrap items-center gap-2"><button data-testid="qa-submit-morning" disabled={!canSubmit} onClick={submitMorning} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">{t.morning}</button><button data-testid="qa-submit-eod" disabled={!canSubmit} onClick={submitEod} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">{t.eod}</button><span data-testid="qa-variance" className={`rounded-lg px-3 py-2 text-xs font-bold ${gap ? 'bg-amber-100 text-amber-800' : overtime ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>{t.preview}: {variance > 0 ? '+' : ''}{variance} · {gap ? 'GAP_REASON_REQUIRED' : overtime ? 'PENDING_REVIEW' : 'NORMAL_RANGE'}</span></div>}
          </section>
          <section data-testid="qa-stored-fact" className="rounded-xl border-2 border-slate-300 bg-white p-5 shadow-sm"><h2 className="mb-4 text-sm font-black">{t.stored}</h2><div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4"><StoredMetric label={t.worklogId} value={worklog?.id || '-'} /><StoredMetric label={t.effectiveRevision} value={worklog ? `${worklog.effective_revision_number} · ${worklog.effective_revision_id}` : '-'} /><StoredMetric label={t.storedStatus} value={worklog?.effective_status || 'NOT_CREATED'} /><StoredMetric label={t.storedActual} value={`${Number(worklog?.actual_recorded_minutes || 0)} min`} /><StoredMetric label={t.storedProgress} value={effectiveTaskEntry?.progress_after == null ? '-' : `${effectiveTaskEntry.progress_after}%`} /><StoredMetric label={t.storedRemaining} value={effectiveTaskEntry?.remaining_estimated_minutes == null ? '-' : `${effectiveTaskEntry.remaining_estimated_minutes} min`} /><StoredMetric label={t.storedCapacity} value={`${Number(worklog?.capacity_minutes ?? capacity)} min`} /><StoredMetric label={t.storedGap} value={Number(worklog?.has_gap) === 1 ? worklog?.gap_reason_code : 'NONE'} /><StoredMetric label={t.storedOvertime} value={Number(worklog?.overtime_candidate_minutes || 0) > 0 ? `${worklog.overtime_candidate_minutes} min · ${worklog.overtime_approval_status}` : 'NONE'} /><StoredMetric label={t.lastUpdated} value={effectiveRevision?.created_at || '-'} /><StoredMetric label={t.updatedBy} value={effectiveRevision?.created_by_employee_id || '-'} /><StoredMetric label={t.changeType} value={worklog?.effective_change_type || '-'} /></div></section>
        </div>
        <div className="space-y-4">
          <Panel icon={<Database className="h-4 w-4" />} title={t.aggregate} testId="qa-aggregate">{task ? <dl className="grid grid-cols-2 gap-2 text-xs">{Object.entries(actual?.taskActual || {}).map(([key, value]) => <React.Fragment key={key}><dt className="font-bold text-slate-500">{key}</dt><dd className="break-all font-mono">{String(value ?? '-')}</dd></React.Fragment>)}</dl> : <p data-testid="qa-aggregate-empty" className="text-xs text-slate-500">{t.emptyAggregate}</p>}</Panel>
          <Panel icon={<Clock3 className="h-4 w-4" />} title={t.audit} testId="qa-audit"><div className="space-y-1">{(worklog?.audit_events || []).map((event: any) => <div key={event.id} data-worklog-id={event.worklog_id} className="rounded bg-slate-50 p-2 text-xs"><b>Revision {event.revision_number ?? '-'} · {event.event_type}</b><div className="text-[10px] text-slate-500">{event.actor_user_id || '-'} → {event.subject_employee_id} · {event.local_work_date} · {event.event_time_utc}</div></div>)}{!worklog?.audit_events?.length && <p className="text-xs text-slate-500">No audit events</p>}</div></Panel>
          <Panel icon={isReadOnly ? <ShieldAlert className="h-4 w-4" /> : canProgress ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />} title={t.guard} testId="qa-role-guard"><p className="text-xs font-bold">{isReadOnly ? 'WORKLOG_READ_ONLY_ACTOR' : canProgress ? 'PRIMARY_PROGRESS_ALLOWED' : isSupport ? 'SUPPORT_PROGRESS_FORBIDDEN' : 'UNASSIGNED_TASK_WRITE_BLOCKED'}</p></Panel>
        </div>
      </div>
    </section>
  </main>;
}

function Card({ label, value, testId }: { label: string; value: string; testId: string }) { return <div data-testid={testId} className="rounded-xl border bg-white p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 break-words text-sm font-black">{value}</p></div>; }
function Field({ label, value, onChange, testId }: { label: string; value: number; onChange: (value: string) => void; testId: string }) { return <label className="text-xs font-bold text-slate-500">{label}<input data-testid={testId} type="number" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900" /></label>; }
function Panel({ icon, title, children, testId }: React.PropsWithChildren<{ icon: React.ReactNode; title: string; testId: string }>) { return <div data-testid={testId} className="rounded-xl border bg-white p-4 shadow-sm"><h3 className="mb-3 flex items-center gap-2 text-sm font-black">{icon}{title}</h3><div className="max-h-72 overflow-auto">{children}</div></div>; }
function StoredMetric({ label, value }: { label: string; value: string }) { return <div><p className="font-bold text-slate-500">{label}</p><p className="mt-1 break-words font-black text-slate-900">{value}</p></div>; }

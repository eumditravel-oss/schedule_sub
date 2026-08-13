import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ClipboardCheck, Plus, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import { api, getCurrentWorkerId, setCurrentWorker } from '../services/api';
import { useI18n } from '../hooks/useI18n';
import { setStoredLanguage } from '../i18n';
import type { Worker } from '../types';
import { WorklogEntryCard } from '../components/worklog/WorklogEntryCard';
import { WorklogStatusCard } from '../components/worklog/WorklogStatusCard';
import { WorklogSubmitReview } from '../components/worklog/WorklogSubmitReview';
import { ScheduleImpactResult } from '../components/worklog/ScheduleImpactResult';
import { RecentWorklogs, WorklogRevisionHistory } from '../components/worklog/RecentWorklogs';
import {
  GAP_CODES, categoryLabel, gapLabel, isPrimary, needsMeetingRecord, newEntry, type WorklogEntryDraft,
  type WorklogLanguage, type WorklogMode, type WorklogTask, worklogText,
} from '../components/worklog/worklogUi';

interface WorklogTodayPageProps { initialView?: 'TODAY' | 'HISTORY'; }

const draftKey = (workerId: string, date: string, mode: WorklogMode) => `worklog-draft:v1:${workerId}:${date}:${mode}`;
const idempotencyKey = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `worklog-${Date.now()}-${Math.random()}`;

function localDateFor(timeZone = 'Asia/Seoul') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '01';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function errorText(error: any, language: WorklogLanguage) {
  const fallback = language === 'vi' ? 'Không thể xử lý yêu cầu. Vui lòng thử lại.' : '요청을 처리할 수 없습니다. 다시 시도해 주세요.';
  const messages: Record<string, [string, string]> = {
    INVALID_TIME_INCREMENT: ['시간은 30분 단위로 입력해 주세요.', 'Thời gian phải theo đơn vị 30 phút.'],
    PRIMARY_PROGRESS_REQUIRED: ['주 담당자는 공정률, 남은 예상시간, 수행내용을 입력해 주세요.', 'Người phụ trách chính phải nhập tiến độ, thời gian còn lại và nội dung thực hiện.'],
    GAP_REASON_REQUIRED: ['미기록 시간의 사유와 상세 내용을 입력해 주세요.', 'Hãy nhập lý do và chi tiết thời gian chưa ghi nhận.'],
    OVERTIME_REASON_REQUIRED: ['초과근무 사유와 증빙 또는 설명을 입력해 주세요.', 'Hãy nhập lý do và bằng chứng hoặc mô tả làm thêm giờ.'],
    SUPPORT_PROGRESS_FORBIDDEN: ['지원 담당자는 공정률을 입력할 수 없습니다.', 'Người hỗ trợ không thể nhập tiến độ.'],
    PROGRESS_DECREASE_REQUIRES_CORRECTION: ['공정률을 낮추려면 수정 요청이 필요합니다.', 'Cần yêu cầu chỉnh sửa để giảm tiến độ.'],
    RETROACTIVE_REVIEW_REQUIRED: ['직접 수정 기한이 지났습니다. 수정 요청을 제출해 주세요.', 'Đã hết hạn tự chỉnh sửa. Hãy gửi yêu cầu chỉnh sửa.'],
    WORKLOG_READ_ONLY_ACTOR: ['조회 전용 사용자입니다.', 'Tài khoản chỉ có quyền xem.'],
    WORKLOG_PERMISSION_DENIED: ['권한이 없습니다.', 'Bạn không có quyền thực hiện thao tác này.'],
    MEETING_RECORD_REQUIRED: ['회의 목적과 시작·종료 시간을 입력해 주세요.', 'Hãy nhập mục đích và thời gian bắt đầu/kết thúc cuộc họp.'],
    LEAVE_LINK_REQUIRED: ['승인 휴가는 연결된 휴가 기록이 필요합니다.', 'Nghỉ phép đã duyệt cần liên kết với hồ sơ nghỉ phép.'],
  };
  const item = messages[error?.code];
  return item ? item[language === 'vi' ? 1 : 0] : error?.message || fallback;
}

function phaseEntries(worklog: any, phase: 'MORNING' | 'EOD', tasks: WorklogTask[]) {
  const revisionId = phase === 'MORNING' ? worklog?.current_morning_revision_id : worklog?.current_eod_revision_id;
  const entries = (worklog?.entries || []).filter((entry: any) => entry.phase === phase && entry.revision_id === revisionId);
  if (!entries.length) return tasks.map((task) => newEntry(task));
  return entries.map((entry: any) => ({
    ...newEntry({ task_id: entry.task_id, project_id: entry.project_id, task_name: entry.task_name, project_name: entry.project_name, assignment_id: entry.assignment_id, assignment_role: entry.assignment_role }),
    id: entry.id, taskId: entry.task_id || undefined, projectId: entry.project_id || undefined, assignmentId: entry.assignment_id || undefined,
    assignmentRole: entry.assignment_role || undefined, category: entry.work_category, plannedMinutes: Number(entry.planned_minutes || 0),
    actualMinutes: Number(entry.actual_minutes || 0), targetProgress: entry.target_progress ?? '', progressAfter: entry.progress_after ?? '',
    remainingMinutes: entry.remaining_estimated_minutes ?? '', completionReported: Number(entry.completion_reported) === 1,
    expectedDeliverable: entry.expected_deliverable || '', workResult: entry.work_result || '', deliverable: entry.deliverable || '', knownBlocker: entry.blocker || '',
  }));
}

function eodEntriesFromMorning(worklog: any, tasks: WorklogTask[]) {
  const morning = phaseEntries(worklog, 'MORNING', tasks);
  if (!morning.length) return tasks.map((task) => newEntry(task));
  return morning.map((entry: WorklogEntryDraft) => ({ ...entry, actualMinutes: 0, progressAfter: '', remainingMinutes: '', completionReported: false, workResult: '', deliverable: '', knownBlocker: '' }));
}

export function WorklogTodayPage({ initialView = 'TODAY' }: WorklogTodayPageProps) {
  const { lang, setLanguage } = useI18n();
  const [worklogLanguage, setWorklogLanguage] = useState<WorklogLanguage>(() => lang === 'vi' ? 'vi' : 'ko');
  const language: WorklogLanguage = worklogLanguage;
  const t = useCallback((key: string) => worklogText(language, key), [language]);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [actorId, setActorId] = useState(() => getCurrentWorkerId());
  const [subjectId, setSubjectId] = useState(() => searchParams.get('employeeId') || getCurrentWorkerId());
  const [localDate, setLocalDate] = useState(() => searchParams.get('date') || localDateFor());
  const [context, setContext] = useState<any>(null);
  const [taskActuals, setTaskActuals] = useState<Record<string, any>>({});
  const [morningEntries, setMorningEntries] = useState<WorklogEntryDraft[]>([]);
  const [eodEntries, setEodEntries] = useState<WorklogEntryDraft[]>([]);
  const [activeMode, setActiveMode] = useState<WorklogMode>('MORNING');
  const [view, setView] = useState<'TODAY' | 'HISTORY'>(initialView);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviewMode, setReviewMode] = useState<WorklogMode | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<any | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [impact, setImpact] = useState<any>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const requestSequence = useRef(0);
  const contextAbort = useRef<AbortController | null>(null);
  const historyAbort = useRef<AbortController | null>(null);
  const submitKeys = useRef<Record<WorklogMode | 'CORRECTION', string | null>>({ MORNING: null, EOD: null, CORRECTION: null });
  const hydratedDraftKey = useRef('');

  const worklog = context?.worklog || { status: 'NOT_CREATED', current_revision_number: 0 };
  const actorWorker = workers.find((worker) => worker.id === actorId) || null;
  const actorCanReadOthers = Boolean(actorWorker && (actorWorker.access_role === 'VIEWER' || Number(actorWorker.can_manage_country_calendar) === 1 || Number(actorWorker.can_manage_integrations) === 1));
  const scheduledTasks = (context?.scheduled_tasks || []) as WorklogTask[];
  const eligibleTasks = (context?.eligible_tasks || scheduledTasks) as WorklogTask[];
  const actorIsSubject = Boolean(context?.actor?.employee_id && context?.actor?.employee_id === context?.subject_employee_id);
  const canSubmit = Boolean(context?.permissions?.can_write_self && actorIsSubject && !context?.permissions?.is_read_only);
  const revisionDeadlinePassed = Boolean(worklog.current_eod_revision_id && worklog.self_edit_deadline_utc && Date.now() > Date.parse(worklog.self_edit_deadline_utc));
  const modeReadOnly = Boolean(!canSubmit || (activeMode === 'MORNING' && worklog.current_morning_revision_id) || (activeMode === 'EOD' && revisionDeadlinePassed));
  const capacity = Number(context?.capacity?.effective_capacity_minutes || 0);
  const entries = activeMode === 'MORNING' ? morningEntries : eodEntries;
  const leaveMinutes = activeMode === 'EOD'
    ? entries.filter((entry) => ['APPROVED_LEAVE', 'EMERGENCY_LEAVE'].includes(entry.category)).reduce((sum, entry) => sum + Number(entry.actualMinutes || 0), 0)
    : 0;
  const totalMinutes = entries.reduce((sum, entry) => sum + Number(activeMode === 'MORNING' ? entry.plannedMinutes : entry.actualMinutes || 0), 0);
  const recordedWorkMinutes = activeMode === 'EOD' ? Math.max(0, totalMinutes - leaveMinutes) : totalMinutes;
  const effectiveDisplayCapacity = activeMode === 'EOD' && capacity > 0 ? Math.max(0, capacity - leaveMinutes) : capacity;
  const gapMinutes = Math.max(0, effectiveDisplayCapacity - recordedWorkMinutes);
  const overtimeMinutes = Math.max(0, recordedWorkMinutes - effectiveDisplayCapacity);
  const draftDirty = Boolean(entries.some((entry) => Number(entry.plannedMinutes || 0) || Number(entry.actualMinutes || 0) || entry.workResult || entry.expectedDeliverable || entry.targetProgress || entry.progressAfter || entry.remainingMinutes));

  const refreshHistory = useCallback(async (employeeId: string, signal?: AbortSignal) => {
    if (!employeeId) return;
    setHistoryLoading(true);
    try { setHistory(await api.getWorklogs({ employee: employeeId }, signal)); } catch (err: any) { if (err?.name !== 'AbortError') setError(errorText(err, language)); } finally { setHistoryLoading(false); }
  }, [language]);

  const loadContext = useCallback(async (employeeId: string, date: string) => {
    if (!employeeId) { setLoading(false); return; }
    contextAbort.current?.abort();
    const controller = new AbortController();
    contextAbort.current = controller;
    const sequence = ++requestSequence.current;
    setLoading(true); setError(''); setNotice(''); setImpact(null); setTaskActuals({});
    try {
      const nextContext = await api.getWorklogContext(employeeId, date, controller.signal);
      if (controller.signal.aborted || sequence !== requestSequence.current) return;
      const tasks = nextContext.scheduled_tasks || [];
      const actualResults = await Promise.all(tasks.map((task: WorklogTask) => task.task_id ? api.getTaskActual(task.task_id, controller.signal).catch(() => null) : null));
      if (controller.signal.aborted || sequence !== requestSequence.current) return;
      const actualMap: Record<string, any> = {};
      tasks.forEach((task: WorklogTask, index: number) => { if (task.task_id && actualResults[index]) actualMap[task.task_id] = actualResults[index]?.aggregate || actualResults[index]?.taskActual || actualResults[index]; });
      setContext(nextContext); setTaskActuals(actualMap);
      setMorningEntries(phaseEntries(nextContext.worklog?.current_morning_revision_id ? nextContext.worklog : null, 'MORNING', tasks));
      setEodEntries(nextContext.worklog?.current_eod_revision_id
        ? phaseEntries(nextContext.worklog, 'EOD', tasks)
        : eodEntriesFromMorning(nextContext.worklog, tasks));
      setActiveMode(nextContext.worklog?.current_eod_revision_id ? 'EOD' : 'MORNING');
      historyAbort.current?.abort(); const historyController = new AbortController(); historyAbort.current = historyController;
      void refreshHistory(employeeId, historyController.signal);
    } catch (err: any) {
      if (err?.name !== 'AbortError' && sequence === requestSequence.current) setError(errorText(err, language));
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [language, refreshHistory]);

  useEffect(() => {
    api.getWorkers().then((items) => {
      setWorkers(items || []);
      const storedWorker = items.find((worker) => worker.id === actorId || worker.name === actorId);
      if (storedWorker && storedWorker.id !== actorId) {
        setCurrentWorker(storedWorker); setActorId(storedWorker.id); setSubjectId(storedWorker.id); return;
      }
      if (actorId || !items?.length) return;
      const defaultWorker = items.find((worker) => worker.access_role === 'EDITOR') || items[0];
      setCurrentWorker(defaultWorker); setActorId(defaultWorker.id); setSubjectId(defaultWorker.id);
    }).catch(() => undefined);
  }, [actorId]);
  useEffect(() => {
    const subjectLanguage = context?.subject?.ui_language;
    if (subjectLanguage !== 'ko' && subjectLanguage !== 'vi') return;
    setWorklogLanguage(subjectLanguage); setStoredLanguage(subjectLanguage); setLanguage(subjectLanguage);
  }, [context?.subject?.ui_language, setLanguage]);
  useEffect(() => { void loadContext(subjectId, localDate); return () => contextAbort.current?.abort(); }, [subjectId, localDate, loadContext]);
  useEffect(() => () => { historyAbort.current?.abort(); }, []);

  useEffect(() => {
    if (!subjectId || !context || hydratedDraftKey.current === `${subjectId}:${localDate}`) return;
    hydratedDraftKey.current = `${subjectId}:${localDate}`;
    (['MORNING', 'EOD'] as WorklogMode[]).forEach((mode) => {
      try {
        const raw = localStorage.getItem(draftKey(subjectId, localDate, mode));
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) mode === 'MORNING' ? setMorningEntries(parsed) : setEodEntries(parsed);
      } catch { /* Local drafts are optional and never block the server state. */ }
    });
  }, [subjectId, localDate, context]);

  useEffect(() => {
    if (!subjectId || !draftDirty || !canSubmit) return;
    try { localStorage.setItem(draftKey(subjectId, localDate, activeMode), JSON.stringify(entries)); } catch { /* storage may be unavailable */ }
  }, [activeMode, canSubmit, draftDirty, entries, localDate, subjectId]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (draftDirty && canSubmit) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [canSubmit, draftDirty]);

  const chooseActor = (id: string) => {
    const worker = workers.find((item) => item.id === id);
    if (!worker) return;
    setCurrentWorker(worker); setActorId(worker.id); chooseSubject(worker.id);
  };
  const chooseSubject = (id: string) => {
    requestSequence.current += 1; contextAbort.current?.abort(); historyAbort.current?.abort(); hydratedDraftKey.current = '';
    setSubjectId(id); setContext(null); setMorningEntries([]); setEodEntries([]); setSelectedHistory(null);
    const next = new URLSearchParams(searchParams); next.set('employeeId', id); next.set('date', localDate); setSearchParams(next, { replace: true });
  };
  const chooseDate = (date: string) => { setLocalDate(date); hydratedDraftKey.current = ''; const next = new URLSearchParams(searchParams); next.set('date', date); if (subjectId) next.set('employeeId', subjectId); setSearchParams(next, { replace: true }); };
  const replaceEntry = (mode: WorklogMode, updated: WorklogEntryDraft) => mode === 'MORNING' ? setMorningEntries((items) => items.map((item) => item.id === updated.id ? updated : item)) : setEodEntries((items) => items.map((item) => item.id === updated.id ? updated : item));
  const removeEntry = (mode: WorklogMode, id: string) => mode === 'MORNING' ? setMorningEntries((items) => items.filter((item) => item.id !== id)) : setEodEntries((items) => items.filter((item) => item.id !== id));
  const addOtherWork = () => activeMode === 'MORNING' ? setMorningEntries((items) => [...items, newEntry()]) : setEodEntries((items) => [...items, newEntry()]);

  const [gapReasonCode, setGapReasonCode] = useState('');
  const [gapReasonText, setGapReasonText] = useState('');
  const [overtimeReason, setOvertimeReason] = useState('');
  const [overtimeEvidence, setOvertimeEvidence] = useState('');

  const eodPayload = useMemo(() => ({
    employee_id: subjectId, local_work_date: localDate,
    entries: eodEntries.filter((entry) => entry.actualMinutes > 0).map((entry) => ({
      project_id: entry.projectId || null, task_id: entry.taskId || null, assignment_id: entry.assignmentId || null,
      work_category: entry.category, actual_minutes: Number(entry.actualMinutes), work_result: entry.workResult,
      deliverable: entry.deliverable || null, blocker: entry.knownBlocker || null, reason_source: entry.reasonSource || null,
      ...(['OTHER_PROJECT_TASK', 'OUTSIDE_WORK_OTHER_PROJECT'].includes(entry.category) ? { related_project_id: entry.relatedProjectId || entry.projectId || null, related_task_id: entry.relatedTaskId || entry.taskId || null } : {}),
      ...(isPrimary(entry) && entry.taskId ? { progress_after: Number(entry.progressAfter), remaining_estimated_minutes: Number(entry.remainingMinutes), completion_reported: entry.completionReported } : {}),
      ...(needsMeetingRecord(entry.category) ? { local_start_time: entry.meetingStart, local_end_time: entry.meetingEnd, meeting_record: { purpose: entry.meetingPurpose, location: entry.meetingLocation, participants: entry.meetingParticipants, agenda: entry.meetingAgenda, decision: entry.meetingDecision, follow_up: entry.meetingFollowUp, local_start_time: entry.meetingStart, local_end_time: entry.meetingEnd } } : {}),
      ...(entry.category === 'APPROVED_LEAVE' ? { leave_link_id: entry.leaveLinkId || null } : {}),
    })),
    ...(gapMinutes > 30 ? { gap_reason_code: gapReasonCode, gap_reason_text: gapReasonText.trim() } : {}),
    ...(overtimeMinutes > 0 ? { overtime_reason: overtimeReason.trim(), overtime_evidence: { note: overtimeEvidence.trim(), source: 'EMPLOYEE_WORKLOG_UI' } } : {}),
  }), [eodEntries, gapMinutes, gapReasonCode, gapReasonText, localDate, overtimeEvidence, overtimeMinutes, overtimeReason, subjectId]);

  const morningPayload = useMemo(() => ({
    employee_id: subjectId, local_work_date: localDate,
    entries: morningEntries.filter((entry) => entry.plannedMinutes > 0).map((entry) => ({
      project_id: entry.projectId || null, task_id: entry.taskId || null, assignment_id: entry.assignmentId || null,
      work_category: entry.category, planned_minutes: Number(entry.plannedMinutes), expected_deliverable: entry.expectedDeliverable || null,
      known_blocker: entry.knownBlocker || null, ...(isPrimary(entry) && entry.taskId && entry.targetProgress !== '' ? { target_progress: Number(entry.targetProgress) } : {}),
    })),
  }), [localDate, morningEntries, subjectId]);

  const validateForReview = (mode: WorklogMode) => {
    setError('');
    const active = mode === 'MORNING' ? morningPayload.entries : eodPayload.entries;
    if (!active.length) { setError(language === 'vi' ? 'Hãy nhập ít nhất một công việc có thời gian.' : '시간이 입력된 업무를 한 건 이상 추가해 주세요.'); return; }
    if (mode === 'EOD') {
      const invalidPrimary = eodEntries.some((entry) => entry.actualMinutes > 0 && isPrimary(entry) && entry.taskId && (entry.progressAfter === '' || entry.remainingMinutes === '' || !entry.workResult.trim()));
      if (invalidPrimary) { setError(errorText({ code: 'PRIMARY_PROGRESS_REQUIRED' }, language)); return; }
      const otherProjectMissing = eodEntries.some((entry) => entry.actualMinutes > 0 && ['OTHER_PROJECT_TASK', 'OUTSIDE_WORK_OTHER_PROJECT'].includes(entry.category) && (!entry.relatedProjectId || !entry.reasonSource));
      if (otherProjectMissing) { setError(language === 'vi' ? 'Hãy chọn công việc dự án khác và lý do.' : '다른 프로젝트 Task와 사유를 선택해 주세요.'); return; }
      const meetingMissing = eodEntries.some((entry) => entry.actualMinutes > 0 && needsMeetingRecord(entry.category) && (!entry.meetingPurpose.trim() || !entry.meetingStart || !entry.meetingEnd));
      if (meetingMissing) { setError(errorText({ code: 'MEETING_RECORD_REQUIRED' }, language)); return; }
      const leaveMissing = eodEntries.some((entry) => entry.actualMinutes > 0 && entry.category === 'APPROVED_LEAVE' && !entry.leaveLinkId.trim());
      if (leaveMissing) { setError(errorText({ code: 'LEAVE_LINK_REQUIRED' }, language)); return; }
      if (gapMinutes > 30 && (!gapReasonCode || !gapReasonText.trim())) { setError(errorText({ code: 'GAP_REASON_REQUIRED' }, language)); return; }
      if (overtimeMinutes > 0 && (!overtimeReason.trim() || !overtimeEvidence.trim())) { setError(errorText({ code: 'OVERTIME_REASON_REQUIRED' }, language)); return; }
    }
    setReviewMode(mode);
  };

  const refreshAfterSave = async (saved: any) => {
    try { localStorage.removeItem(draftKey(subjectId, localDate, reviewMode || activeMode)); } catch {}
    submitKeys.current[reviewMode || activeMode] = null;
    setNotice(t('saved')); setReviewMode(null); await loadContext(subjectId, localDate);
    if (saved?.worklog_id && saved?.shadowRecalculation?.status && saved.shadowRecalculation.status !== 'DISABLED') {
      setImpact({ status: saved.shadowRecalculation.status, request: { request_id: saved.shadowRecalculation.requestId } }); setImpactLoading(true);
      let attempts = 0;
      const poll = async () => {
        attempts += 1;
        try {
          const status = await api.getWorklogShadowStatus(saved.worklog_id);
          setImpact({ ...status, status: status.run?.status || status.request?.status || 'PENDING' });
          const pending = ['PENDING', 'RUNNING'].includes(status.run?.status || status.request?.status || 'PENDING');
          if (pending && attempts < 8) { window.setTimeout(() => { void poll(); }, 2000); return; }
        } catch { setImpact({ status: 'FAILED_RETRYABLE' }); }
        setImpactLoading(false);
      };
      void poll();
    }
  };

  const submit = async () => {
    if (!reviewMode || submitting) return;
    setSubmitting(true); setError('');
    const key = submitKeys.current[reviewMode] || idempotencyKey(); submitKeys.current[reviewMode] = key;
    try {
      let saved: any;
      if (reviewMode === 'MORNING') saved = await api.submitMorning(morningPayload, key);
      else if (worklog.current_eod_revision_id) saved = await api.reviseWorklog(worklog.id, { ...eodPayload, expected_revision: Number(worklog.current_revision_number) }, key);
      else saved = await api.submitEod(worklog.id || 'new', eodPayload, key);
      await refreshAfterSave(saved);
    } catch (err: any) { setError(errorText(err, language)); }
    finally { setSubmitting(false); }
  };

  const requestCorrection = async () => {
    if (!worklog?.id || !correctionReason.trim() || submitting) return;
    setSubmitting(true); setError('');
    const key = submitKeys.current.CORRECTION || idempotencyKey(); submitKeys.current.CORRECTION = key;
    try { await api.requestWorklogCorrection(worklog.id, { reason: correctionReason.trim(), proposed_payload: eodPayload }, key); submitKeys.current.CORRECTION = null; setCorrectionReason(''); await loadContext(subjectId, localDate); setNotice(t('saved')); }
    catch (err: any) { setError(errorText(err, language)); } finally { setSubmitting(false); }
  };

  const openHistory = async (item: any) => { try { setSelectedHistory(await api.getWorklog(item.id)); } catch (err: any) { setError(errorText(err, language)); } };
  const pageTitle = view === 'HISTORY' ? t('history') : t('title');
  const correctionEligible = Boolean(actorIsSubject && canSubmit && revisionDeadlinePassed);
  const currentModeCanSubmit = Boolean(canSubmit && (activeMode === 'MORNING' ? !worklog.current_morning_revision_id && !worklog.current_eod_revision_id : !revisionDeadlinePassed));

  useEffect(() => {
    if (!context) return;
    const projectId = searchParams.get('projectId');
    const taskId = searchParams.get('taskId');
    if (!projectId && !taskId) return;
    const candidate = eligibleTasks.find((task) => (!taskId || task.task_id === taskId) && (!projectId || task.project_id === projectId));
    if (!candidate) return;
    const appendIfMissing = (setEntries: React.Dispatch<React.SetStateAction<WorklogEntryDraft[]>>) => {
      setEntries((items) => items.some((entry) => entry.taskId === candidate.task_id) ? items : [...items, newEntry(candidate)]);
    };
    appendIfMissing(setMorningEntries); appendIfMissing(setEodEntries);
  }, [context, eligibleTasks, searchParams]);

  if (loading && !context) return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-6xl animate-pulse rounded-xl border border-slate-200 bg-white p-8 text-slate-500">{t('loading')}</div></main>;

  return (
    <main className="min-h-screen bg-slate-50 pb-24" data-testid="employee-worklog-page">
      <header className="border-b border-slate-200 bg-white shadow-xs"><div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6"><Link to="/projects" className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" />{t('back')}</Link><div className="min-w-0 flex-1"><h1 className="flex items-center gap-2 text-lg font-extrabold text-slate-900"><ClipboardCheck className="h-5 w-5 text-emerald-600" />{pageTitle}</h1></div><button type="button" onClick={() => setView(view === 'TODAY' ? 'HISTORY' : 'TODAY')} className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">{view === 'TODAY' ? t('history') : t('today')}</button></div></header>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-6">
        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-3">
          <label className="text-xs font-bold text-slate-700">{language === 'vi' ? 'Người dùng hiện tại' : '현재 사용자'}<select value={actorId} onChange={(event) => chooseActor(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-800"><option value="">-</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-700">{t('employee')}<select value={subjectId} disabled={!actorCanReadOthers} onChange={(event) => chooseSubject(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100"><option value="">-</option>{(actorCanReadOthers ? workers : workers.filter((worker) => worker.id === actorId)).map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-700">{t('date')}<input type="date" value={localDate} onChange={(event) => chooseDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-800" /></label>
        </section>
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div>}
        {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</div>}
        {view === 'HISTORY' ? <RecentWorklogs language={language} worklogs={history} loading={historyLoading} onOpen={openHistory} /> : <>
          <WorklogStatusCard context={context} language={language} readOnly={!canSubmit} />
          {!canSubmit && <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><ShieldAlert className="h-5 w-5 shrink-0" />{context?.permissions?.is_read_only ? t('readOnly') : t('managerReadOnly')}</div>}
          <nav className="flex flex-wrap gap-2" aria-label={t('title')}><button type="button" data-testid="worklog-mode-morning" onClick={() => setActiveMode('MORNING')} className={`rounded-lg px-4 py-2 text-sm font-extrabold ${activeMode === 'MORNING' ? 'bg-blue-600 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{t('morning')}</button><button type="button" data-testid="worklog-mode-eod" onClick={() => setActiveMode('EOD')} className={`rounded-lg px-4 py-2 text-sm font-extrabold ${activeMode === 'EOD' ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{t('eod')}</button><button type="button" onClick={() => void loadContext(subjectId, localDate)} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" />{t('retry')}</button></nav>
          {activeMode === 'EOD' && !worklog.current_morning_revision_id && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">{t('morningMissing')}</div>}
          <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-base font-extrabold text-slate-900">{activeMode === 'MORNING' ? t('plan') : t('workResult')}</h2><p className="mt-1 text-xs text-slate-500">{t('official')}</p></div>{currentModeCanSubmit && <button type="button" onClick={addOtherWork} className="inline-flex h-9 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 hover:bg-blue-100"><Plus className="h-4 w-4" />{t('addWork')}</button>}</div>{entries.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">{t('noTasks')}</div>}{entries.map((entry) => <WorklogEntryCard key={entry.id} entry={entry} mode={activeMode} language={language} readOnly={modeReadOnly} currentProgress={Number(taskActuals[entry.taskId || '']?.current_progress || taskActuals[entry.taskId || '']?.currentProgress || 0)} onChange={(updated) => replaceEntry(activeMode, updated)} onRemove={() => removeEntry(activeMode, entry.id)} canRemove={!entry.taskId || entries.length > 1} taskOptions={eligibleTasks} fullDayMinutes={capacity} />)}</section>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"><div className="grid gap-3 sm:grid-cols-4"><div><p className="text-xs font-bold text-slate-500">{t('capacity')}</p><p className="mt-1 text-lg font-extrabold text-slate-900">{effectiveDisplayCapacity}{t('minutes')}</p>{leaveMinutes > 0 && <p className="mt-1 text-[11px] font-semibold text-slate-500">{language === 'vi' ? `Đã trừ nghỉ phép ${leaveMinutes}${t('minutes')}` : `휴가 ${leaveMinutes}${t('minutes')} 차감`}</p>}</div><div><p className="text-xs font-bold text-slate-500">{activeMode === 'MORNING' ? t('plannedTotal') : t('actualTotal')}</p><p className="mt-1 text-lg font-extrabold text-slate-900">{recordedWorkMinutes}{t('minutes')}</p></div><div><p className="text-xs font-bold text-slate-500">{t('difference')}</p><p className="mt-1 text-lg font-extrabold text-slate-900">{recordedWorkMinutes - effectiveDisplayCapacity}{t('minutes')}</p></div>{overtimeMinutes > 0 && <div><p className="text-xs font-bold text-amber-700">{t('overtimePending')}</p><p className="mt-1 text-lg font-extrabold text-amber-800">+{overtimeMinutes}{t('minutes')}</p></div>}</div>{activeMode === 'MORNING' && totalMinutes > capacity && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{t('capacityExceeded')}</p>}</section>
          {activeMode === 'EOD' && gapMinutes > 30 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-extrabold text-amber-900">{t('gap')} {gapMinutes}{t('minutes')}</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-amber-900">{t('gapReason')}<select value={gapReasonCode} disabled={!currentModeCanSubmit} onChange={(event) => setGapReasonCode(event.target.value)} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-800"><option value="">-</option>{GAP_CODES.map((code) => <option key={code} value={code}>{gapLabel(language, code)}</option>)}</select></label><label className="text-xs font-bold text-amber-900">{t('gapDetail')}<input type="text" disabled={!currentModeCanSubmit} value={gapReasonText} onChange={(event) => setGapReasonText(event.target.value)} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-800" /></label></div></section>}
          {activeMode === 'EOD' && overtimeMinutes > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-extrabold text-amber-900">{t('overtime')} {overtimeMinutes}{t('minutes')}</h2><p className="mt-1 text-xs text-amber-800">{t('overtimePending')}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-amber-900">{t('overtimeReason')}<input type="text" disabled={!currentModeCanSubmit} value={overtimeReason} onChange={(event) => setOvertimeReason(event.target.value)} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-800" /></label><label className="text-xs font-bold text-amber-900">{t('overtimeEvidence')}<input type="text" disabled={!currentModeCanSubmit} value={overtimeEvidence} onChange={(event) => setOvertimeEvidence(event.target.value)} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-800" /></label></div></section>}
          {correctionEligible && <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-extrabold text-slate-900">{t('correction')}</h2><p className="mt-1 text-sm text-slate-600">{t('correctionInfo')}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input type="text" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder={t('correctionReason')} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button type="button" disabled={!correctionReason.trim() || submitting} onClick={() => void requestCorrection()} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50">{t('sendRequest')}</button></div></section>}
          {currentModeCanSubmit && <div className="sticky bottom-3 z-20 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur"><button type="button" disabled={submitting} onClick={() => validateForReview(activeMode)} className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60 ${activeMode === 'MORNING' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}><Send className="h-4 w-4" />{activeMode === 'MORNING' ? t('submitMorning') : worklog.current_eod_revision_id ? t('revise') : t('submitEod')}</button></div>}
          <ScheduleImpactResult language={language} result={impact} loading={impactLoading} />
          <RecentWorklogs language={language} worklogs={history} loading={historyLoading} onOpen={openHistory} />
        </>}
      </div>
      {reviewMode && <WorklogSubmitReview language={language} mode={reviewMode} count={(reviewMode === 'MORNING' ? morningPayload.entries : eodPayload.entries).length} minutes={reviewMode === 'MORNING' ? morningEntries.reduce((sum, entry) => sum + entry.plannedMinutes, 0) : recordedWorkMinutes} capacity={effectiveDisplayCapacity} gap={gapMinutes} overtime={overtimeMinutes} onClose={() => setReviewMode(null)} onConfirm={() => void submit()} submitting={submitting} />}
      <WorklogRevisionHistory language={language} worklog={selectedHistory} onClose={() => setSelectedHistory(null)} />
    </main>
  );
}

export default WorklogTodayPage;

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  GitBranch,
  Lock,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api, getCurrentWorkerId, setCurrentWorker } from '../services/api';
import {
  isExecutiveViewer,
  Project,
  ShadowRunView,
  ShadowScheduleTask,
  Task,
  TaskDependency,
  TaskGroup,
  Worker,
  CalendarOverride,
  CountryHoliday,
} from '../types';
import { WorkerSelector } from '../components/common/WorkerSelector';
import { LanguageSelector } from '../components/common/LanguageSelector';

const parseCodes = (value?: string | null): string[] => {
  if (!value) return [];
  try { return JSON.parse(value); } catch { return []; }
};

const fmtDate = (value?: string | null) => value || '—';
const fmtMinutes = (value: number) => value >= 60 ? `${Math.floor(value / 60)}h ${value % 60}m` : `${value}m`;
const statusTone: Record<string, string> = {
  PROPOSED: 'bg-amber-50 text-amber-700 border-amber-200',
  CONFIRMED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-slate-50 text-slate-500 border-slate-200',
  HIGH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PROVISIONAL: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-orange-50 text-orange-700 border-orange-200',
  BLOCKED: 'bg-rose-50 text-rose-700 border-rose-200',
};

function Badge({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${statusTone[value] || 'bg-blue-50 text-blue-700 border-blue-200'}`}>{value}</span>;
}

function dayDiff(start?: string | null, end?: string | null) {
  if (!start || !end) return 0;
  return Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86400000);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function ShadowGantt({ tasks, lang, holidays, overrides, workers }: {
  tasks: ShadowScheduleTask[];
  lang: 'ko' | 'vi';
  holidays: CountryHoliday[];
  overrides: CalendarOverride[];
  workers: Worker[];
}) {
  const allDates = tasks.flatMap((task) => [task.baseline_start, task.baseline_end, task.official_forecast_start, task.official_forecast_end, task.shadow_start, task.shadow_end]).filter(Boolean) as string[];
  if (!allDates.length) return <div className="p-8 text-center text-sm text-slate-500">{lang === 'vi' ? 'Chưa có dữ liệu lịch Shadow.' : '표시할 Shadow 일정이 없습니다.'}</div>;
  const minDate = [...allDates].sort()[0];
  const maxDate = [...allDates].sort().reverse()[0];
  const span = Math.max(1, dayDiff(minDate, maxDate) + 1);
  const left = (date: string | null) => date ? `${(dayDiff(minDate, date) / span) * 100}%` : '0%';
  const width = (start: string | null, end: string | null) => start && end ? `${Math.max(0.7, ((dayDiff(start, end) + 1) / span) * 100)}%` : '0%';
  const progressWidth = (start: string | null, end: string | null, progress: number) => {
    if (!start || !end) return '0%';
    return `${Math.max(0, ((dayDiff(start, end) + 1) / span) * 100 * Math.min(100, Math.max(0, progress)) / 100)}%`;
  };
  const ticks = Array.from({ length: Math.min(12, span) }, (_, index) => addDays(minDate, Math.floor(index * span / Math.min(12, span))));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return (
    <div data-testid="shadow-gantt" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex border-b border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-500">
        <div className="w-64 shrink-0 border-r border-slate-200 px-3 py-2">{lang === 'vi' ? 'Công việc' : '작업'}</div>
        <div className="relative h-8 flex-1">
          {ticks.map((date) => <span key={date} className="absolute top-2" style={{ left: left(date) }}>{date.slice(5)}</span>)}
        </div>
      </div>
      {tasks.map((task) => {
        const delayed = (task.shadow_end || '') > (task.official_forecast_end || '');
        const worker = workers.find((item) => item.id === task.employee_id);
        const countryCode = worker?.country_code;
        const hatchDates = new Map<string, 'KR' | 'VN' | 'LEAVE'>();
        for (const holiday of holidays.filter((item) => !countryCode || item.country_code === countryCode)) {
          hatchDates.set(holiday.holiday_date, holiday.country_code);
        }
        const relevantOverrideDates = new Set(overrides
          .filter((item) => item.scope_type === 'WORKER' && item.scope_key === task.employee_id
            || item.scope_type === 'COUNTRY' && (!countryCode || item.scope_key === countryCode))
          .map((item) => item.work_date));
        for (const date of relevantOverrideDates) {
          const workerOverride = overrides.find((item) => item.scope_type === 'WORKER' && item.scope_key === task.employee_id && item.work_date === date);
          const countryOverride = overrides.find((item) => item.scope_type === 'COUNTRY' && (!countryCode || item.scope_key === countryCode) && item.work_date === date);
          const effectiveOverride = workerOverride || countryOverride;
          if (effectiveOverride?.override_type === 'WORK') hatchDates.delete(date);
          else if (effectiveOverride?.override_type === 'LEAVE' || effectiveOverride?.override_type === 'OFF') hatchDates.set(date, workerOverride ? 'LEAVE' : (countryCode || 'LEAVE'));
        }
        return (
          <div key={task.task_id} className="flex min-h-[76px] border-b border-slate-100 last:border-b-0">
            <div className="w-64 shrink-0 border-r border-slate-200 px-3 py-2">
              <div className="truncate text-[11px] font-extrabold text-slate-800">{task.task_sort_order}. {lang === 'vi' ? task.task_name_vi || task.task_name : task.task_name_ko || task.task_name}</div>
              <div className="mt-1 text-[9px] text-slate-500">{task.employee_name || '—'} · {fmtMinutes(Number(task.remaining_minutes || 0))}</div>
            </div>
            <div className="relative flex-1">
              <div
                data-testid="shadow-day-grid"
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px)]"
                style={{ backgroundSize: `${100 / span}% 100%` }}
              />
              {[...hatchDates.entries()].filter(([date]) => date >= minDate && date <= maxDate).map(([date, type]) => (
                <div
                  key={`${task.task_id}-${date}`}
                  data-testid={`shadow-hatch-${date}`}
                  aria-label={`${type} holiday or leave`}
                  className={`absolute inset-y-0 z-[2] ${type === 'VN' ? 'bg-[repeating-linear-gradient(45deg,rgba(14,165,233,.14)_0_2px,transparent_2px_7px)]' : type === 'KR' ? 'bg-[repeating-linear-gradient(135deg,rgba(249,115,22,.14)_0_2px,transparent_2px_7px)]' : 'bg-[repeating-linear-gradient(135deg,rgba(139,92,246,.12)_0_2px,transparent_2px_7px)]'}`}
                  style={{ left: left(date), width: `${100 / span}%` }}
                />
              ))}
              {today >= minDate && today <= maxDate && <div data-testid="shadow-today-line" aria-label="Today" className="absolute inset-y-0 z-[3] w-px bg-blue-600" style={{ left: left(today) }} />}
              {task.baseline_start && task.baseline_end && <div aria-label="Baseline" className="absolute top-2 z-[4] h-3 rounded border border-dashed border-slate-400 bg-slate-100/60" style={{ left: left(task.baseline_start), width: width(task.baseline_start, task.baseline_end) }} />}
              {task.official_forecast_start && task.official_forecast_end && <div aria-label="Official Forecast" className="absolute top-7 z-[5] h-3 rounded border border-blue-600 bg-blue-500/70" style={{ left: left(task.official_forecast_start), width: width(task.official_forecast_start, task.official_forecast_end) }} />}
              {task.official_forecast_start && Number(task.current_progress || 0) > 0 && <div data-testid={`shadow-actual-fill-${task.task_id}`} aria-label="Actual Progress" className="absolute top-7 z-[7] h-3 rounded-l bg-blue-800" style={{ left: left(task.official_forecast_start), width: progressWidth(task.official_forecast_start, task.official_forecast_end, Number(task.current_progress || 0)) }} />}
              {task.shadow_start && task.shadow_end && <div aria-label="Shadow Candidate" className={`absolute top-12 z-[6] h-3 rounded border-2 border-dashed ${delayed ? 'border-orange-500 bg-orange-200/70' : 'border-teal-500 bg-teal-200/70'} ${Number(task.approval_required) ? 'opacity-60' : ''}`} style={{ left: left(task.shadow_start), width: width(task.shadow_start, task.shadow_end) }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ShadowSchedulePage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [holidays, setHolidays] = useState<CountryHoliday[]>([]);
  const [overrides, setOverrides] = useState<CalendarOverride[]>([]);
  const [currentWorker, setCurrentWorkerState] = useState<Worker | null>(null);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [permissions, setPermissions] = useState({ canReview: false, readOnly: true });
  const [shadow, setShadow] = useState<ShadowRunView | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dependencyLagMinutes, setDependencyLagMinutes] = useState('0');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [constraintType, setConstraintType] = useState('AS_SOON_AS_POSSIBLE');
  const [constraintDate, setConstraintDate] = useState('');
  const [priorityRank, setPriorityRank] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lang: 'ko' | 'vi' = currentWorker?.ui_language === 'vi' ? 'vi' : 'ko';
  const isExecutive = isExecutiveViewer(currentWorker);

  const load = async () => {
    setError('');
    const [detail, workerList, dependencyList, currentShadow, priorities, krHolidays, vnHolidays, calendarOverrides] = await Promise.all([
      api.getProjectDetail(projectId), api.getWorkers(), api.getDependencies(projectId),
      api.getCurrentProjectShadow(projectId), api.getProjectPriorities(),
      api.getHolidays('KR', 2026), api.getHolidays('VN', 2026), api.getCalendarOverrides(),
    ]);
    setProject(detail.project); setTasks(detail.tasks); setGroups(detail.task_groups);
    setWorkers(workerList); setDependencies(dependencyList.dependencies); setPermissions(dependencyList.permissions);
    setHolidays([...krHolidays, ...vnHolidays]); setOverrides(calendarOverrides);
    setShadow(currentShadow); setSelectedTaskId((value) => value || detail.tasks[0]?.id || '');
    const currentId = getCurrentWorkerId();
    setCurrentWorkerState(workerList.find((worker) => worker.id === currentId || worker.name === currentId) || workerList[0] || null);
    const priority = priorities.priorities?.find((item: any) => item.project_id === projectId);
    if (priority) setPriorityRank(String(priority.priority_rank));
  };

  useEffect(() => { load().catch((reason) => setError(reason.message)); }, [projectId]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const projectVersion = shadow?.versions.find((version) => version.project_id === projectId) || shadow?.versions[0];
  const impactedTasks = shadow?.tasks || [];
  const summary: any = shadow?.impacts?.[0];
  const isStale = Boolean(shadow?.versions.some((version) => version.status === 'STALE'));

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); await load(); } catch (reason: any) { setError(`${reason.code ? `[${reason.code}] ` : ''}${reason.message}`); }
    finally { setBusy(false); }
  };

  const changeWorker = (worker: Worker) => {
    setCurrentWorker(worker); setCurrentWorkerState(worker);
    window.location.reload();
  };

  return (
    <div data-testid="shadow-schedule-page" className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/projects/${projectId}`)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-base font-black">{lang === 'vi' ? 'Xem trước ảnh hưởng lịch' : '일정 영향 미리보기'}</h1><Badge value="SHADOW" /></div>
            <p className="text-[10px] text-slate-500">{project?.name || projectId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isExecutive && <span data-testid="shadow-executive-readonly" className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-extrabold text-rose-700"><Lock className="h-3.5 w-3.5" />{lang === 'vi' ? 'Chỉ xem' : '보기 전용'}</span>}
          <LanguageSelector />
          <WorkerSelector currentWorker={currentWorker} onWorkerChange={changeWorker} />
        </div>
      </header>

      <main className="mx-auto max-w-[1700px] space-y-4 p-4 md:p-6">
        <section data-testid="official-forecast-unchanged-notice" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div><p className="text-sm font-black">{lang === 'vi' ? 'Đây là kết quả tính toán Shadow.' : 'Shadow 계산 결과입니다.'}</p><p className="mt-0.5 text-xs font-semibold">{lang === 'vi' ? 'Lịch Forecast chính thức hiện chưa thay đổi.' : '현재 공식 Forecast 일정은 변경되지 않았습니다.'}</p></div>
        </section>
        {isStale && <section data-testid="shadow-stale-warning" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />{lang === 'vi' ? 'Kết quả này dựa trên phiên bản nhật ký công việc trước và không khớp với dữ liệu hiện tại. Đang chờ tính toán lại.' : '이 변경안은 이전 업무일지 Revision을 기준으로 계산되어 현재 데이터와 일치하지 않습니다. 재계산 대기 중입니다.'}</section>}
        {error && <section className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</section>}

        <section className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          {[
            [lang === 'vi' ? 'Baseline kết thúc' : '기준 종료일', projectVersion?.baseline_end_date || project?.baseline_end_date || project?.end_date],
            [lang === 'vi' ? 'Forecast chính thức' : '공식 예상 종료일', projectVersion?.official_forecast_end_date || project?.end_date],
            [lang === 'vi' ? 'Shadow dự kiến' : 'Shadow 예상 종료 후보', projectVersion?.shadow_forecast_end_date || '—'],
            [lang === 'vi' ? 'Biến động' : '예상 일정 변동', projectVersion ? `${projectVersion.schedule_variance_workdays > 0 ? '+' : ''}${projectVersion.schedule_variance_workdays}` : '—'],
            [lang === 'vi' ? 'Sớm hơn' : '단축 Task', summary?.tasks_advanced_count ?? '—'],
            [lang === 'vi' ? 'Chậm hơn' : '지연 Task', summary?.tasks_delayed_count ?? '—'],
            [lang === 'vi' ? 'Không đổi' : '변동 없음', summary?.unchanged_task_count ?? '—'],
            [lang === 'vi' ? 'Tin cậy' : '데이터 신뢰도', shadow?.run?.data_confidence || '—'],
          ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><p className="text-[10px] font-bold text-slate-500">{label}</p><p className="mt-1 text-sm font-black text-slate-900">{String(value)}</p></div>)}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="flex items-center gap-2 text-sm font-black"><Play className="h-4 w-4 text-orange-500" />{lang === 'vi' ? 'Tính toán Shadow' : 'Shadow 재산정'}</h2><p className="mt-1 text-[10px] text-slate-500">Engine {shadow?.run?.engine_version || '3A.1.1'} · {shadow?.run?.input_fingerprint?.slice(0, 16) || 'no run'}</p></div>
            <div className="flex gap-2">
              <button onClick={() => load()} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"><RefreshCw className="h-3.5 w-3.5" />{lang === 'vi' ? 'Làm mới' : '새로고침'}</button>
              {permissions.canReview && !isExecutive && <button data-testid="run-shadow-button" disabled={busy} onClick={() => act(async () => { const result = await api.runShadowSchedule({ project_id: projectId, trigger_type: 'MANUAL' }); setShadow(result); })} className="flex items-center gap-1 rounded-lg bg-orange-500 px-4 py-2 text-xs font-black text-white hover:bg-orange-600 disabled:opacity-50"><Play className="h-3.5 w-3.5" />{lang === 'vi' ? 'Chạy lại Shadow' : 'Shadow 재산정 실행'}</button>}
            </div>
          </div>
          {shadow?.run && <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-[10px] text-slate-600 md:grid-cols-4"><span>Revision: {shadow.run.based_on_forecast_version || '—'}</span><span>Shadow: {projectVersion?.shadow_version_number || '—'}</span><span>{new Date(shadow.run.completed_at || shadow.run.planning_cutoff_utc).toLocaleString()}</span><span>{shadow.run.affected_project_count} projects / {shadow.run.affected_task_count} tasks</span></div>}
        </section>

        {Number(summary?.cross_project_impact) === 1 && <section data-testid="cross-project-warning" className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm font-bold text-orange-900"><AlertTriangle className="mr-2 inline h-4 w-4" />{lang === 'vi' ? 'Thay đổi này ảnh hưởng đến lịch của dự án khác. Không được áp dụng tự động và cần quản lý phê duyệt.' : '이 변경안은 다른 프로젝트 일정에도 영향을 줍니다. Checkpoint 3B에서도 자동 적용되지 않고 관리자 승인이 필요합니다.'}</section>}

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-black"><CalendarClock className="h-4 w-4 text-blue-600" />Shadow Gantt Overlay</h2><div className="flex gap-3 text-[10px] font-bold text-slate-600"><span className="border-b-2 border-dashed border-slate-400">Baseline</span><span className="border-b-2 border-blue-500">Official</span><span className="border-b-2 border-dashed border-orange-500">Shadow</span></div></div>
          <ShadowGantt tasks={impactedTasks} lang={lang} holidays={holidays} overrides={overrides} workers={workers} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-black"><GitBranch className="h-4 w-4 text-violet-600" />{lang === 'vi' ? 'Đề xuất phụ thuộc' : 'Dependency 후보 검토'}</h2>{permissions.canReview && !isExecutive && <button data-testid="generate-dependency-button" disabled={busy} onClick={() => act(() => api.generateDependencyProposals(projectId))} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">{lang === 'vi' ? 'Tạo đề xuất' : '후보 생성'}</button>}</div>
          {selectedIds.length > 0 && permissions.canReview && !isExecutive && <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2"><label className="text-[10px] font-bold text-slate-600">Lag (min)<input aria-label="dependency lag minutes" type="number" min="0" step="30" value={dependencyLagMinutes} onChange={(event) => setDependencyLagMinutes(event.target.value)} className="ml-2 w-20 rounded border border-slate-300 px-2 py-1 text-xs" /></label><button onClick={() => act(() => api.batchReviewDependencies(selectedIds, 'CONFIRM', { lagWorkMinutes: Number(dependencyLagMinutes) }))} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">{lang === 'vi' ? 'Xác nhận hàng loạt' : '일괄 확인'}</button><button onClick={() => act(() => api.batchReviewDependencies(selectedIds, 'REJECT', { reason: 'BATCH_REVIEW' }))} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-bold">{lang === 'vi' ? 'Từ chối hàng loạt' : '일괄 반려'}</button></div>}
          <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-[11px]"><thead className="bg-slate-50 text-slate-500"><tr>{permissions.canReview && !isExecutive && <th className="p-2" />}<th className="p-2">{lang === 'vi' ? 'Trước' : '선행 작업'}</th><th className="p-2" /><th className="p-2">{lang === 'vi' ? 'Sau' : '후행 작업'}</th><th className="p-2">Lag</th><th className="p-2">{lang === 'vi' ? 'Tin cậy' : '신뢰도'}</th><th className="p-2">{lang === 'vi' ? 'Bằng chứng' : '근거'}</th><th className="p-2">{lang === 'vi' ? 'Trạng thái' : '상태'}</th><th className="p-2">{lang === 'vi' ? 'Người xác nhận' : '확인자/시각'}</th><th className="p-2">{lang === 'vi' ? 'Thao tác' : '액션'}</th></tr></thead><tbody>{dependencies.map((dependency) => <tr key={dependency.dependency_id} className="border-t border-slate-100">{permissions.canReview && !isExecutive && <td className="p-2"><input type="checkbox" checked={selectedIds.includes(dependency.dependency_id)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, dependency.dependency_id] : ids.filter((id) => id !== dependency.dependency_id))} /></td>}<td className="p-2 font-bold">{dependency.predecessor_wbs}. {dependency.predecessor_name}</td><td className="p-2"><ChevronRight className="h-3 w-3" /></td><td className="p-2 font-bold">{dependency.successor_wbs}. {dependency.successor_name}</td><td className="p-2">{dependency.lag_work_minutes}m</td><td className="p-2"><Badge value={dependency.confidence_level} /></td><td className="p-2 text-slate-500">{parseCodes(dependency.proposal_evidence_json).join(', ')}</td><td className="p-2"><Badge value={dependency.status} /></td><td className="p-2 text-[10px] text-slate-500">{dependency.status === 'CONFIRMED' ? `${dependency.confirmed_by_name || '—'} · ${dependency.confirmed_at ? new Date(dependency.confirmed_at).toLocaleString() : '—'}` : '—'}</td><td className="p-2">{permissions.canReview && !isExecutive && dependency.status === 'PROPOSED' && <div className="flex gap-1"><button aria-label="confirm dependency" onClick={() => act(() => api.confirmDependency(dependency.dependency_id, Number(dependencyLagMinutes)))} className="rounded bg-emerald-50 p-1 text-emerald-700"><Check className="h-3.5 w-3.5" /></button><button aria-label="reject dependency" onClick={() => act(() => api.rejectDependency(dependency.dependency_id, 'MANAGER_REJECTED'))} className="rounded bg-rose-50 p-1 text-rose-700"><X className="h-3.5 w-3.5" /></button></div>}</td></tr>)}</tbody></table></div>
        </section>

        {permissions.canReview && !isExecutive && <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-3 flex items-center gap-2 text-sm font-black"><Settings2 className="h-4 w-4 text-blue-600" />{lang === 'vi' ? 'Ràng buộc công việc' : 'Task Constraint 설정'}</h2><div className="grid gap-2 md:grid-cols-3"><select value={selectedTaskId} onChange={(event) => setSelectedTaskId(event.target.value)} className="rounded-lg border border-slate-200 p-2 text-xs">{tasks.map((task) => <option key={task.id} value={task.id}>{task.task_sort_order}. {task.task_name}</option>)}</select><select value={constraintType} onChange={(event) => setConstraintType(event.target.value)} className="rounded-lg border border-slate-200 p-2 text-xs"><option>AS_SOON_AS_POSSIBLE</option><option>NOT_BEFORE</option><option>FIXED_START</option><option>FIXED_END</option><option>MILESTONE</option></select><input type="date" value={constraintDate} onChange={(event) => setConstraintDate(event.target.value)} className="rounded-lg border border-slate-200 p-2 text-xs" /></div><button disabled={busy} onClick={() => act(() => api.setTaskConstraint(selectedTaskId, { constraint_type: constraintType, constraint_date: constraintType === 'AS_SOON_AS_POSSIBLE' ? null : constraintDate, reason: 'MANAGER_SCHEDULE_POLICY' }))} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white">{lang === 'vi' ? 'Lưu ràng buộc' : 'Constraint 저장'}</button></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-3 flex items-center gap-2 text-sm font-black"><Settings2 className="h-4 w-4 text-violet-600" />{lang === 'vi' ? 'Ưu tiên dự án' : '프로젝트 우선순위'}</h2><div className="flex gap-2"><input min="1" type="number" value={priorityRank} onChange={(event) => setPriorityRank(event.target.value)} className="w-24 rounded-lg border border-slate-200 p-2 text-xs" /><button disabled={busy} onClick={() => act(() => api.setProjectPriority({ project_id: projectId, priority_rank: Number(priorityRank), priority_label: 'MANAGER_PRIORITY', reason: 'CAPACITY_COLLISION_ORDER' }))} className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-black text-white">{lang === 'vi' ? 'Lưu ưu tiên' : '우선순위 저장'}</button></div><p className="mt-2 text-[10px] text-slate-500">{lang === 'vi' ? 'Số nhỏ hơn có độ ưu tiên cao hơn.' : '숫자가 작을수록 Capacity 충돌 시 우선 배치됩니다.'}</p></div>
        </section>}

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-3 text-sm font-black">Task Before / After Diff</h2><div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-left text-[10px]"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">{lang === 'vi' ? 'Dự án' : '프로젝트'}</th><th className="p-2">WBS / Task</th><th className="p-2">{lang === 'vi' ? 'Nhân viên' : '직원'}</th><th className="p-2">Official Start</th><th className="p-2">Shadow Start</th><th className="p-2">Official End</th><th className="p-2">Shadow End</th><th className="p-2">Δ</th><th className="p-2">{lang === 'vi' ? 'Nguyên nhân' : '원인'}</th><th className="p-2">Confidence</th><th className="p-2">{lang === 'vi' ? 'Cần phê duyệt' : '승인 필요'}</th></tr></thead><tbody>{impactedTasks.map((task) => <tr key={task.task_id} className="border-t border-slate-100"><td className="p-2">{task.project_name}</td><td className="p-2 font-bold">{task.task_sort_order}. {lang === 'vi' ? task.task_name_vi || task.task_name : task.task_name_ko || task.task_name}<div className="text-[9px] font-normal text-slate-400">{groupById.get(tasks.find((item) => item.id === task.task_id)?.task_group_id || '')?.group_name || ''}</div></td><td className="p-2">{task.employee_name || '—'}</td><td className="p-2">{fmtDate(task.official_forecast_start)}</td><td className="p-2 font-bold text-orange-700">{fmtDate(task.shadow_start)}</td><td className="p-2">{fmtDate(task.official_forecast_end)}</td><td className="p-2 font-bold text-orange-700">{fmtDate(task.shadow_end)}</td><td className="p-2">{Number(task.delta_end_workdays) > 0 ? '+' : ''}{task.delta_end_workdays}</td><td className="max-w-xs p-2 text-slate-500">{parseCodes(task.impact_reason_codes_json).join(', ') || '—'}</td><td className="p-2"><Badge value={task.data_confidence} /></td><td className="p-2">{Number(task.approval_required) ? <Badge value="APPROVAL_REQUIRED" /> : '—'}</td></tr>)}</tbody></table></div></section>
      </main>
    </div>
  );
}

export default ShadowSchedulePage;

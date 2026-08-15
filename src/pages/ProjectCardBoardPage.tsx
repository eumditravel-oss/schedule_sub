import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarRange, CheckCircle2, ClipboardCheck, Clock3, FolderKanban, Gauge, Plus, ShieldAlert, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { usePilotAuth } from '../auth/PilotAuthContext';
import { api } from '../services/api';
import { AppShell } from '../components/layout/AppShell';
import type { Worker } from '../types';

type BoardProject = {
  id: string;
  name: string;
  name_ko?: string | null;
  name_vi?: string | null;
  status: string;
  priority?: string | null;
  manager_name?: string | null;
  primary_team?: string[];
  start_date?: string | null;
  end_date?: string | null;
  actual_progress?: number;
  schedule_variance_workdays?: number;
  schedule_state?: string;
  official_forecast_version?: number | null;
  pending_worklog_count?: number;
  review_worklog_count?: number;
  shadow?: { status?: string; fresh?: boolean; approval_classification?: string | null };
  task_counts: { active: number; completed: number; blocked: number; total: number };
  tasks: Array<{
    id: string;
    project_id: string;
    task_group_id?: string | null;
    task_group_name?: string | null;
    task_sort_order?: number;
    task_name: string;
    primary_worker_name?: string | null;
    support_worker_names?: string[];
    status?: string;
    start_date?: string | null;
    end_date?: string | null;
    actual_progress?: number;
    is_blocked?: boolean;
    blocked_reason?: string | null;
    worklog_state?: string;
  }>;
};

function formatRange(start?: string | null, end?: string | null) {
  if (!start && !end) return '일정 미정';
  return `${start || '—'} ~ ${end || '—'}`;
}

function statusLabel(status?: string | null) {
  if (status === 'COMPLETED') return '완료';
  if (status === 'BLOCKED') return 'Blocked';
  if (status === 'DELAYED') return '지연';
  if (status === 'REVIEW_REQUIRED') return '확인 필요';
  return '진행 중';
}

function StatusBadge({ status }: { status?: string | null }) {
  const tone = status === 'COMPLETED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'BLOCKED' || status === 'DELAYED' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-blue-200 bg-blue-50 text-blue-700';
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${tone}`}>{statusLabel(status)}</span>;
}

function EmptyBoard({ manager }: { manager: boolean }) {
  return <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><FolderKanban className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 text-lg font-black text-slate-800">{manager ? '표시할 프로젝트가 없습니다' : '담당 프로젝트가 없습니다'}</h2><p className="mx-auto mt-2 max-w-md text-sm font-medium text-slate-500">{manager ? '현재 관리 범위에 포함된 프로젝트가 없습니다.' : '프로젝트에 Task가 배정되면 이곳에 카드로 표시됩니다.'}</p></section>;
}

function TaskCard({ task }: { task: BoardProject['tasks'][number] }) {
  return <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-testid={`project-board-task-${task.id}`}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[11px] font-bold text-blue-700">{task.task_group_name || '기본 공정'}</p><p className="mt-1 truncate text-sm font-black text-slate-900">{task.task_name}</p><p className="mt-1 truncate text-xs font-semibold text-slate-500">{task.primary_worker_name || 'Primary 미지정'}{task.support_worker_names?.length ? ` · Support ${task.support_worker_names.join(', ')}` : ''}</p></div><StatusBadge status={task.is_blocked ? 'BLOCKED' : task.status} /></div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><p className="font-semibold text-slate-500">공식 일정</p><p className="mt-1 font-bold text-slate-800">{formatRange(task.start_date, task.end_date)}</p></div><div><p className="font-semibold text-slate-500">Approved Actual</p><p className="mt-1 font-bold text-emerald-700">{Math.round(Number(task.actual_progress || 0))}%</p></div></div>
    {task.is_blocked && <p className="mt-3 flex items-center gap-1 text-xs font-bold text-rose-700"><ShieldAlert className="h-3.5 w-3.5" />{task.blocked_reason || '차단 사유 확인 필요'}</p>}
    <div className="mt-4 flex flex-wrap gap-2"><Link to={`/worklog/today?projectId=${encodeURIComponent(task.project_id)}&taskId=${encodeURIComponent(task.id)}`} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700" data-testid={`project-board-task-worklog-${task.id}`}><ClipboardCheck className="h-3.5 w-3.5" />업무일지</Link><Link to={`/projects/${encodeURIComponent(task.project_id)}?taskId=${encodeURIComponent(task.id)}`} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-50" data-testid={`project-board-task-schedule-${task.id}`}><CalendarRange className="h-3.5 w-3.5" />일정 보기</Link></div>
  </article>;
}

function ProjectCard({ project, expanded, onToggle, manager }: { project: BoardProject; expanded: boolean; onToggle: () => void; manager: boolean }) {
  const navigate = useNavigate();
  const variance = Number(project.schedule_variance_workdays || 0);
  return <article className="flex min-w-0 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md" data-testid={`project-board-card-${project.id}`}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-lg font-black text-slate-900" title={project.name}>{project.name}</h2><p className="mt-1 truncate text-xs font-semibold text-slate-500">{project.manager_name || 'PM 미지정'}{project.primary_team?.length ? ` · ${project.primary_team.join(', ')}` : ''}</p></div><StatusBadge status={project.status === 'COMPLETED' ? 'COMPLETED' : project.schedule_state} /></div>
    <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><p className="text-[11px] font-bold text-slate-500">공식 일정</p><p className="mt-1 text-xs font-black text-slate-800">{formatRange(project.start_date, project.end_date)}</p></div><div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><p className="text-[11px] font-bold text-slate-500">Approved Actual</p><p className="mt-1 text-xl font-black text-emerald-700">{Math.round(Number(project.actual_progress || 0))}%</p></div></div>
    <div className="mt-4"><div className="mb-1 flex items-center justify-between text-xs font-bold"><span className="text-slate-500">진행 공정</span><span className="text-slate-700">{project.task_counts.active} 진행 · {project.task_counts.completed} 완료</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, Number(project.actual_progress || 0)))}%` }} /></div></div>
    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] font-bold"><div className="rounded-xl bg-slate-50 p-2"><p className="text-slate-500">전체 Task</p><p className="mt-1 text-sm text-slate-900">{project.task_counts.total}</p></div><div className="rounded-xl bg-slate-50 p-2"><p className="text-slate-500">Blocked</p><p className="mt-1 text-sm text-rose-700">{project.task_counts.blocked}</p></div><div className="rounded-xl bg-slate-50 p-2"><p className="text-slate-500">일정 편차</p><p className={`mt-1 text-sm ${variance > 0 ? 'text-rose-700' : variance < 0 ? 'text-emerald-700' : 'text-slate-900'}`}>{variance > 0 ? '+' : ''}{variance}일</p></div></div>
    {(project.pending_worklog_count || project.review_worklog_count) ? <p className="mt-4 flex items-center gap-1 text-xs font-bold text-amber-700"><Clock3 className="h-3.5 w-3.5" />업무일지 확인 {project.pending_worklog_count || 0}건{project.review_worklog_count ? ` · 정정 ${project.review_worklog_count}건` : ''}</p> : null}
    <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={onToggle} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-700" data-testid={`project-board-tasks-toggle-${project.id}`}><Users className="h-3.5 w-3.5" />{expanded ? '업무 접기' : '업무 보기'}<span className="ml-1 rounded-full bg-white/15 px-1.5 py-0.5">{project.task_counts.total}</span></button><button type="button" onClick={() => navigate(`/projects/${encodeURIComponent(project.id)}`)} className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100" data-testid={`project-board-schedule-${project.id}`}><CalendarRange className="h-3.5 w-3.5" />일정 보기</button>{manager && <Link to="/projects" className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50" data-testid={`project-board-manage-${project.id}`}>프로젝트 관리</Link>}</div>
    {expanded && <div className="mt-5 space-y-3 border-t border-slate-100 pt-5" data-testid={`project-board-task-list-${project.id}`}>{project.tasks.length ? project.tasks.map((task) => <TaskCard key={task.id} task={task} />) : <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">표시할 Task가 없습니다.</p>}</div>}
  </article>;
}

export function ProjectCardBoardPage() {
  const { session } = usePilotAuth();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [projects, setProjects] = useState<BoardProject[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'REVIEW_REQUIRED' | 'COMPLETED'>('ALL');
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getWorkers(), api.getProjectCardBoard()]).then(([workers, board]) => {
      if (cancelled) return;
      setWorker((workers || []).find((row) => row.id === session?.actor.employeeId) || null);
      setProjects((board?.projects || []) as BoardProject[]);
    }).catch((reason: any) => { if (!cancelled) setError(reason?.message || '프로젝트 카드를 불러오지 못했습니다.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.actor.employeeId]);
  const manager = Boolean(worker?.access_role === 'EDITOR' && Number(worker?.can_manage_schedule_engine) === 1);
  const filteredProjects = useMemo(() => projects.filter((project) => filter === 'ALL' || (filter === 'COMPLETED' ? project.status === 'COMPLETED' : filter === 'REVIEW_REQUIRED' ? Boolean(project.pending_worklog_count || project.review_worklog_count || project.task_counts.blocked) : project.status !== 'COMPLETED')), [filter, projects]);
  return <AppShell worker={worker}><main className="space-y-6 px-4 py-6 sm:px-6" data-testid="project-card-board">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-black uppercase tracking-wide text-blue-700">Project workspace</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">프로젝트</h1><p className="mt-2 max-w-2xl text-sm font-medium text-slate-600">프로젝트는 배정 업무를 카드 형태로 관리합니다. 일정 확인은 기존 스케줄러에서 이어집니다.</p></div>{manager && <Link to="/projects" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-700" data-testid="project-board-add-project"><Plus className="h-4 w-4" />프로젝트 추가</Link>}</header>
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex flex-wrap gap-1" role="tablist" aria-label="Project filters">{[['ALL','전체'],['ACTIVE','진행 중'],['REVIEW_REQUIRED','확인 필요'],['COMPLETED','완료']].map(([value,label]) => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value as typeof filter)} className={`rounded-lg px-3 py-2 text-xs font-black ${filter === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`} data-testid={`project-board-filter-${value.toLowerCase()}`}>{label}</button>)}</div><p className="text-xs font-bold text-slate-500">{filteredProjects.length}개 프로젝트 · 카드 로드는 읽기 전용</p></section>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{error}</div>}
    {loading ? <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-500">프로젝트 카드를 불러오는 중입니다…</div> : filteredProjects.length === 0 ? <EmptyBoard manager={manager} /> : <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3" data-testid="project-board-grid">{filteredProjects.map((project) => <ProjectCard key={project.id} project={project} manager={manager} expanded={expandedProjectId === project.id} onToggle={() => setExpandedProjectId((current) => current === project.id ? null : project.id)} />)}</section>}
    <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500"><span className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" />공식 Forecast와 Approved Actual을 서버 투영값으로 표시합니다.</span><Link to="/projects" className="inline-flex items-center gap-1 font-black text-blue-700">기존 스케줄러 보기 <ArrowRight className="h-3.5 w-3.5" /></Link><span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />읽기 전용 Board 로드</span></footer>
  </main></AppShell>;
}

export default ProjectCardBoardPage;

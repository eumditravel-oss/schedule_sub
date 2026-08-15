import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, FolderKanban, Plus, Search, ShieldAlert, Users, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePilotAuth } from '../auth/PilotAuthContext';
import { api } from '../services/api';
import { AppShell } from '../components/layout/AppShell';
import { ProjectModal } from '../components/modals/ProjectModal';
import type { Project, Worker } from '../types';

type BoardColumn = 'PRE_WORK' | 'IN_PROGRESS' | 'COMPLETED' | 'REVISION';
type BoardTask = {
  id: string; project_id: string; task_group_id?: string | null; task_group_name?: string | null; task_sort_order?: number;
  task_name: string; task_name_ko?: string | null; task_name_vi?: string | null; primary_worker_id?: string | null; primary_worker_name?: string | null;
  support_worker_names?: string[]; status?: string; schedule_state?: string | null; official_start?: string | null; official_end?: string | null;
  start_date?: string | null; end_date?: string | null; approved_actual_minutes?: number; actual_progress?: number; actual_status?: string | null;
  is_blocked?: boolean; blocked_reason?: string | null; worklog_state?: string;
};
type BoardProject = {
  id: string; display_name?: string | null; name: string; name_ko?: string | null; name_vi?: string | null; board_column: BoardColumn;
  status: string; priority?: string | number | null; unique_assignees?: Array<{ worker_id: string; display_name: string }>;
  official_start?: string | null; official_end?: string | null; start_date?: string | null; end_date?: string | null;
  approved_actual_progress?: number; actual_progress?: number; remaining_task_count?: number; blocked_task_count?: number;
  project_revision_count?: number; schedule_state?: string; pending_worklog_count?: number; review_worklog_count?: number;
  attention_badges?: string[]; allowed_actions?: string[]; shadow?: { status?: string; fresh?: boolean; approval_classification?: string | null };
  task_counts: { active: number; completed: number; blocked: number; total: number }; tasks: BoardTask[];
};

const lanes: Array<{ id: BoardColumn; label: string; tone: string; empty: string }> = [
  { id: 'PRE_WORK', label: '준비 전', tone: 'border-slate-200 bg-slate-50/70', empty: '게시된 공식 일정이 없는 프로젝트가 여기에 표시됩니다.' },
  { id: 'IN_PROGRESS', label: '진행 중', tone: 'border-blue-200 bg-blue-50/40', empty: '진행 중인 프로젝트가 없습니다.' },
  { id: 'COMPLETED', label: '완료', tone: 'border-emerald-200 bg-emerald-50/40', empty: '완료된 프로젝트가 없습니다.' },
  { id: 'REVISION', label: '수정', tone: 'border-amber-200 bg-amber-50/50', empty: '활성 수정·재개 프로젝트가 없습니다.' },
];

function formatRange(start?: string | null, end?: string | null) { return start || end ? `${start || '—'} ~ ${end || '—'}` : '공식 일정 미정'; }
function badgeLabel(value: string) { return ({ DELAYED: '지연', BLOCKED: '차단', REVIEW_REQUIRED: '검토 필요', REVISION: '수정' } as Record<string, string>)[value] || value; }
function statusLabel(value?: string | null) { return value === 'COMPLETED' ? '완료' : value === 'DELAYED' ? '지연' : value === 'BLOCKED' ? '차단' : value === 'UPCOMING' ? '준비 전' : '진행 중'; }

function AttentionBadges({ project }: { project: BoardProject }) {
  return <div className="flex flex-wrap gap-1.5" data-testid={`project-board-badges-${project.id}`}>
    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">{statusLabel(project.schedule_state)}</span>
    {(project.attention_badges || []).map((badge) => <span key={badge} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">{badgeLabel(badge)}</span>)}
  </div>;
}

function ProjectSummaryCard({ project, onOpen }: { project: BoardProject; onOpen: () => void }) {
  const progress = Math.max(0, Math.min(100, Number(project.approved_actual_progress ?? project.actual_progress ?? 0)));
  const names = (project.unique_assignees || []).map((row) => row.display_name).join(', ');
  return <button type="button" onClick={onOpen} className="group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400" data-testid={`project-board-card-${project.id}`}>
    <AttentionBadges project={project} />
    <div className="mt-2 flex items-start justify-between gap-2"><h3 className="line-clamp-2 min-w-0 text-sm font-black leading-5 text-slate-900 group-hover:text-blue-700">{project.display_name || project.name}</h3><ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 group-hover:text-blue-500" /></div>
    <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-slate-500"><Users className="h-3.5 w-3.5" /><span className="truncate">{names || '담당자 미정'}</span></div>
    <div className="mt-3 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500"><span className="flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" />{project.official_end ? `${project.official_end} 종료` : '종료일 미정'}</span><span>{project.remaining_task_count ?? project.task_counts.active}개 남음</span></div>
    <div className="mt-3"><div className="mb-1 flex items-center justify-between text-[10px] font-black text-slate-500"><span>Approved Actual</span><span className="text-emerald-700">{Math.round(progress)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></div></div>
  </button>;
}

function TaskDrawer({ project, onClose }: { project: BoardProject; onClose: () => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, BoardTask[]>();
    project.tasks.forEach((task) => { const key = task.task_group_id || 'ungrouped'; map.set(key, [...(map.get(key) || []), task]); });
    return Array.from(map.entries());
  }, [project.tasks]);
  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${project.display_name || project.name} Task Drawer`} data-testid="project-board-task-drawer">
    <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-slate-950/35" />
    <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl sm:w-[min(92vw,560px)]">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-wide text-blue-700">Project tasks</p><h2 className="mt-1 line-clamp-2 text-lg font-black text-slate-900">{project.display_name || project.name}</h2><p className="mt-2 text-xs font-semibold text-slate-500">공식 일정 {formatRange(project.official_start, project.official_end)} · Approved Actual {Math.round(Number(project.approved_actual_progress || 0))}%</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" data-testid="project-board-drawer-close"><X className="h-5 w-5" /></button></header>
      <div className="flex-1 overflow-y-auto p-5"><div className="mb-5 grid grid-cols-3 gap-2 text-center text-[11px] font-bold"><div className="rounded-xl bg-slate-50 p-2"><p className="text-slate-500">전체 Task</p><p className="mt-1 text-sm text-slate-900">{project.task_counts.total}</p></div><div className="rounded-xl bg-emerald-50 p-2"><p className="text-emerald-700">완료</p><p className="mt-1 text-sm text-emerald-700">{project.task_counts.completed}</p></div><div className="rounded-xl bg-rose-50 p-2"><p className="text-rose-700">차단</p><p className="mt-1 text-sm text-rose-700">{project.blocked_task_count ?? project.task_counts.blocked}</p></div></div>
        {groups.map(([groupId, tasks]) => <section key={groupId} className="mb-5" data-testid={`project-board-task-group-${project.id}-${groupId}`}><h3 className="mb-2 border-b border-slate-200 pb-2 text-xs font-black text-slate-700">{tasks[0]?.task_group_name || '기본 공정'}</h3><div className="space-y-2">{tasks.map((task) => <article key={task.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid={`project-board-task-${task.id}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h4 className="line-clamp-2 text-sm font-black text-slate-900">{task.task_name_ko || task.task_name}</h4><p className="mt-1 text-[11px] font-semibold text-slate-500">Primary: {task.primary_worker_name || '미정'}{task.support_worker_names?.length ? ` · Support: ${task.support_worker_names.join(', ')}` : ''}</p></div>{task.is_blocked ? <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-slate-300" />}</div><div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-semibold"><span className="text-slate-500">공식 일정<br /><b className="text-slate-700">{formatRange(task.official_start || task.start_date, task.official_end || task.end_date)}</b></span><span className="text-slate-500">Approved Actual<br /><b className="text-emerald-700">{Math.round(Number(task.actual_progress || 0))}%</b></span></div>{task.is_blocked && <p className="mt-2 flex items-center gap-1 text-[11px] font-bold text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />{task.blocked_reason || '차단 사유 확인 필요'}</p>}<div className="mt-3 flex flex-wrap gap-2"><Link to={`/worklog/today?projectId=${encodeURIComponent(task.project_id)}&taskId=${encodeURIComponent(task.id)}`} onClick={onClose} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-black text-white" data-testid={`project-board-task-worklog-${task.id}`}><ClipboardCheck className="h-3.5 w-3.5" />업무일지</Link><Link to={`/projects/${encodeURIComponent(task.project_id)}?taskId=${encodeURIComponent(task.id)}`} onClick={onClose} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-blue-700" data-testid={`project-board-task-schedule-${task.id}`}><CalendarRange className="h-3.5 w-3.5" />일정 보기</Link></div></article>)}</div></section>)}
        {!project.tasks.length && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm font-semibold text-slate-500">표시할 Task가 없습니다.</p>}
      </div>
    </aside>
  </div>;
}

function EmptyBoard({ manager, query }: { manager: boolean; query: string }) { return <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><FolderKanban className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 text-lg font-black text-slate-800">{query ? '검색 결과가 없습니다.' : manager ? '표시할 프로젝트가 없습니다.' : '담당 프로젝트가 없습니다.'}</h2><p className="mt-2 text-sm font-medium text-slate-500">{query ? '검색어 또는 연도 조건을 조정해 보세요.' : '프로젝트와 Task 배정이 준비되면 이 보드에 표시됩니다.'}</p></section>; }

export function ProjectCardBoardPage() {
  const { session } = usePilotAuth();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [projects, setProjects] = useState<BoardProject[]>([]);
  const [activeLane, setActiveLane] = useState<BoardColumn>('IN_PROGRESS');
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('ALL');
  const [selected, setSelected] = useState<BoardProject | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => { setLoading(true); try { const [workers, board] = await Promise.all([api.getWorkers(), api.getProjectCardBoard()]); setWorker((workers || []).find((row) => row.id === session?.actor.employeeId) || null); setProjects((board?.projects || []) as BoardProject[]); } catch (reason: any) { setError(reason?.message || '프로젝트 보드를 불러오지 못했습니다.'); } finally { setLoading(false); } };
  useEffect(() => { if (session?.actor.employeeId) load(); }, [session?.actor.employeeId]);
  const manager = Boolean(worker?.access_role === 'EDITOR' && Number(worker?.can_manage_schedule_engine) === 1);
  const years = useMemo(() => Array.from(new Set(projects.flatMap((p) => [p.official_start, p.official_end].filter(Boolean).map((d) => String(d).slice(0, 4))))).sort().reverse(), [projects]);
  const filtered = useMemo(() => projects.filter((p) => { const haystack = `${p.display_name || p.name} ${(p.unique_assignees || []).map((a) => a.display_name).join(' ')}`.toLowerCase(); return (!search || haystack.includes(search.toLowerCase())) && (year === 'ALL' || String(p.official_start || p.start_date || '').startsWith(year) || String(p.official_end || p.end_date || '').startsWith(year)); }), [projects, search, year]);
  const handleSaveProject = async (data: Partial<Project>) => { const result = await api.createProject(data); setIsModalOpen(false); await load(); return result; };
  return <AppShell worker={worker}><main className="space-y-5 px-4 py-5 sm:px-6" data-testid="project-card-board"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-700">Workspace project board</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">프로젝트 보드</h1><p className="mt-1 text-sm font-medium text-slate-500">공식 일정과 Approved Actual을 기준으로 프로젝트 상태를 한눈에 확인합니다.</p></div>{manager && <button type="button" onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-700" data-testid="project-board-add-project"><Plus className="h-4 w-4" />프로젝트 추가</button>}</header>
    <section className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm"><label className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-400" placeholder="프로젝트·담당자 검색" aria-label="프로젝트 검색" /></label><select value={year} onChange={(e) => setYear(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700" aria-label="연도 필터"><option value="ALL">전체 연도</option>{years.map((value) => <option key={value} value={value}>{value}년</option>)}</select><span className="px-2 text-xs font-bold text-slate-500">{filtered.length}개 프로젝트 · 읽기 전용 보드</span></section>
    <div className="flex gap-2 overflow-x-auto pb-1 md:hidden" role="tablist" aria-label="프로젝트 상태 레인">{lanes.map((lane) => <button key={lane.id} type="button" role="tab" aria-selected={activeLane === lane.id} onClick={() => setActiveLane(lane.id)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-black ${activeLane === lane.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`} data-testid={`project-board-mobile-lane-${lane.id.toLowerCase()}`}>{lane.label} <span className="ml-1 opacity-70">{filtered.filter((p) => p.board_column === lane.id).length}</span></button>)}</div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</div>}
    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-500">프로젝트 보드를 불러오는 중입니다…</div> : !filtered.length ? <EmptyBoard manager={manager} query={search} /> : <><section className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-4" data-testid="project-board-lanes">{lanes.map((lane) => { const laneProjects = filtered.filter((p) => p.board_column === lane.id); return <section key={lane.id} className={`flex max-h-[calc(100vh-260px)] min-h-[360px] flex-col overflow-hidden rounded-2xl border ${lane.tone}`} data-testid={`project-board-lane-${lane.id.toLowerCase()}`}><header className="flex items-center justify-between border-b border-inherit bg-white/70 px-3 py-3"><h2 className="text-sm font-black text-slate-800">{lane.label}</h2><span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-slate-600">{laneProjects.length}</span></header><div className="flex-1 space-y-2 overflow-y-auto p-2">{laneProjects.map((project) => <ProjectSummaryCard key={project.id} project={project} onOpen={() => setSelected(project)} />)}{!laneProjects.length && <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-center text-xs font-semibold text-slate-500">{lane.empty}</p>}</div></section>; })}</section><section className="md:hidden" data-testid="project-board-mobile-lane-content"><div className="space-y-3">{filtered.filter((p) => p.board_column === activeLane).map((project) => <ProjectSummaryCard key={project.id} project={project} onOpen={() => setSelected(project)} />)}{!filtered.some((p) => p.board_column === activeLane) && <EmptyBoard manager={manager} query={search} />}</div></section></>}
    <footer className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-500"><span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />공식 Forecast와 Approved Actual은 서버 파생값입니다.</span><Link to="/projects" className="font-black text-blue-700">기존 Scheduler 열기 <ChevronRight className="inline h-3.5 w-3.5" /></Link></footer>
    {selected && <TaskDrawer project={selected} onClose={() => setSelected(null)} />}
    <ProjectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveProject} project={null} currentWorker={worker} />
  </main></AppShell>;
}

export default ProjectCardBoardPage;

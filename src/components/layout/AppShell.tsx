import React from 'react';
import { BarChart3, ClipboardCheck, FolderKanban, History, LayoutDashboard, CalendarRange } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { BuildVersionIndicator } from '../common/BuildVersionIndicator';
import { usePilotAuth } from '../../auth/PilotAuthContext';
import type { Worker } from '../../types';
import { isManagerWorker, resolveLandingRoute } from '../../utils/roleLanding';

type AppShellProps = { children: React.ReactNode; worker?: Worker | null };

function NavItem({ to, icon: Icon, label, active }: { to: string; icon: React.ComponentType<{ className?: string }>; label: string; active: boolean }) {
  return <Link to={to} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}><Icon className="h-4 w-4" />{label}</Link>;
}

export function AppShell({ children, worker }: AppShellProps) {
  const location = useLocation();
  const { session, logout, openTestMode } = usePilotAuth();
  const resolvedWorker = worker || null;
  const manager = isManagerWorker(resolvedWorker);
  const viewer = resolvedWorker?.access_role === 'VIEWER' || resolvedWorker?.name === 'CEO' || resolvedWorker?.name === 'COO';
  const dashboardLabel = viewer ? '운영 요약' : manager ? '팀 대시보드' : '내 대시보드';
  const landing = resolveLandingRoute(resolvedWorker);
  const active = (prefix: string) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`);

  return <div className="min-h-screen bg-slate-100 text-slate-900">
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
        <Link to={landing} className="flex min-w-0 items-center gap-2" aria-label="CON-COST 홈">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-900 text-sm font-black text-white">C</span>
          <span className="hidden min-w-0 sm:block"><span className="block truncate text-sm font-black tracking-tight">CON-COST</span><span className="block text-[10px] font-semibold text-slate-500">Unified Work Operations</span></span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="주 메뉴">
          <NavItem to="/dashboard" icon={LayoutDashboard} label={dashboardLabel} active={active('/dashboard')} />
          <NavItem to="/projects" icon={FolderKanban} label="프로젝트" active={active('/projects') && !active('/projects/') } />
          <NavItem to="/worklog/today" icon={ClipboardCheck} label="업무일지" active={active('/worklog')} />
          <NavItem to="/print/projects/year-a4" icon={History} label="보고서·이력" active={active('/print')} />
          {manager && <NavItem to="/manager/operations" icon={BarChart3} label="운영 현황" active={active('/manager')} />}
          {viewer && <NavItem to="/projects" icon={CalendarRange} label="스케줄러" active={active('/projects')} />}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 sm:inline-flex">{session?.actor.displayName || '사용자'}</span>
          {!openTestMode && <button type="button" onClick={() => void logout()} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">로그아웃</button>}
        </div>
      </div>
      <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden sm:px-6" aria-label="모바일 메뉴">
        <NavItem to="/dashboard" icon={LayoutDashboard} label={dashboardLabel} active={active('/dashboard')} />
        <NavItem to="/projects" icon={FolderKanban} label="프로젝트" active={active('/projects')} />
        <NavItem to="/worklog/today" icon={ClipboardCheck} label="업무일지" active={active('/worklog')} />
        {manager && <NavItem to="/manager/operations" icon={BarChart3} label="운영" active={active('/manager')} />}
      </nav>
    </header>
    <div className="mx-auto max-w-[1600px]">{children}</div>
    <BuildVersionIndicator />
  </div>;
}

import React from 'react';
import { Project, Task, Worker, ProjectWorkerAllocation } from '../../types';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintPageShell } from './PrintPageShell';
import {
  PrintColorMode,
  getPrintStatusBadgeStyle,
  getPrintGanttBarStyle,
  getProjectPicSummary,
} from '../../utils/printVisualTokens';
import { resolveReportProjectProgress } from '../../utils/reportProgress';
import { getAdaptiveColumnPercent, getRemainingColumnPercent } from '../../utils/printLayout';
import { parseISO, startOfMonth, endOfMonth, eachWeekOfInterval, endOfWeek, format } from 'date-fns';

export interface PrintMonthlyProjectsA4Props {
  monthStr: string;
  projects: Project[];
  tasks: Task[];
  allocationsMap?: Record<string, ProjectWorkerAllocation[]>;
  workers?: Worker[];
  colorMode?: PrintColorMode;
  lang?: 'ko' | 'vi';
  viewerName?: string;
  referenceDate?: string;
}

export const PrintMonthlyProjectsA4: React.FC<PrintMonthlyProjectsA4Props> = ({
  monthStr = new Date().toISOString().substring(0, 7),
  projects,
  tasks,
  workers = [],
  colorMode = 'color',
  lang = 'ko',
  viewerName,
  referenceDate = new Date().toISOString().substring(0, 10),
}) => {
  const isKo = lang === 'ko';
  const workerMap = new Map(workers.map((worker) => [worker.id, worker.name]));
  const monthStart = startOfMonth(parseISO(`${monthStr}-01`));
  const monthEnd = endOfMonth(monthStart);
  const monthProjects = projects.filter((project) => {
    if (!project.start_date || !project.end_date) return false;
    return parseISO(project.start_date) <= monthEnd && parseISO(project.end_date) >= monthStart;
  });
  const monthProjectIds = new Set(monthProjects.map((project) => project.id));
  const monthTasks = tasks.filter((task) => Boolean(
    monthProjectIds.has(task.project_id) &&
    task.start_date &&
    task.end_date &&
    parseISO(task.start_date) <= monthEnd &&
    parseISO(task.end_date) >= monthStart
  ));
  const activeCount = monthProjects.filter((project) => project.status !== 'COMPLETED').length;
  const completedCount = monthProjects.filter((project) => project.status === 'COMPLETED').length;
  const overdueTasksCount = monthTasks.filter(
    (task) => task.schedule_state === 'DELAYED' || Boolean(task.end_date && task.end_date < referenceDate && task.actual_progress !== 100)
  ).length;
  const blockedTasksCount = monthTasks.filter((task) => Boolean(task.is_blocked)).length;
  const completedTasksCount = monthTasks.filter(
    (task) => task.schedule_state === 'COMPLETED' || task.actual_progress === 100 || task.completion_confirmed === 1
  ).length;
  const weeksInMonth = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 });
  const projectNames = monthProjects.map((project) =>
    isKo ? project.name_ko || project.name : project.name_vi || project.name
  );
  const nameWidth = getAdaptiveColumnPercent(projectNames, 22, 29);
  const periodWidth = 13;
  const picWidth = 16;
  const statusWidth = 9;
  const progressWidth = 11;
  const timelineWidth = getRemainingColumnPercent(nameWidth + periodWidth + picWidth + statusWidth + progressWidth);

  const pageHeader = (pageNumber: number, subtitle: string) => (
    <PrintHeader
      title={isKo ? `${monthStr} 월간 프로젝트 보고서` : `Báo cáo dự án tháng ${monthStr}`}
      subtitle={subtitle}
      referenceDate={referenceDate}
      authorName={viewerName}
      pageNumber={pageNumber}
      totalPages={2}
      colorMode={colorMode}
      lang={lang}
    />
  );

  return (
    <div className="print-template-a4-monthly space-y-6 print:space-y-0">
      <PrintPageShell paper="a4" orientation="landscape" colorMode={colorMode}>
        <div className="flex flex-col justify-between w-full h-full text-slate-900 font-sans text-xs">
          <div>
            {pageHeader(1, isKo ? '경영 요약 · 프로젝트 포트폴리오' : 'Tóm tắt điều hành · Danh mục dự án')}

            <div className="grid grid-cols-6 gap-2 mb-3 text-center text-[10px]">
              {[
                [isKo ? '대상 프로젝트' : 'Dự án', monthProjects.length, 'text-slate-900'],
                [isKo ? '진행 프로젝트' : 'Đang làm', activeCount, 'text-blue-700'],
                [isKo ? '완료 프로젝트' : 'Hoàn thành', completedCount, 'text-emerald-700'],
                [isKo ? '완료 작업' : 'Task xong', completedTasksCount, 'text-emerald-700'],
                [isKo ? '기한 경과 작업' : 'Quá hạn', overdueTasksCount, 'text-amber-800'],
                [isKo ? '막힘 작업' : 'Bị chặn', blockedTasksCount, 'text-rose-700'],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="bg-slate-50 border border-slate-200 rounded p-1.5">
                  <span className="text-[9px] text-slate-500 font-medium block">{label}</span>
                  <span className={`font-extrabold text-xs ${tone}`}>{value}</span>
                </div>
              ))}
            </div>

            <h3 className="font-bold text-slate-800 text-xs mb-1.5 flex items-center justify-between">
              <span>{isKo ? '월간 프로젝트 포트폴리오' : 'Danh mục dự án trong tháng'}</span>
              <span className="text-[10px] font-normal text-slate-500">{monthProjects.length}{isKo ? '개 프로젝트' : ' dự án'}</span>
            </h3>
            <table data-testid="monthly-portfolio-table" className="w-full table-fixed border-collapse border border-slate-300 text-[10px]">
              <colgroup>
                <col style={{ width: `${nameWidth}%` }} />
                <col style={{ width: `${periodWidth}%` }} />
                <col style={{ width: `${picWidth}%` }} />
                <col style={{ width: `${statusWidth}%` }} />
                <col style={{ width: `${progressWidth}%` }} />
                <col style={{ width: `${timelineWidth}%` }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold">
                  <th className="border border-slate-300 px-2 py-1 text-left">{isKo ? '프로젝트명' : 'Tên dự án'}</th>
                  <th className="border border-slate-300 px-1 py-1">{isKo ? '기간' : 'Thời gian'}</th>
                  <th className="border border-slate-300 px-2 py-1 text-left">PIC</th>
                  <th className="border border-slate-300 px-1 py-1">{isKo ? '상태' : 'Trạng thái'}</th>
                  <th className="border border-slate-300 px-1 py-1">{isKo ? '예정 / 실제' : 'KH / Thực'}</th>
                  <th className="border border-slate-300 px-1 py-1">{isKo ? '주차별 위치' : 'Theo tuần'}</th>
                </tr>
              </thead>
              <tbody>
                {monthProjects.map((project) => {
                  const projectTasks = tasks.filter((task) => task.project_id === project.id);
                  const progress = resolveReportProjectProgress(project, projectTasks);
                  const badge = getPrintStatusBadgeStyle(progress.scheduleState === 'COMPLETED' ? 'COMPLETED' : project.status, colorMode, lang);
                  const bar = getPrintGanttBarStyle(project.status, colorMode);
                  const name = isKo ? project.name_ko || project.name : project.name_vi || project.name;
                  const start = parseISO(project.start_date || `${monthStr}-01`);
                  const end = parseISO(project.end_date || `${monthStr}-01`);
                  return (
                    <tr key={project.id}>
                      <td className="border border-slate-300 px-2 py-1.5 font-bold break-words">{name}</td>
                      <td className="border border-slate-300 px-1 py-1 text-center font-mono text-[9px] whitespace-nowrap">
                        {project.start_date?.substring(2)} ~ {project.end_date?.substring(2)}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-slate-700 break-words">{getProjectPicSummary(projectTasks, workerMap, lang)}</td>
                      <td className="border border-slate-300 px-1 py-1 text-center">
                        <span className="px-1 py-0.5 rounded text-[9px] font-bold border inline-block" style={{ backgroundColor: badge.backgroundColor, borderColor: badge.borderColor, color: badge.textColor }}>
                          {badge.label}
                        </span>
                      </td>
                      <td data-testid={`monthly-progress-${project.id}`} className="border border-slate-300 px-1 py-1 text-center font-mono whitespace-nowrap">
                        <span className="text-blue-700">{progress.plannedProgress}%</span> / <span className="text-emerald-700 font-bold">{progress.actualProgress}%</span>
                      </td>
                      <td className="border border-slate-300 px-1 py-1">
                        <div className="grid gap-0.5 h-3" style={{ gridTemplateColumns: `repeat(${weeksInMonth.length}, minmax(0, 1fr))` }}>
                          {weeksInMonth.map((week, index) => {
                            const active = start <= endOfWeek(week, { weekStartsOn: 1 }) && end >= week;
                            return <span key={index} className="rounded-xs border" style={{ backgroundColor: active ? bar.backgroundColor : '#F1F5F9', borderColor: active ? bar.borderColor : '#E2E8F0', backgroundImage: active ? bar.pattern || 'none' : 'none' }} />;
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
              <div className="border border-slate-200 rounded bg-slate-50 p-2">
                <div className="font-bold text-slate-800 mb-1">{isKo ? '월간 실행률' : 'Tỷ lệ thực hiện'}</div>
                <div className="text-slate-600">{isKo ? '완료 작업' : 'Task hoàn thành'} <b className="text-emerald-700">{completedTasksCount}</b> / {monthTasks.length}</div>
              </div>
              <div className="border border-slate-200 rounded bg-slate-50 p-2">
                <div className="font-bold text-slate-800 mb-1">{isKo ? '일정 리스크' : 'Rủi ro tiến độ'}</div>
                <div className="text-slate-600">{isKo ? '기한 경과' : 'Quá hạn'} <b className="text-amber-700">{overdueTasksCount}</b> · {isKo ? '막힘' : 'Bị chặn'} <b className="text-rose-700">{blockedTasksCount}</b></div>
              </div>
              <div className="border border-slate-200 rounded bg-slate-50 p-2">
                <div className="font-bold text-slate-800 mb-1">{isKo ? '다음 보고 포인트' : 'Điểm theo dõi tiếp theo'}</div>
                <div className="text-slate-600">{isKo ? '진행 프로젝트의 예정·실제 공정 차이를 주차별로 점검' : 'Theo dõi chênh lệch kế hoạch/thực tế theo tuần'}</div>
              </div>
            </div>
          </div>
          <PrintFooter colorMode={colorMode} lang={lang} viewerName={viewerName} />
        </div>
      </PrintPageShell>

      <PrintPageShell paper="a4" orientation="landscape" colorMode={colorMode}>
        <div className="flex flex-col justify-between w-full h-full text-slate-900 font-sans text-xs">
          <div>
            {pageHeader(2, isKo ? '주차별 실행 현황 · 주요 작업 상세' : 'Thực hiện theo tuần · Chi tiết công việc')}
            <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: `repeat(${weeksInMonth.length}, minmax(0, 1fr))` }}>
              {weeksInMonth.map((week, index) => {
                const weekEnd = endOfWeek(week, { weekStartsOn: 1 });
                const weekTasks = monthTasks.filter((task) => Boolean(task.start_date && task.end_date && parseISO(task.start_date) <= weekEnd && parseISO(task.end_date) >= week));
                const weekDone = weekTasks.filter((task) => task.schedule_state === 'COMPLETED' || task.actual_progress === 100).length;
                return (
                  <div key={index} className="border border-slate-200 rounded bg-slate-50 p-2">
                    <div className="font-bold text-slate-800">{index + 1}{isKo ? '주차' : ' tuần'}</div>
                    <div className="text-[9px] text-slate-500 font-mono">{format(week, 'MM/dd')}–{format(weekEnd, 'MM/dd')}</div>
                    <div className="mt-1 text-[10px]">{isKo ? '작업' : 'Task'} <b>{weekTasks.length}</b> · {isKo ? '완료' : 'Xong'} <b className="text-emerald-700">{weekDone}</b></div>
                  </div>
                );
              })}
            </div>

            <h3 className="font-bold text-slate-800 text-xs mb-1.5">{isKo ? '주요 작업 실행 상세' : 'Chi tiết công việc chính'}</h3>
            <table className="w-full table-fixed border-collapse border border-slate-300 text-[9.5px]">
              <colgroup>
                <col style={{ width: '22%' }} /><col style={{ width: '31%' }} /><col style={{ width: '13%' }} />
                <col style={{ width: '14%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="border border-slate-700 px-2 py-1 text-left">{isKo ? '프로젝트' : 'Dự án'}</th>
                  <th className="border border-slate-700 px-2 py-1 text-left">{isKo ? '작업명' : 'Công việc'}</th>
                  <th className="border border-slate-700 px-2 py-1 text-left">PIC</th>
                  <th className="border border-slate-700 px-1 py-1">{isKo ? '기간' : 'Thời gian'}</th>
                  <th className="border border-slate-700 px-1 py-1">{isKo ? '상태' : 'Trạng thái'}</th>
                  <th className="border border-slate-700 px-1 py-1">{isKo ? '실제 공정' : 'Thực tế'}</th>
                </tr>
              </thead>
              <tbody>
                {monthTasks.slice(0, 14).map((task) => {
                  const project = monthProjects.find((item) => item.id === task.project_id);
                  const taskName = isKo ? task.task_name_ko || task.task_name : task.task_name_vi || task.task_name;
                  const workerName = workerMap.get(task.primary_worker_id || '') || task.worker_name || '-';
                  const status = task.schedule_state || (task.actual_progress === 100 ? 'COMPLETED' : 'NOT_STARTED');
                  const badge = getPrintStatusBadgeStyle(status, colorMode, lang);
                  return (
                    <tr key={task.id}>
                      <td className="border border-slate-300 px-2 py-1 font-semibold break-words">{isKo ? project?.name_ko || project?.name : project?.name_vi || project?.name}</td>
                      <td className="border border-slate-300 px-2 py-1 break-words">{taskName}</td>
                      <td className="border border-slate-300 px-2 py-1 break-words">{workerName}</td>
                      <td className="border border-slate-300 px-1 py-1 text-center font-mono text-[8.5px] whitespace-nowrap">{task.start_date?.substring(5)} ~ {task.end_date?.substring(5)}</td>
                      <td className="border border-slate-300 px-1 py-1 text-center"><span className="px-1 py-0.5 rounded border font-bold" style={{ backgroundColor: badge.backgroundColor, borderColor: badge.borderColor, color: badge.textColor }}>{badge.label}</span></td>
                      <td className="border border-slate-300 px-1 py-1 text-center font-mono font-bold text-emerald-700">{task.actual_progress ?? 0}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PrintFooter colorMode={colorMode} lang={lang} viewerName={viewerName} />
        </div>
      </PrintPageShell>
    </div>
  );
};

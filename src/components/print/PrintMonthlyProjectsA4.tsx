// src/components/print/PrintMonthlyProjectsA4.tsx
import React from 'react';
import { Project, Task, Worker, ProjectWorkerAllocation } from '../../types';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintColorMode, getPrintStatusBadgeStyle, getPrintGanttBarStyle, getProjectPicSummary } from '../../utils/printVisualTokens';
import { resolveReportProjectProgress } from '../../utils/reportProgress';
import { parseISO, startOfMonth, endOfMonth, eachWeekOfInterval } from 'date-fns';

export interface PrintMonthlyProjectsA4Props {
  monthStr: string; // YYYY-MM
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
  allocationsMap = {},
  workers = [],
  colorMode = 'color',
  lang = 'ko',
  viewerName,
  referenceDate = new Date().toISOString().substring(0, 10),
}) => {
  const isKo = lang === 'ko';
  const workerMap = new Map(workers.map((w) => [w.id, w.name]));

  // Month date range
  const monthStart = startOfMonth(parseISO(`${monthStr}-01`));
  const monthEnd = endOfMonth(monthStart);

  // Filter projects overlapping this month
  const monthProjects = projects.filter((p) => {
    if (!p.start_date || !p.end_date) return false;
    const pStart = parseISO(p.start_date);
    const pEnd = parseISO(p.end_date);
    return pStart <= monthEnd && pEnd >= monthStart;
  });

  // Calculate Monthly KPIs
  const activeCount = monthProjects.filter((p) => p.status !== 'COMPLETED').length;
  const completedCount = monthProjects.filter((p) => p.status === 'COMPLETED' || p.completed_at).length;
  const verificationNeededCount = monthProjects.filter((p) => {
    if (p.status === 'COMPLETED') return false;
    const pTasks = tasks.filter((t) => t.project_id === p.id);
    return pTasks.length > 0 && pTasks.every((t) => t.actual_progress === 100 || t.schedule_state === 'COMPLETED');
  }).length;

  const missingAllocCount = monthProjects.filter((p) => {
    const allocs = allocationsMap[p.id] || [];
    return allocs.length === 0;
  }).length;

  // Task level issues
  const monthTasks = tasks.filter((t) => {
    const p = monthProjects.find((mp) => mp.id === t.project_id);
    return !!p;
  });
  const overdueTasksCount = monthTasks.filter(
    (t) => t.schedule_state === 'DELAYED' || (t.end_date && t.end_date < referenceDate && t.actual_progress !== 100)
  ).length;
  const blockedTasksCount = monthTasks.filter((t) => Boolean(t.is_blocked)).length;

  // Weeks in month for compressed 4-week timeline
  const weeksInMonth = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 });

  return (
    <div className="print-template-a4-monthly flex flex-col justify-between w-full h-full text-slate-900 font-sans text-xs">
      <div>
        <PrintHeader
          title={isKo ? `${monthStr} 월간 전체 프로젝트 보고서` : `Báo cáo dự án hàng tháng ${monthStr}`}
          subtitle={isKo ? '경영진/팀 보고용 요약 (A4 Monthly Summary)' : 'Báo cáo tổng hợp hàng tháng'}
          referenceDate={referenceDate}
          authorName={viewerName}
          colorMode={colorMode}
          lang={lang}
        />

        {/* Monthly KPI Summary Cards */}
        <div className="grid grid-cols-7 gap-1.5 mb-3 text-center text-[10px]">
          <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
            <span className="text-[9px] text-slate-500 font-medium block">{isKo ? '진행 프로젝트' : 'Đang làm'}</span>
            <span className="font-extrabold text-blue-700 text-xs">{activeCount}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
            <span className="text-[9px] text-slate-500 font-medium block">{isKo ? '완료 프로젝트' : 'Đã xong'}</span>
            <span className="font-extrabold text-emerald-700 text-xs">{completedCount}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
            <span className="text-[9px] text-slate-500 font-medium block">{isKo ? '완료확인 필요' : 'Cần xác nhận'}</span>
            <span className="font-extrabold text-purple-700 text-xs">{verificationNeededCount}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
            <span className="text-[9px] text-slate-500 font-medium block">{isKo ? '투입률 미설정' : 'Chưa phân công'}</span>
            <span className="font-extrabold text-amber-700 text-xs">{missingAllocCount}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
            <span className="text-[9px] text-slate-500 font-medium block">{isKo ? '과배정 Worker' : 'Quá tải'}</span>
            <span className="font-extrabold text-slate-700 text-xs">0</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
            <span className="text-[9px] text-slate-500 font-medium block">{isKo ? '기한 경과 Task' : 'Trễ hạn'}</span>
            <span className="font-extrabold text-amber-800 text-xs">{overdueTasksCount}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
            <span className="text-[9px] text-slate-500 font-medium block">{isKo ? 'Blocked Task' : 'Tắc nghẽn'}</span>
            <span className="font-extrabold text-rose-700 text-xs">{blockedTasksCount}</span>
          </div>
        </div>

        {/* Projects Table */}
        <div className="mb-3">
          <h3 className="font-bold text-slate-800 text-xs mb-1.5 flex items-center justify-between">
            <span>{isKo ? '월간 진행 프로젝트 현황' : 'Danh sách dự án trong tháng'}</span>
            <span className="text-[10px] font-normal text-slate-500">
              {isKo ? `총 ${monthProjects.length}개 프로젝트` : `Tổng số ${monthProjects.length} dự án`}
            </span>
          </h3>

          <table className="w-full border-collapse border border-slate-300 text-[10.5px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-300">
                <th className="border border-slate-300 px-2 py-1 text-left">{isKo ? '프로젝트명' : 'Tên dự án'}</th>
                <th className="border border-slate-300 px-2 py-1 text-center w-24">{isKo ? '기간' : 'Thời gian'}</th>
                <th className="border border-slate-300 px-2 py-1 text-left w-24">{isKo ? 'PIC (PRIMARY)' : 'PIC chính'}</th>
                <th className="border border-slate-300 px-2 py-1 text-center w-20">{isKo ? '상태' : 'Trạng thái'}</th>
                <th className="border border-slate-300 px-2 py-1 text-center w-24">{isKo ? '예정/실제 공정' : 'Tiến độ'}</th>
                <th className="border border-slate-300 px-2 py-1 text-center w-28">{isKo ? '월간 위치 (4주)' : 'Tiến trình tuần'}</th>
              </tr>
            </thead>
            <tbody>
              {monthProjects.map((p) => {
                const pTasks = tasks.filter((t) => t.project_id === p.id);
                const reportProgress = resolveReportProjectProgress(p, pTasks);
                const badgeStyle = getPrintStatusBadgeStyle(reportProgress.scheduleState === 'COMPLETED' ? 'COMPLETED' : p.status, colorMode, lang);
                // V2 Domain: PIC derived from Task PRIMARY
                const picName = getProjectPicSummary(pTasks, workerMap, lang);
                const pName = isKo ? (p.name_ko || p.name) : (p.name_vi || p.name);

                const pStart = p.start_date ? parseISO(p.start_date) : monthStart;
                const pEnd = p.end_date ? parseISO(p.end_date) : monthEnd;
                const barStyle = getPrintGanttBarStyle(p.status, colorMode);

                return (
                  <tr key={p.id} className="hover:bg-slate-50 border-b border-slate-200">
                    <td className="border border-slate-300 px-2 py-1 font-bold text-slate-900">{pName}</td>
                    <td className="border border-slate-300 px-1 py-1 text-center font-mono text-[9.5px]">
                      {p.start_date?.substring(5)} ~ {p.end_date?.substring(5)}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-slate-700 font-medium">{picName}</td>
                    <td className="border border-slate-300 px-1 py-1 text-center">
                      <span
                        className="px-1.5 py-0.5 rounded text-[9.5px] font-bold border inline-block"
                        style={{
                          backgroundColor: badgeStyle.backgroundColor,
                          borderColor: badgeStyle.borderColor,
                          color: badgeStyle.textColor,
                        }}
                      >
                        {badgeStyle.label}
                      </span>
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-slate-700 font-medium">{picName}</td>
                    <td className="border border-slate-300 px-1 py-1 text-center font-mono">
                      <span className="text-blue-700">{reportProgress.plannedProgress}%</span> /{' '}
                      <span className="text-emerald-700 font-bold">{reportProgress.actualProgress}%</span>
                    </td>
                    <td className="border border-slate-300 px-1 py-1 text-center">
                      <div className="grid grid-cols-4 gap-0.5 h-3">
                        {weeksInMonth.slice(0, 4).map((wkDate, idx) => {
                          const isActiveInWeek = pStart <= wkDate && pEnd >= wkDate;
                          return (
                            <div
                              key={idx}
                              className="h-full rounded-xs border border-slate-200"
                              style={{
                                backgroundColor: isActiveInWeek ? barStyle.backgroundColor : '#F1F5F9',
                                borderColor: isActiveInWeek ? barStyle.borderColor : '#E2E8F0',
                                backgroundImage: isActiveInWeek ? barStyle.pattern || 'none' : 'none',
                              }}
                            />
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <PrintFooter colorMode={colorMode} lang={lang} viewerName={viewerName} />
    </div>
  );
};

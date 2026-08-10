// src/components/print/PrintHalfYearProjectsA4.tsx
import React from 'react';
import { Project, Task, Worker } from '../../types';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintColorMode, getPrintStatusBadgeStyle, getPrintGanttBarStyle } from '../../utils/printVisualTokens';
import { calculateProjectProgress } from '../../utils/progressCalculator';
import { parseISO, format, addMonths, startOfMonth, endOfMonth } from 'date-fns';

export interface PrintHalfYearProjectsA4Props {
  startMonthStr: string; // YYYY-MM
  projects: Project[];
  tasks: Task[];
  workers?: Worker[];
  colorMode?: PrintColorMode;
  lang?: 'ko' | 'vi';
  viewerName?: string;
  referenceDate?: string;
}

export const PrintHalfYearProjectsA4: React.FC<PrintHalfYearProjectsA4Props> = ({
  startMonthStr = '2026-07',
  projects,
  tasks,
  workers = [],
  colorMode = 'color',
  lang = 'ko',
  viewerName,
  referenceDate = new Date().toISOString().substring(0, 10),
}) => {
  const isKo = lang === 'ko';
  const workerMap = new Map(workers.map((w) => [w.id, w.name]));

  // Generate 6 months sequence
  const startMonthDate = startOfMonth(parseISO(`${startMonthStr}-01`));
  const monthsSequence: Date[] = [];
  for (let i = 0; i < 6; i++) {
    monthsSequence.push(addMonths(startMonthDate, i));
  }

  const periodEndMonth = endOfMonth(monthsSequence[5]);

  // Filter overlapping projects
  const periodProjects = projects.filter((p) => {
    if (!p.start_date || !p.end_date) return false;
    const pStart = parseISO(p.start_date);
    const pEnd = parseISO(p.end_date);
    return pStart <= periodEndMonth && pEnd >= startMonthDate;
  });

  return (
    <div className="print-template-a4-halfyear flex flex-col justify-between w-full h-full text-slate-900 font-sans text-xs">
      <div>
        <PrintHeader
          title={isKo ? `반기 전체 프로젝트 요약 보고서 (${startMonthStr} ~ ${format(monthsSequence[5], 'yyyy-MM')})` : `Báo cáo bán niên (${startMonthStr} ~ ${format(monthsSequence[5], 'yyyy-MM')})`}
          subtitle={isKo ? '6개월 추진 일정 및 공정 현황 (A4 Half-Year Summary)' : 'Tiến độ 6 tháng các dự án'}
          referenceDate={referenceDate}
          authorName={viewerName}
          colorMode={colorMode}
          lang={lang}
        />

        {/* Half-Year Summary KPI Cards */}
        <div className="grid grid-cols-4 gap-2 mb-3 text-center text-[10.5px]">
          <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
            <span className="text-[9.5px] text-slate-500 font-medium block">{isKo ? '대상 기간 프로젝트' : 'Tổng số dự án'}</span>
            <span className="font-extrabold text-slate-900 text-xs">{periodProjects.length}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
            <span className="text-[9.5px] text-slate-500 font-medium block">{isKo ? '진행 프로젝트' : 'Đang thực hiện'}</span>
            <span className="font-extrabold text-blue-700 text-xs">
              {periodProjects.filter((p) => p.status !== 'COMPLETED').length}
            </span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
            <span className="text-[9.5px] text-slate-500 font-medium block">{isKo ? '완료 프로젝트' : 'Đã hoàn thành'}</span>
            <span className="font-extrabold text-emerald-700 text-xs">
              {periodProjects.filter((p) => p.status === 'COMPLETED' || p.completed_at).length}
            </span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
            <span className="text-[9.5px] text-slate-500 font-medium block">{isKo ? '평균 공정률' : 'Tiến độ TB'}</span>
            <span className="font-extrabold text-purple-700 text-xs">
              {periodProjects.length > 0
                ? Math.round(
                    periodProjects.reduce((acc, p) => acc + calculateProjectProgress(p, tasks.filter((t) => t.project_id === p.id)).actual_progress, 0) /
                      periodProjects.length
                  )
                : 0}
              %
            </span>
          </div>
        </div>

        {/* 6-Month Projects Table */}
        <div className="mb-3">
          <table className="w-full border-collapse border border-slate-300 text-[10.5px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-300">
                <th className="border border-slate-300 px-2 py-1 text-left">{isKo ? '프로젝트명' : 'Tên dự án'}</th>
                <th className="border border-slate-300 px-2 py-1 text-center w-24">{isKo ? '기간' : 'Thời gian'}</th>
                <th className="border border-slate-300 px-2 py-1 text-center w-16">{isKo ? '상태' : 'Trạng thái'}</th>
                <th className="border border-slate-300 px-2 py-1 text-left w-20">{isKo ? '담당자' : 'PIC'}</th>
                <th className="border border-slate-300 px-2 py-1 text-center w-16">{isKo ? '공정률' : 'Tiến độ'}</th>
                {monthsSequence.map((mDate, idx) => (
                  <th key={idx} className="border border-slate-300 px-1 py-1 text-center w-10 text-[9.5px]">
                    {format(mDate, 'M월')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periodProjects.map((p) => {
                const pTasks = tasks.filter((t) => t.project_id === p.id);
                const progress = calculateProjectProgress(p, pTasks);
                const badgeStyle = getPrintStatusBadgeStyle(p.status, colorMode, lang);
                const picName = p.participating_workers?.[0] || '-';
                const pName = isKo ? (p.name_ko || p.name) : (p.name_vi || p.name);
                const pStart = p.start_date ? parseISO(p.start_date) : startMonthDate;
                const pEnd = p.end_date ? parseISO(p.end_date) : periodEndMonth;
                const barStyle = getPrintGanttBarStyle(p.status, colorMode);

                return (
                  <tr key={p.id} className="hover:bg-slate-50 border-b border-slate-200">
                    <td className="border border-slate-300 px-2 py-1 font-bold text-slate-900">{pName}</td>
                    <td className="border border-slate-300 px-1 py-1 text-center font-mono text-[9.5px]">
                      {p.start_date?.substring(5)} ~ {p.end_date?.substring(5)}
                    </td>
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
                    <td className="border border-slate-300 px-1 py-1 text-center font-mono font-bold text-emerald-700">
                      {progress.actual_progress}%
                    </td>

                    {/* 6 Monthly Columns Bar */}
                    {monthsSequence.map((mDate, idx) => {
                      const mStart = startOfMonth(mDate);
                      const mEnd = endOfMonth(mDate);
                      const isOverlap = pStart <= mEnd && pEnd >= mStart;

                      return (
                        <td key={idx} className="border border-slate-300 p-0.5 text-center">
                          {isOverlap ? (
                            <div
                              className="w-full h-3.5 rounded-xs border"
                              style={{
                                backgroundColor: barStyle.backgroundColor,
                                borderColor: barStyle.borderColor,
                                backgroundImage: barStyle.pattern || 'none',
                              }}
                            />
                          ) : (
                            <div className="w-full h-3.5 bg-slate-50 border border-slate-100" />
                          )}
                        </td>
                      );
                    })}
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

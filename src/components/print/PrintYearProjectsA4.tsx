// src/components/print/PrintYearProjectsA4.tsx
import React from 'react';
import { Project, Task, Worker } from '../../types';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintColorMode, getPrintStatusBadgeStyle, getPrintGanttBarStyle } from '../../utils/printVisualTokens';
import { resolveReportProjectProgress } from '../../utils/reportProgress';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';

export interface PrintYearProjectsA4Props {
  yearStr?: string; // YYYY
  projects: Project[];
  tasks: Task[];
  workers?: Worker[];
  colorMode?: PrintColorMode;
  lang?: 'ko' | 'vi';
  viewerName?: string;
  referenceDate?: string;
}

export const PrintYearProjectsA4: React.FC<PrintYearProjectsA4Props> = ({
  yearStr = new Date().getFullYear().toString(),
  projects,
  tasks,
  workers = [],
  colorMode = 'color',
  lang = 'ko',
  viewerName,
  referenceDate = new Date().toISOString().substring(0, 10),
}) => {
  const isKo = lang === 'ko';

  // Generate 12 months sequence for the year
  const monthsSequence: Date[] = [];
  for (let m = 0; m < 12; m++) {
    const mStr = `${yearStr}-${String(m + 1).padStart(2, '0')}-01`;
    monthsSequence.push(parseISO(mStr));
  }

  const yearStart = startOfMonth(monthsSequence[0]);
  const yearEnd = endOfMonth(monthsSequence[11]);

  // Filter projects overlapping this year
  const yearProjects = projects.filter((p) => {
    if (!p.start_date || !p.end_date) return false;
    const pStart = parseISO(p.start_date);
    const pEnd = parseISO(p.end_date);
    return pStart <= yearEnd && pEnd >= yearStart;
  });

  return (
    <div className="print-template-a4-year flex flex-col justify-between w-full h-full text-slate-900 font-sans text-xs">
      <div>
        <PrintHeader
          title={isKo ? `${yearStr}년 연간 경영 보고용 연간 로드맵 (Annual Roadmap)` : `Lộ trình tổng thể năm ${yearStr}`}
          subtitle={isKo ? '12개월전체 프로젝트 추진 일정 및 월별 진행 구간 (A4 Year Summary)' : 'Tiến trình 12 tháng dự án trong năm'}
          referenceDate={referenceDate}
          authorName={viewerName}
          colorMode={colorMode}
          lang={lang}
        />

        {/* Executive Year KPI Bar */}
        <div className="grid grid-cols-4 gap-2 mb-3 text-center text-[10px]">
          <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
            <span className="text-[9px] text-slate-500 font-medium block">{isKo ? '연간 총 프로젝트' : 'Tổng số dự án'}</span>
            <span className="font-extrabold text-slate-900 text-xs">{yearProjects.length}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
            <span className="text-[9px] text-slate-500 font-medium block">{isKo ? '완료 프로젝트' : 'Đã hoàn thành'}</span>
            <span className="font-extrabold text-emerald-700 text-xs">
              {yearProjects.filter((p) => p.status === 'COMPLETED' || p.completed_at).length}
            </span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
            <span className="text-[9px] text-slate-500 font-medium block">{isKo ? '진행 중' : 'Đang làm'}</span>
            <span className="font-extrabold text-blue-700 text-xs">
              {yearProjects.filter((p) => p.status !== 'COMPLETED').length}
            </span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
            <span className="text-[9px] text-slate-500 font-medium block">{isKo ? '연간 목표 달성률' : 'Tỷ lệ hoàn thành'}</span>
            <span className="font-extrabold text-purple-700 text-xs">
              {yearProjects.length > 0
                ? Math.round((yearProjects.filter((p) => p.status === 'COMPLETED' || p.completed_at).length / yearProjects.length) * 100)
                : 0}
              %
            </span>
          </div>
        </div>

        {/* 12-Month Executive Matrix Table */}
        <div className="mb-3">
          <table className="w-full border-collapse border border-slate-300 text-[10px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-300">
                <th className="border border-slate-300 px-2 py-1 text-left">{isKo ? '프로젝트명' : 'Tên dự án'}</th>
                <th className="border border-slate-300 px-1 py-1 text-center w-20">{isKo ? '기간' : 'Thời gian'}</th>
                <th className="border border-slate-300 px-1 py-1 text-center w-14">{isKo ? '상태' : 'Trạng thái'}</th>
                <th className="border border-slate-300 px-1 py-1 text-center w-12">{isKo ? '공정' : 'Tiến độ'}</th>
                {monthsSequence.map((mDate, idx) => (
                  <th key={idx} className="border border-slate-300 px-0.5 py-1 text-center font-mono text-[9px] w-6">
                    {idx + 1}월
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {yearProjects.map((p) => {
                const pTasks = tasks.filter((t) => t.project_id === p.id);
                const reportProgress = resolveReportProjectProgress(p, pTasks);
                const badgeStyle = getPrintStatusBadgeStyle(reportProgress.scheduleState === 'COMPLETED' ? 'COMPLETED' : p.status, colorMode, lang);
                const pName = isKo ? (p.name_ko || p.name) : (p.name_vi || p.name);
                const pStart = p.start_date ? parseISO(p.start_date) : yearStart;
                const pEnd = p.end_date ? parseISO(p.end_date) : yearEnd;
                const barStyle = getPrintGanttBarStyle(p.status, colorMode);

                return (
                  <tr key={p.id} className="hover:bg-slate-50 border-b border-slate-200">
                    <td className="border border-slate-300 px-2 py-1 font-bold text-slate-900 truncate max-w-[140px]">
                      {pName}
                    </td>
                    <td className="border border-slate-300 px-1 py-1 text-center font-mono text-[9px]">
                      {p.start_date?.substring(2)} ~ {p.end_date?.substring(5)}
                    </td>
                    <td className="border border-slate-300 px-1 py-1 text-center">
                      <span
                        className="px-1 py-0.5 rounded text-[9px] font-bold border inline-block"
                        style={{
                          backgroundColor: badgeStyle.backgroundColor,
                          borderColor: badgeStyle.borderColor,
                          color: badgeStyle.textColor,
                        }}
                      >
                        {isKo ? reportProgress.statusDisplayKo : reportProgress.statusDisplayVi}
                      </span>
                    </td>
                    <td className="border border-slate-300 px-1 py-1 text-center font-mono font-bold text-emerald-700 text-[9.5px]">
                      {reportProgress.actualProgress}%
                    </td>

                    {/* 12 Months Columns */}
                    {monthsSequence.map((mDate, idx) => {
                      const mStart = startOfMonth(mDate);
                      const mEnd = endOfMonth(mDate);
                      const isOverlap = pStart <= mEnd && pEnd >= mStart;

                      return (
                        <td key={idx} className="border border-slate-300 p-0.5 text-center">
                          {isOverlap ? (
                            <div
                              className="w-full h-3 rounded-xs border"
                              style={{
                                backgroundColor: barStyle.backgroundColor,
                                borderColor: barStyle.borderColor,
                                backgroundImage: barStyle.pattern || 'none',
                              }}
                            />
                          ) : (
                            <div className="w-full h-3 bg-slate-50 border border-slate-100" />
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

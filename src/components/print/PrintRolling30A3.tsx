// src/components/print/PrintRolling30A3.tsx
import React from 'react';
import { Project, Task, Worker, CountryHoliday, CalendarOverride } from '../../types';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintColorMode, getPrintStatusBadgeStyle, getPrintGanttBarStyle, resolvePrintCalendarVisualState, getProjectPicSummary, PRINT_DAY_CELL_STYLE } from '../../utils/printVisualTokens';
import { calculateProjectProgress } from '../../utils/progressCalculator';
import { parseISO, format, addDays } from 'date-fns';

export interface PrintRolling30A3Props {
  startDateStr?: string; // YYYY-MM-DD
  mode?: 'today' | 'custom';
  projects: Project[];
  tasks: Task[];
  workers?: Worker[];
  krHolidays?: CountryHoliday[];
  vnHolidays?: CountryHoliday[];
  calendarOverrides?: CalendarOverride[];
  colorMode?: PrintColorMode;
  lang?: 'ko' | 'vi';
  viewerName?: string;
  referenceDate?: string;
}

export const PrintRolling30A3: React.FC<PrintRolling30A3Props> = ({
  startDateStr,
  mode = 'today',
  projects,
  tasks,
  workers = [],
  krHolidays = [],
  vnHolidays = [],
  calendarOverrides = [],
  colorMode = 'color',
  lang = 'ko',
  viewerName,
  referenceDate = new Date().toISOString().substring(0, 10),
}) => {
  const isKo = lang === 'ko';
  const workerMap = new Map(workers.map((w) => [w.id, w.name]));

  const baseStart = startDateStr ? parseISO(startDateStr) : parseISO(referenceDate);
  const baseEnd = addDays(baseStart, 29);

  // Generate 30 days array
  const daysArray: Date[] = [];
  for (let i = 0; i < 30; i++) {
    daysArray.push(addDays(baseStart, i));
  }

  // Filter overlapping projects
  const active30Projects = projects.filter((p) => {
    if (!p.start_date || !p.end_date) return false;
    const pStart = parseISO(p.start_date);
    const pEnd = parseISO(p.end_date);
    return pStart <= baseEnd && pEnd >= baseStart;
  });

  const subtitleStr =
    mode === 'custom'
      ? isKo
        ? `출력 기준: 사용자 지정 30일 일정표 (${format(baseStart, 'yyyy-MM-dd')} ~ ${format(baseEnd, 'yyyy-MM-dd')})`
        : `Lịch trình 30 ngày chỉ định (${format(baseStart, 'yyyy-MM-dd')} ~ ${format(baseEnd, 'yyyy-MM-dd')})`
      : isKo
      ? `출력 기준: 오늘 기준 30일 전체 프로젝트 일정표 (${format(baseStart, 'yyyy-MM-dd')} ~ ${format(baseEnd, 'yyyy-MM-dd')})`
      : `Lịch trình 30 ngày từ hôm nay (${format(baseStart, 'yyyy-MM-dd')} ~ ${format(baseEnd, 'yyyy-MM-dd')})`;

  return (
    <div className="print-template-a3-rolling flex flex-col justify-between w-full h-full text-slate-900 font-sans text-xs">
      <div>
        <PrintHeader
          title={isKo ? '30일 전체 프로젝트 일정표 (A3 Rolling 30 Schedule)' : 'Lịch trình 30 ngày tổng thể dự án'}
          subtitle={subtitleStr}
          referenceDate={referenceDate}
          authorName={viewerName}
          colorMode={colorMode}
          lang={lang}
        />

        {/* Top Summary Bar */}
        <div className="flex items-center justify-between bg-slate-50 border border-slate-300 rounded p-2 mb-2 text-xs">
          <div>
            <span className="text-slate-500 font-medium">
              {isKo ? '해당 기간 참여 프로젝트: ' : 'Số dự án trong kỳ: '}
            </span>
            <strong className="text-slate-900">{active30Projects.length}개</strong>
          </div>

          <div className="font-mono text-xs text-slate-700">
            <span>{format(baseStart, 'yyyy-MM-dd')}</span>
            <span className="mx-1 text-slate-400">~</span>
            <span>{format(baseEnd, 'yyyy-MM-dd')}</span>
          </div>
        </div>

        {/* 30-Day Gantt Matrix */}
        <div className="w-full overflow-x-auto mb-2 border border-slate-300 rounded">
          <table className="w-full border-collapse text-[10.5px]">
            <thead>
              <tr className="bg-slate-800 text-white font-bold border-b border-slate-700">
                <th className="border-r border-slate-700 px-2 py-1 text-left w-48">{isKo ? '프로젝트명' : 'Tên dự án'}</th>
                <th className="border-r border-slate-700 px-1 py-1 text-center w-24">{isKo ? '기간' : 'Thời gian'}</th>
                <th className="border-r border-slate-700 px-1 py-1 text-center w-14">{isKo ? '상태' : 'Trạng thái'}</th>
                <th className="border-r border-slate-700 px-1 py-1 text-left w-24">{isKo ? 'PIC (PRIMARY)' : 'PIC chính'}</th>
                <th className="border-r border-slate-700 px-1 py-1 text-center w-16">{isKo ? '공정률' : 'Tiến độ'}</th>

                {/* 30 Date Columns: Strict 8mm Min Width Contract */}
                {daysArray.map((dayDate, dIdx) => {
                  const dateStr = format(dayDate, 'yyyy-MM-dd');
                  const dayNum = format(dayDate, 'dd');
                  const dowStr = format(dayDate, 'eee');

                  const printToken = resolvePrintCalendarVisualState(dateStr, krHolidays, vnHolidays, calendarOverrides, colorMode);

                  return (
                    <th
                      key={dIdx}
                      data-date={dateStr}
                      data-visual-state={printToken.visualState}
                      className="border-r border-slate-600 px-0.5 py-1 text-center font-mono text-[9px]"
                      style={{
                        ...PRINT_DAY_CELL_STYLE,
                        backgroundColor: printToken.baseColor === '#FFFFFF' ? '#1E293B' : printToken.baseColor,
                        backgroundImage: printToken.hatch.pattern || 'none',
                        color: printToken.textColor === '#334155' ? '#FFFFFF' : printToken.textColor,
                      }}
                    >
                      <div className="font-bold">{dayNum}</div>
                      <div className="text-[8px] opacity-80">{dowStr}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {active30Projects.map((p) => {
                const pTasks = tasks.filter((t) => t.project_id === p.id);
                const progress = calculateProjectProgress(p, pTasks);
                const badgeStyle = getPrintStatusBadgeStyle(p.status, colorMode, lang);
                // V2 Domain: PIC derived from Task PRIMARY
                const picName = getProjectPicSummary(pTasks, workerMap, lang);
                const pName = isKo ? (p.name_ko || p.name) : (p.name_vi || p.name);

                const pStart = p.start_date ? parseISO(p.start_date) : null;
                const pEnd = p.end_date ? parseISO(p.end_date) : null;
                const barStyle = getPrintGanttBarStyle(p.status, colorMode);

                return (
                  <tr key={p.id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="border-r border-slate-300 px-2 py-1.5 font-bold text-slate-900">{pName}</td>
                    <td className="border-r border-slate-300 px-1 py-1 text-center font-mono text-[9.5px]">
                      {p.start_date?.substring(5)} ~ {p.end_date?.substring(5)}
                    </td>
                    <td className="border-r border-slate-300 px-1 py-1 text-center">
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
                    <td className="border-r border-slate-300 px-1.5 py-1 text-slate-700 font-medium">{picName}</td>
                    <td className="border-r border-slate-300 px-1 py-1 text-center font-mono font-bold text-emerald-700">
                      {progress.actual_progress}%
                    </td>

                    {/* 30 Daily Cells: Strict 8mm Min Width Contract */}
                    {daysArray.map((dayDate, dIdx) => {
                      const dateStr = format(dayDate, 'yyyy-MM-dd');
                      const printToken = resolvePrintCalendarVisualState(dateStr, krHolidays, vnHolidays, calendarOverrides, colorMode);

                      const isProjectDay = pStart && pEnd && dayDate >= pStart && dayDate <= pEnd;

                      return (
                        <td
                          key={dIdx}
                          data-date={dateStr}
                          data-visual-state={printToken.visualState}
                          className="border-r border-slate-200 p-0 text-center relative h-7"
                          style={{
                            ...PRINT_DAY_CELL_STYLE,
                            backgroundColor: printToken.baseColor,
                            backgroundImage: printToken.hatch.pattern || 'none',
                          }}
                        >
                          {isProjectDay && (
                            <div
                              className="absolute inset-y-1 inset-x-0.5 rounded-xs border shadow-xs flex items-center justify-center text-[8px] font-bold"
                              style={{
                                backgroundColor: barStyle.backgroundColor,
                                borderColor: barStyle.borderColor,
                                backgroundImage: barStyle.pattern || 'none',
                                color: barStyle.textColor,
                                borderStyle: barStyle.borderStyle || 'solid',
                              }}
                            />
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

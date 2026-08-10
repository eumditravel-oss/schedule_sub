// src/components/print/PrintCombinedProjectsA3.tsx
import React from 'react';
import { Project, Task, TaskGroup, Worker, CountryHoliday, CalendarOverride } from '../../types';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintColorMode, getPrintStatusBadgeStyle, getPrintGanttBarStyle, getPrintCalendarVisualStyle, getProjectPicSummary, PRINT_DAY_CELL_STYLE } from '../../utils/printVisualTokens';
import { calculateProjectProgress } from '../../utils/progressCalculator';
import { resolveCalendarVisualState } from '../../utils/calendarVisualTokens';
import { parseISO, format, addDays, differenceInCalendarDays } from 'date-fns';

export interface PrintCombinedProjectsA3Props {
  selectedProjects: Project[];
  allTasks: Task[];
  allTaskGroups?: TaskGroup[];
  workers?: Worker[];
  krHolidays?: CountryHoliday[];
  vnHolidays?: CountryHoliday[];
  calendarOverrides?: CalendarOverride[];
  colorMode?: PrintColorMode;
  lang?: 'ko' | 'vi';
  viewerName?: string;
  referenceDate?: string;
}

export const PrintCombinedProjectsA3: React.FC<PrintCombinedProjectsA3Props> = ({
  selectedProjects = [],
  allTasks = [],
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

  // Calculate min(start_date) ~ max(end_date) across selected projects
  let minStart = new Date();
  let maxEnd = addDays(minStart, 29);

  if (selectedProjects.length > 0) {
    const starts = selectedProjects.map((p) => p.start_date ? parseISO(p.start_date) : new Date()).filter(Boolean);
    const ends = selectedProjects.map((p) => p.end_date ? parseISO(p.end_date) : new Date()).filter(Boolean);

    if (starts.length > 0) minStart = new Date(Math.min(...starts.map((d) => d.getTime())));
    if (ends.length > 0) maxEnd = new Date(Math.max(...ends.map((d) => d.getTime())));
  }

  const totalDays = Math.max(1, differenceInCalendarDays(maxEnd, minStart) + 1);
  const bandPagesCount = Math.ceil(totalDays / 30);
  const bandPages: Array<{ pageIdx: number; start: Date; end: Date; daysCount: number }> = [];

  for (let b = 0; b < bandPagesCount; b++) {
    const bStart = addDays(minStart, b * 30);
    const bEnd = addDays(bStart, 29) > maxEnd ? maxEnd : addDays(bStart, 29);
    const bDays = Math.max(1, differenceInCalendarDays(bEnd, bStart) + 1);
    bandPages.push({
      pageIdx: b + 1,
      start: bStart,
      end: bEnd,
      daysCount: bDays,
    });
  }

  return (
    <div className="print-template-a3-combined flex flex-col justify-between w-full h-full text-slate-900 font-sans text-xs">
      {bandPages.map((band, bandIdx) => {
        const daysArray: Date[] = [];
        for (let i = 0; i < band.daysCount; i++) {
          daysArray.push(addDays(band.start, i));
        }

        return (
          <div key={bandIdx} className={`print-page-band flex flex-col justify-between h-full w-full ${bandIdx > 0 ? 'page-break-before' : ''}`}>
            <div>
              <PrintHeader
                title={isKo ? '선택 프로젝트 통합 일정표 (A3 Combined Schedule)' : 'Lịch trình tổng hợp các dự án đã chọn'}
                subtitle={
                  isKo
                    ? `선택 ${selectedProjects.length}개 프로젝트 통합 일정 | 구간 ${band.pageIdx}/${bandPagesCount}: ${format(band.start, 'yyyy-MM-dd')} ~ ${format(band.end, 'yyyy-MM-dd')}`
                    : `Tổng hợp ${selectedProjects.length} dự án | Đoạn ${band.pageIdx}/${bandPagesCount}: ${format(band.start, 'yyyy-MM-dd')} ~ ${format(band.end, 'yyyy-MM-dd')}`
                }
                referenceDate={referenceDate}
                authorName={viewerName}
                pageNumber={band.pageIdx}
                totalPages={bandPagesCount}
                colorMode={colorMode}
                lang={lang}
              />

              {/* Combined Projects Table */}
              <div className="w-full overflow-x-auto mb-2 border border-slate-300 rounded">
                <table className="w-full border-collapse text-[10.5px]">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold border-b border-slate-700">
                      <th className="border-r border-slate-700 px-2 py-1 text-left w-52">{isKo ? '프로젝트 / 세부 공정' : 'Dự án / Công việc'}</th>
                      <th className="border-r border-slate-700 px-1 py-1 text-center w-24">{isKo ? '기간' : 'Thời gian'}</th>
                      <th className="border-r border-slate-700 px-1 py-1 text-center w-14">{isKo ? '상태' : 'Trạng thái'}</th>
                      <th className="border-r border-slate-700 px-1 py-1 text-left w-24">{isKo ? 'PIC (PRIMARY)' : 'PIC chính'}</th>
                      <th className="border-r border-slate-700 px-1 py-1 text-center w-16">{isKo ? '공정률' : 'Tiến độ'}</th>

                      {/* 30 Date Columns: Strict 8mm Min Width Contract */}
                      {daysArray.map((dayDate, dIdx) => {
                        const dateStr = format(dayDate, 'yyyy-MM-dd');
                        const dayNum = format(dayDate, 'dd');
                        const dowStr = format(dayDate, 'eee');

                        const visToken = resolveCalendarVisualState(dateStr, null, null, null, [...krHolidays, ...vnHolidays], calendarOverrides);
                        const printToken = getPrintCalendarVisualStyle(visToken.visualState, colorMode);

                        return (
                          <th
                            key={dIdx}
                            className="border-r border-slate-600 px-0.5 py-1 text-center font-mono text-[9px]"
                            style={{
                              ...PRINT_DAY_CELL_STYLE,
                              backgroundColor: printToken.baseColor === '#FFFFFF' ? '#1E293B' : printToken.baseColor,
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
                    {selectedProjects.map((project) => {
                      const pTasks = allTasks.filter((t) => t.project_id === project.id);
                      const progress = calculateProjectProgress(project, pTasks);
                      const badgeStyle = getPrintStatusBadgeStyle(project.status, colorMode, lang);
                      // V2 Domain: PIC derived from Task PRIMARY
                      const picName = getProjectPicSummary(pTasks, workerMap, lang);
                      const pName = isKo ? (project.name_ko || project.name) : (project.name_vi || project.name);

                      const pStart = project.start_date ? parseISO(project.start_date) : null;
                      const pEnd = project.end_date ? parseISO(project.end_date) : null;
                      const pBarStyle = getPrintGanttBarStyle(project.status, colorMode);

                      return (
                        <React.Fragment key={project.id}>
                          {/* Project Section Header Row */}
                          <tr className="bg-slate-100 font-bold border-b border-slate-300">
                            <td className="border-r border-slate-300 px-2 py-1 text-slate-900 bg-slate-200">
                              [Project] {pName}
                            </td>
                            <td className="border-r border-slate-300 px-1 py-1 text-center font-mono text-[9px]">
                              {project.start_date?.substring(5)} ~ {project.end_date?.substring(5)}
                            </td>
                            <td className="border-r border-slate-300 px-1 py-1 text-center">
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold border inline-block"
                                style={{
                                  backgroundColor: badgeStyle.backgroundColor,
                                  borderColor: badgeStyle.borderColor,
                                  color: badgeStyle.textColor,
                                }}
                              >
                                {badgeStyle.label}
                              </span>
                            </td>
                            <td className="border-r border-slate-300 px-1.5 py-1 text-slate-700">{picName}</td>
                            <td className="border-r border-slate-300 px-1 py-1 text-center font-mono font-bold text-emerald-700">
                              {progress.actual_progress}%
                            </td>

                            {/* Project level bar row */}
                            {daysArray.map((dayDate, dIdx) => {
                              const dateStr = format(dayDate, 'yyyy-MM-dd');
                              const visToken = resolveCalendarVisualState(dateStr, null, null, null, [...krHolidays, ...vnHolidays], calendarOverrides);
                              const printToken = getPrintCalendarVisualStyle(visToken.visualState, colorMode);
                              const isPDay = pStart && pEnd && dayDate >= pStart && dayDate <= pEnd;

                              return (
                                <td
                                  key={dIdx}
                                  className="border-r border-slate-200 p-0 text-center relative h-6 bg-slate-100"
                                  style={{
                                    ...PRINT_DAY_CELL_STYLE,
                                    backgroundImage: printToken.hatch.pattern || 'none',
                                  }}
                                >
                                  {isPDay && (
                                    <div
                                      className="absolute inset-y-1 inset-x-0.5 rounded-xs border shadow-xs"
                                      style={{
                                        backgroundColor: pBarStyle.backgroundColor,
                                        borderColor: pBarStyle.borderColor,
                                        backgroundImage: pBarStyle.pattern || 'none',
                                      }}
                                    />
                                  )}
                                </td>
                              );
                            })}
                          </tr>

                          {/* Task Rows inside project */}
                          {pTasks.slice(0, 10).map((task) => {
                            const taskStatus = task.schedule_state || (task.actual_progress === 100 ? 'COMPLETED' : 'IN_PROGRESS');
                            const taskBadge = getPrintStatusBadgeStyle(taskStatus, colorMode, lang);
                            const taskStart = task.start_date ? parseISO(task.start_date) : null;
                            const taskEnd = task.end_date ? parseISO(task.end_date) : null;
                            const tBarStyle = getPrintGanttBarStyle(taskStatus, colorMode);
                            const tPic = task.primary_worker_id
                              ? workerMap.get(task.primary_worker_id) || task.worker_name || '-'
                              : task.worker_name || '-';
                            const tName = isKo ? (task.task_name_ko || task.task_name) : (task.task_name_vi || task.task_name);

                            return (
                              <tr key={task.id} className="border-b border-slate-200 hover:bg-slate-50">
                                <td className="border-r border-slate-300 px-2 py-1 pl-4 text-slate-700 text-[10px]">
                                  ↳ {tName}
                                </td>
                                <td className="border-r border-slate-300 px-1 py-1 text-center font-mono text-[9px] text-slate-500">
                                  {task.start_date?.substring(5)} ~ {task.end_date?.substring(5)}
                                </td>
                                <td className="border-r border-slate-300 px-1 py-1 text-center">
                                  <span
                                    className="px-1 py-0.5 rounded text-[8.5px] font-semibold border inline-block"
                                    style={{
                                      backgroundColor: taskBadge.backgroundColor,
                                      borderColor: taskBadge.borderColor,
                                      color: taskBadge.textColor,
                                    }}
                                  >
                                    {taskBadge.label}
                                  </span>
                                </td>
                                <td className="border-r border-slate-300 px-1.5 py-1 text-slate-600 text-[9.5px]">{tPic}</td>
                                <td className="border-r border-slate-300 px-1 py-1 text-center font-mono text-[9.5px] text-slate-500">
                                  {task.actual_progress ?? (task.schedule_state === 'COMPLETED' ? 100 : 0)}%
                                </td>

                                {/* Task Bar Cells: Strict 8mm Min Width Contract */}
                                {daysArray.map((dayDate, dIdx) => {
                                  const dateStr = format(dayDate, 'yyyy-MM-dd');
                                  const visToken = resolveCalendarVisualState(dateStr, null, null, null, [...krHolidays, ...vnHolidays], calendarOverrides);
                                  const printToken = getPrintCalendarVisualStyle(visToken.visualState, colorMode);
                                  const isTDay = taskStart && taskEnd && dayDate >= taskStart && dayDate <= taskEnd;

                                  return (
                                    <td
                                      key={dIdx}
                                      className="border-r border-slate-200 p-0 text-center relative h-5"
                                      style={{
                                        ...PRINT_DAY_CELL_STYLE,
                                        backgroundColor: printToken.baseColor,
                                        backgroundImage: printToken.hatch.pattern || 'none',
                                      }}
                                    >
                                      {isTDay && (
                                        <div
                                          className="absolute inset-y-1 inset-x-0.5 rounded-xs border shadow-xs"
                                          style={{
                                            backgroundColor: tBarStyle.backgroundColor,
                                            borderColor: tBarStyle.borderColor,
                                            backgroundImage: tBarStyle.pattern || 'none',
                                            borderStyle: tBarStyle.borderStyle || 'solid',
                                          }}
                                        />
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <PrintFooter colorMode={colorMode} lang={lang} viewerName={viewerName} />
          </div>
        );
      })}
    </div>
  );
};

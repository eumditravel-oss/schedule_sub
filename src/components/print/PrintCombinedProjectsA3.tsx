// src/components/print/PrintCombinedProjectsA3.tsx
import React from 'react';
import { Project, Task, TaskGroup, Worker, CountryHoliday, CalendarOverride } from '../../types';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintColorMode, getPrintStatusBadgeStyle, getPrintGanttBarStyle, resolvePrintCalendarVisualState, getProjectPicSummary, getProjectPicWithSupportSummary, PRINT_DAY_CELL_STYLE } from '../../utils/printVisualTokens';
import { resolveWorkDayStatus } from '../../utils/workCalendar';
import { resolveReportProjectProgress } from '../../utils/reportProgress';
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
  const allHolidays = [...krHolidays, ...vnHolidays];

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

                      {/* Global Header Date Columns */}
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
                      const reportProgress = resolveReportProjectProgress(project, pTasks);
                      const badgeStyle = getPrintStatusBadgeStyle(reportProgress.scheduleState === 'COMPLETED' ? 'COMPLETED' : project.status, colorMode, lang);
                      // V2 Domain: PIC with Support summary
                      const picName = getProjectPicWithSupportSummary(pTasks, workerMap, lang);
                      const pName = isKo ? (project.name_ko || project.name) : (project.name_vi || project.name);

                      const pStartStr = project.start_date;
                      const pEndStr = project.end_date;
                      const pBarStyle = getPrintGanttBarStyle(project.status, colorMode);

                      // Calculate span columns for band range
                      const bandStartStr = format(band.start, 'yyyy-MM-dd');
                      const bandEndStr = format(band.end, 'yyyy-MM-dd');
                      const isClippedLeft = Boolean(pStartStr && pStartStr < bandStartStr);
                      const isClippedRight = Boolean(pEndStr && pEndStr > bandEndStr);

                      // Calculate column indices (0 ~ 29)
                      let startCol = 0;
                      let endCol = daysArray.length - 1;
                      if (pStartStr) {
                        const idx = daysArray.findIndex((d) => format(d, 'yyyy-MM-dd') === pStartStr);
                        if (idx !== -1) startCol = idx;
                        else if (pStartStr > bandEndStr) startCol = 30; // Out of view right
                      }
                      if (pEndStr) {
                        const idx = daysArray.findIndex((d) => format(d, 'yyyy-MM-dd') === pEndStr);
                        if (idx !== -1) endCol = idx;
                        else if (pEndStr < bandStartStr) endCol = -1; // Out of view left
                      }

                      const isVisibleInBand = startCol < daysArray.length && endCol >= 0 && startCol <= endCol;
                      const colSpanCount = Math.max(1, endCol - startCol + 1);

                      return (
                        <React.Fragment key={project.id}>
                          {/* Project Section Header Row */}
                          <tr className="bg-slate-100 font-bold border-b border-slate-300">
                            <td className="border-r border-slate-300 px-2 py-1.5 text-slate-900 bg-slate-200">
                              [Project] {pName}
                            </td>
                            <td className="border-r border-slate-300 px-1 py-1.5 text-center font-mono text-[9px]">
                              {project.start_date?.substring(5)} ~ {project.end_date?.substring(5)}
                            </td>
                            <td className="border-r border-slate-300 px-1 py-1.5 text-center">
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold border inline-block"
                                style={{
                                  backgroundColor: badgeStyle.backgroundColor,
                                  borderColor: badgeStyle.borderColor,
                                  color: badgeStyle.textColor,
                                }}
                              >
                                {isKo ? reportProgress.statusDisplayKo : reportProgress.statusDisplayVi}
                              </span>
                            </td>
                            <td className="border-r border-slate-300 px-1.5 py-1.5 text-slate-700 text-[10px]">{picName}</td>
                            <td className="border-r border-slate-300 px-1 py-1.5 text-center font-mono font-bold text-emerald-700">
                              {reportProgress.actualProgress}%
                            </td>

                            {/* Continuous Timeline Container for 30 Date Columns */}
                            <td colSpan={daysArray.length} className="p-0 relative h-7 bg-white overflow-hidden">
                              {/* Background Date Grid & Holiday Layer */}
                              <div className="absolute inset-0 grid w-full h-full" style={{ gridTemplateColumns: `repeat(${daysArray.length}, minmax(0, 1fr))` }}>
                                {daysArray.map((dayDate, dIdx) => {
                                  const dateStr = format(dayDate, 'yyyy-MM-dd');
                                  const printToken = resolvePrintCalendarVisualState(dateStr, krHolidays, vnHolidays, calendarOverrides, colorMode);
                                  const isTodayCol = dateStr === referenceDate;

                                  return (
                                    <div
                                      key={dIdx}
                                      data-date={dateStr}
                                      className={`h-full border-r border-slate-200/60 relative ${isTodayCol ? 'bg-blue-50/40' : ''}`}
                                      style={{
                                        backgroundColor: printToken.baseColor === '#FFFFFF' ? undefined : printToken.baseColor,
                                        backgroundImage: printToken.hatch.pattern || 'none',
                                      }}
                                    >
                                      {isTodayCol && (
                                        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-blue-600 z-20 pointer-events-none opacity-80" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Continuous Schedule Bar Overlay Layer */}
                              {isVisibleInBand && (
                                <div
                                  className="absolute inset-0 grid w-full h-full pointer-events-none z-10"
                                  style={{ gridTemplateColumns: `repeat(${daysArray.length}, minmax(0, 1fr))` }}
                                >
                                  <div
                                    style={{ gridColumn: `${startCol + 1} / span ${colSpanCount}` }}
                                    className="flex items-center h-full w-full px-0.5"
                                  >
                                    <div
                                      className="w-full h-4 rounded-sm border relative overflow-hidden flex items-center shadow-2xs text-[9px] font-bold px-1"
                                      style={{
                                        backgroundColor: colorMode === 'color' ? '#E2E8F0' : '#F1F5F9', // Muted neutral track
                                        borderColor: pBarStyle.borderColor,
                                        borderStyle: pBarStyle.borderStyle || 'solid',
                                      }}
                                    >
                                      {/* Actual Progress Fill */}
                                      {reportProgress.actualProgress > 0 && (
                                        <div
                                          className="absolute top-0 bottom-0 left-0 z-0 transition-all"
                                          style={{
                                            width: `${Math.min(100, reportProgress.actualProgress)}%`,
                                            backgroundColor: pBarStyle.backgroundColor,
                                            backgroundImage: pBarStyle.pattern || 'none',
                                          }}
                                        />
                                      )}

                                      {/* Bar Indicators */}
                                      <div className="relative z-10 flex items-center justify-between w-full text-slate-800 px-0.5">
                                        <span className="font-bold shrink-0">{isClippedLeft ? '←' : ''}</span>
                                        <span className="truncate text-[8.5px] px-1 bg-white/70 rounded border border-slate-200 font-mono font-bold">
                                          {reportProgress.actualProgress}%
                                        </span>
                                        <span className="font-bold shrink-0">{isClippedRight ? '→' : ''}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>

                          {/* Task Rows inside project */}
                          {pTasks.slice(0, 10).map((task) => {
                            const taskStatus = task.schedule_state || (task.actual_progress === 100 ? 'COMPLETED' : 'IN_PROGRESS');
                            const taskBadge = getPrintStatusBadgeStyle(taskStatus, colorMode, lang);
                            const tBarStyle = getPrintGanttBarStyle(taskStatus, colorMode);

                            const picWorker = workers.find(
                              (w) => w.id === task.primary_worker_id || w.name === task.worker_name
                            );
                            const tPic = picWorker ? picWorker.name : task.worker_name || '-';
                            const tName = isKo ? (task.task_name_ko || task.task_name) : (task.task_name_vi || task.task_name);

                            const tStartStr = task.start_date;
                            const tEndStr = task.end_date;
                            const tClippedLeft = Boolean(tStartStr && tStartStr < bandStartStr);
                            const tClippedRight = Boolean(tEndStr && tEndStr > bandEndStr);

                            let tStartCol = 0;
                            let tEndCol = daysArray.length - 1;
                            if (tStartStr) {
                              const idx = daysArray.findIndex((d) => format(d, 'yyyy-MM-dd') === tStartStr);
                              if (idx !== -1) tStartCol = idx;
                              else if (tStartStr > bandEndStr) tStartCol = 30;
                            }
                            if (tEndStr) {
                              const idx = daysArray.findIndex((d) => format(d, 'yyyy-MM-dd') === tEndStr);
                              if (idx !== -1) tEndCol = idx;
                              else if (tEndStr < bandStartStr) tEndCol = -1;
                            }

                            const isTVisible = tStartCol < daysArray.length && tEndCol >= 0 && tStartCol <= tEndCol;
                            const tSpanCount = Math.max(1, tEndCol - tStartCol + 1);
                            const tProgress = task.actual_progress ?? (task.schedule_state === 'COMPLETED' ? 100 : 0);

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
                                  {tProgress}%
                                </td>

                                {/* Continuous Task Timeline Cell */}
                                <td colSpan={daysArray.length} className="p-0 relative h-6 bg-white overflow-hidden">
                                  <div className="absolute inset-0 grid w-full h-full" style={{ gridTemplateColumns: `repeat(${daysArray.length}, minmax(0, 1fr))` }}>
                                    {daysArray.map((dayDate, dIdx) => {
                                      const dateStr = format(dayDate, 'yyyy-MM-dd');
                                      const dayStatus = picWorker
                                        ? resolveWorkDayStatus(dateStr, picWorker, allHolidays, calendarOverrides)
                                        : null;

                                      const printToken = resolvePrintCalendarVisualState(
                                        dateStr,
                                        krHolidays,
                                        vnHolidays,
                                        calendarOverrides,
                                        colorMode,
                                        dayStatus,
                                        picWorker?.country_code
                                      );

                                      const isTodayCol = dateStr === referenceDate;

                                      return (
                                        <div
                                          key={dIdx}
                                          data-date={dateStr}
                                          className={`h-full border-r border-slate-200/40 relative ${isTodayCol ? 'bg-blue-50/40' : ''}`}
                                          style={{
                                            backgroundColor: printToken.baseColor === '#FFFFFF' ? undefined : printToken.baseColor,
                                            backgroundImage: printToken.hatch.pattern || 'none',
                                          }}
                                        >
                                          {isTodayCol && (
                                            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-blue-600 z-20 pointer-events-none opacity-80" />
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {isTVisible && (
                                    <div
                                      className="absolute inset-0 grid w-full h-full pointer-events-none z-10"
                                      style={{ gridTemplateColumns: `repeat(${daysArray.length}, minmax(0, 1fr))` }}
                                    >
                                      <div
                                        style={{ gridColumn: `${tStartCol + 1} / span ${tSpanCount}` }}
                                        className="flex items-center h-full w-full px-0.5"
                                      >
                                        <div
                                          className="w-full h-3 rounded-xs border relative overflow-hidden flex items-center shadow-2xs"
                                          style={{
                                            backgroundColor: colorMode === 'color' ? '#F1F5F9' : '#F8FAFC',
                                            borderColor: tBarStyle.borderColor,
                                            borderStyle: tBarStyle.borderStyle || 'solid',
                                          }}
                                        >
                                          {tProgress > 0 && (
                                            <div
                                              className="absolute top-0 bottom-0 left-0 z-0"
                                              style={{
                                                width: `${Math.min(100, tProgress)}%`,
                                                backgroundColor: tBarStyle.backgroundColor,
                                                backgroundImage: tBarStyle.pattern || 'none',
                                              }}
                                            />
                                          )}
                                          <div className="relative z-10 flex items-center justify-between w-full text-slate-800 text-[8px] px-0.5 font-bold">
                                            <span>{tClippedLeft ? '←' : ''}</span>
                                            <span>{tClippedRight ? '→' : ''}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </td>
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

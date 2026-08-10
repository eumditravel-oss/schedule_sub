// src/components/print/PrintProjectFullA3.tsx
import React from 'react';
import { Project, Task, TaskGroup, Worker, CountryHoliday, CalendarOverride } from '../../types';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintColorMode, getPrintStatusBadgeStyle, getPrintGanttBarStyle, getPrintCalendarVisualStyle } from '../../utils/printVisualTokens';
import { calculateProjectProgress } from '../../utils/progressCalculator';
import { resolveCalendarVisualState } from '../../utils/calendarVisualTokens';
import { parseISO, format, addDays, differenceInCalendarDays, isSameDay } from 'date-fns';

export interface PrintProjectFullA3Props {
  project: Project;
  tasks: Task[];
  taskGroups: TaskGroup[];
  workers?: Worker[];
  krHolidays?: CountryHoliday[];
  vnHolidays?: CountryHoliday[];
  calendarOverrides?: CalendarOverride[];
  colorMode?: PrintColorMode;
  lang?: 'ko' | 'vi';
  viewerName?: string;
  referenceDate?: string;
}

export const PrintProjectFullA3: React.FC<PrintProjectFullA3Props> = ({
  project,
  tasks,
  taskGroups,
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

  const startDate = project.start_date ? parseISO(project.start_date) : new Date();
  const endDate = project.end_date ? parseISO(project.end_date) : addDays(startDate, 29);
  const totalDays = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);

  // Split into 30-day bands if totalDays > 30
  const bandPagesCount = Math.ceil(totalDays / 30);
  const bandPages: Array<{ pageIdx: number; start: Date; end: Date; daysCount: number }> = [];

  for (let b = 0; b < bandPagesCount; b++) {
    const bStart = addDays(startDate, b * 30);
    const bEnd = addDays(bStart, 29) > endDate ? endDate : addDays(bStart, 29);
    const bDays = Math.max(1, differenceInCalendarDays(bEnd, bStart) + 1);
    bandPages.push({
      pageIdx: b + 1,
      start: bStart,
      end: bEnd,
      daysCount: bDays,
    });
  }

  const primaryPic = project.participating_workers?.[0] || '-';
  const pName = isKo ? (project.name_ko || project.name) : (project.name_vi || project.name);

  return (
    <div className="print-template-a3-full flex flex-col justify-between w-full h-full text-slate-900 font-sans text-xs">
      {bandPages.map((band, bandIdx) => {
        const daysArray: Date[] = [];
        for (let i = 0; i < band.daysCount; i++) {
          daysArray.push(addDays(band.start, i));
        }

        return (
          <div key={bandIdx} className={`print-page-band flex flex-col justify-between h-full w-full ${bandIdx > 0 ? 'page-break-before' : ''}`}>
            <div>
              {/* Header */}
              <PrintHeader
                title={`${pName} - ${isKo ? '전체 상세 일정표 (A3 Gantt)' : 'Lịch trình chi tiết dự án'}`}
                subtitle={
                  isKo
                    ? `구간 ${band.pageIdx}/${bandPagesCount}: ${format(band.start, 'yyyy-MM-dd')} ~ ${format(band.end, 'yyyy-MM-dd')} (${totalDays}일 중 ${band.daysCount}일 표시)`
                    : `Đoạn ${band.pageIdx}/${bandPagesCount}: ${format(band.start, 'yyyy-MM-dd')} ~ ${format(band.end, 'yyyy-MM-dd')}`
                }
                referenceDate={referenceDate}
                authorName={viewerName}
                pageNumber={band.pageIdx}
                totalPages={bandPagesCount}
                colorMode={colorMode}
                lang={lang}
              />

              {/* Project Meta Bar */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-300 rounded p-2 mb-2 text-xs">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-slate-500 font-medium">{isKo ? '담당자 (PIC): ' : 'PIC: '}</span>
                    <strong className="text-slate-900">{primaryPic}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">{isKo ? '전체 기간: ' : 'Thời gian: '}</span>
                    <strong className="text-slate-900 font-mono">
                      {project.start_date} ~ {project.end_date}
                    </strong>
                  </div>
                </div>

                <div className="flex items-center gap-3 font-mono">
                  <span>
                    {isKo ? '예정 공정률: ' : 'KH: '}
                    <strong className="text-blue-700">{calculateProjectProgress(project, tasks).planned_progress}%</strong>
                  </span>
                  <span>
                    {isKo ? '실제 공정률: ' : 'Thực tế: '}
                    <strong className="text-emerald-700">{calculateProjectProgress(project, tasks).actual_progress}%</strong>
                  </span>
                </div>
              </div>

              {/* Detailed Gantt Matrix Table */}
              <div className="w-full overflow-x-auto mb-2 border border-slate-300 rounded">
                <table className="w-full border-collapse text-[10.5px]">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold border-b border-slate-700">
                      <th className="border-r border-slate-700 px-2 py-1 text-left w-32">{isKo ? '공정 대분류' : 'Nhóm'}</th>
                      <th className="border-r border-slate-700 px-2 py-1 text-left w-44">{isKo ? '세부 작업명' : 'Công việc'}</th>
                      <th className="border-r border-slate-700 px-1 py-1 text-center w-16">{isKo ? '담당자' : 'PIC'}</th>
                      <th className="border-r border-slate-700 px-1 py-1 text-center w-24">{isKo ? '시작~종료' : 'Ngày'}</th>
                      <th className="border-r border-slate-700 px-1 py-1 text-center w-14">{isKo ? '상태' : 'Trạng thái'}</th>

                      {/* Date Cells */}
                      {daysArray.map((dayDate, dIdx) => {
                        const dateStr = format(dayDate, 'yyyy-MM-dd');
                        const dayNum = format(dayDate, 'dd');
                        const dowStr = format(dayDate, 'eee');

                        const visToken = resolveCalendarVisualState(dateStr, null, null, null, [...krHolidays, ...vnHolidays], calendarOverrides);
                        const printToken = getPrintCalendarVisualStyle(visToken.visualState, colorMode);

                        return (
                          <th
                            key={dIdx}
                            className="border-r border-slate-600 px-0.5 py-1 text-center font-mono text-[9px] min-w-[30px]"
                            style={{
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
                    {taskGroups.map((group) => {
                      const groupTasks = tasks.filter((t) => t.task_group_id === group.id);
                      if (groupTasks.length === 0) return null;

                      const gName = isKo ? (group.group_name_ko || group.group_name) : (group.group_name_vi || group.group_name);

                      return groupTasks.map((task, taskIdx) => {
                        const taskStatus = task.schedule_state || (task.actual_progress === 100 ? 'COMPLETED' : 'IN_PROGRESS');
                        const badgeStyle = getPrintStatusBadgeStyle(taskStatus, colorMode, lang);
                        const taskPic = task.primary_worker_id
                          ? workerMap.get(task.primary_worker_id) || task.worker_name || '-'
                          : task.worker_name || '-';
                        const tName = isKo ? (task.task_name_ko || task.task_name) : (task.task_name_vi || task.task_name);

                        const taskStart = task.start_date ? parseISO(task.start_date) : null;
                        const taskEnd = task.end_date ? parseISO(task.end_date) : null;

                        return (
                          <tr key={task.id} className="border-b border-slate-200 hover:bg-slate-50">
                            {taskIdx === 0 ? (
                              <td
                                rowSpan={groupTasks.length}
                                className="border-r border-slate-300 px-2 py-1 font-bold text-slate-800 bg-slate-50 align-top"
                              >
                                {gName}
                              </td>
                            ) : null}

                            <td className="border-r border-slate-300 px-2 py-1 font-medium text-slate-900">
                              {tName}
                            </td>
                            <td className="border-r border-slate-300 px-1 py-1 text-center text-[10px] text-slate-700">
                              {taskPic}
                            </td>
                            <td className="border-r border-slate-300 px-1 py-1 text-center font-mono text-[9px] text-slate-600">
                              {task.start_date?.substring(5)} ~ {task.end_date?.substring(5)}
                            </td>
                            <td className="border-r border-slate-300 px-1 py-1 text-center">
                              <span
                                className="px-1 py-0.5 rounded text-[9px] font-bold border inline-block"
                                style={{
                                  backgroundColor: badgeStyle.backgroundColor,
                                  borderColor: badgeStyle.borderColor,
                                  color: badgeStyle.textColor,
                                }}
                              >
                                {badgeStyle.label}
                              </span>
                            </td>

                            {/* Daily Cell Gantt Bar & Hatch */}
                            {daysArray.map((dayDate, dIdx) => {
                              const dateStr = format(dayDate, 'yyyy-MM-dd');
                              const visToken = resolveCalendarVisualState(dateStr, null, null, null, [...krHolidays, ...vnHolidays], calendarOverrides);
                              const printToken = getPrintCalendarVisualStyle(visToken.visualState, colorMode);

                              const isTaskDay = taskStart && taskEnd && dayDate >= taskStart && dayDate <= taskEnd;
                              const barStyle = getPrintGanttBarStyle(taskStatus, colorMode);

                              return (
                                <td
                                  key={dIdx}
                                  className="border-r border-slate-200 p-0 text-center relative min-w-[30px] h-6"
                                  style={{
                                    backgroundColor: printToken.baseColor,
                                    backgroundImage: printToken.hatch.pattern || 'none',
                                  }}
                                >
                                  {isTaskDay && (
                                    <div
                                      className="absolute inset-y-1 inset-x-0.5 rounded-xs border shadow-xs flex items-center justify-center text-[8px] font-bold"
                                      style={{
                                        backgroundColor: barStyle.backgroundColor,
                                        borderColor: barStyle.borderColor,
                                        backgroundImage: barStyle.pattern || 'none',
                                        color: barStyle.textColor,
                                        borderStyle: barStyle.borderStyle || 'solid',
                                      }}
                                    >
                                      {isSameDay(dayDate, taskStart!) ? 'S' : isSameDay(dayDate, taskEnd!) ? 'E' : ''}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      });
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

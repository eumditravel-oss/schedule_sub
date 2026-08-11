// src/components/print/PrintProjectSummaryA4.tsx
import React from 'react';
import { Project, Task, TaskGroup, ProjectWorkerAllocation, Worker } from '../../types';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import {
  PrintColorMode,
  getPrintStatusBadgeStyle,
  getPrintGanttBarStyle,
  getProjectPicSummary,
  getProjectSupportSummary,
  getProjectPicWithSupportSummary,
  resolvePrintCalendarVisualState,
} from '../../utils/printVisualTokens';
import { resolveReportProjectProgress, getCompletedTaskCount } from '../../utils/reportProgress';
import { parseISO, format, eachWeekOfInterval, eachDayOfInterval, differenceInCalendarDays, addDays } from 'date-fns';

export interface PrintProjectSummaryA4Props {
  project: Project;
  tasks: Task[];
  taskGroups: TaskGroup[];
  allocations?: ProjectWorkerAllocation[];
  workers?: Worker[];
  colorMode?: 'color' | 'mono';
  lang?: 'ko' | 'vi';
  viewerName?: string;
  referenceDate?: string;
}

export const PrintProjectSummaryA4: React.FC<PrintProjectSummaryA4Props> = ({
  project,
  tasks = [],
  taskGroups = [],
  allocations = [],
  workers = [],
  colorMode = 'color',
  lang = 'ko',
  viewerName,
  referenceDate = new Date().toISOString().substring(0, 10),
}) => {
  const isKo = lang === 'ko';
  const workerMap = new Map(workers.map((w) => [w.id, w.name]));
  const pName = isKo ? (project.name_ko || project.name) : (project.name_vi || project.name);

  // Single Source Report Progress & Status Resolution
  const reportProgress = resolveReportProjectProgress(project, tasks);
  const plannedProgress = reportProgress.plannedProgress;
  const actualProgress = reportProgress.actualProgress;

  const totalTasks = tasks.length;
  const completedTasks = getCompletedTaskCount(tasks);
  const blockedTasks = tasks.filter((t) => Boolean(t.is_blocked)).length;
  const delayedTasks = tasks.filter(
    (t) => t.schedule_state === 'DELAYED' || (t.end_date && t.end_date < referenceDate && (t.actual_progress ?? t.progress ?? 0) < 100)
  ).length;
  const inProgressTasks = tasks.filter((t) => t.schedule_state === 'IN_PROGRESS' && !t.is_blocked).length;

  const badgeStyle = getPrintStatusBadgeStyle(reportProgress.scheduleState === 'COMPLETED' ? 'COMPLETED' : project.status, colorMode, lang);

  // V2 Domain Semantics: Task PRIMARY = PIC, Task CO_ASSIGNEE = Support
  const projectPic = getProjectPicWithSupportSummary(tasks, workerMap, lang);
  const projectSupport = getProjectSupportSummary(tasks, workerMap);

  // Task Group summaries for Page 1 & Detail Pages
  const validGroups = (taskGroups.length > 0 ? taskGroups : [])
    .map((g) => {
      const gTasks = tasks.filter((t) => t.task_group_id === g.id);
      return { group: g, tasks: gTasks };
    })
    .filter((item) => item.tasks.length > 0);

  // If no task groups exist in DB, treat as single default group
  if (validGroups.length === 0 && tasks.length > 0) {
    validGroups.push({
      group: {
        id: 'default_group',
        project_id: project.id,
        group_name: isKo ? '전체 세부 공정' : 'Toàn bộ công việc',
        sort_order: 1,
        color_key: 'BLUE',
      },
      tasks: tasks,
    });
  }

  const groupSummaries = validGroups.map(({ group, tasks: gTasks }) => {
    const gTotal = gTasks.length;
    const gDone = getCompletedTaskCount(gTasks);
    const gBlocked = gTasks.filter((t) => Boolean(t.is_blocked)).length;
    const gInProgress = gTasks.filter((t) => t.schedule_state === 'IN_PROGRESS' && !t.is_blocked).length;
    const gDelayed = gTasks.filter(
      (t) => t.schedule_state === 'DELAYED' || (t.end_date && t.end_date < referenceDate && (t.actual_progress ?? t.progress ?? 0) < 100)
    ).length;

    // Group progress percent - Single Source of Truth
    const gPct = gTotal > 0 ? (reportProgress.isLifecycleCompleted && gDone === gTotal ? 100 : Math.round((gDone / gTotal) * 100)) : 0;
    const gName = isKo ? (group.group_name_ko || group.group_name) : (group.group_name_vi || group.group_name);

    return {
      group,
      name: gName,
      tasksCount: gTotal,
      doneCount: gDone,
      inProgressCount: gInProgress,
      delayedCount: gDelayed,
      blockedCount: gBlocked,
      progressPercent: gPct,
      tasks: gTasks,
    };
  });

  // Calculate pages per phase (max 8 tasks per page chunk for legible printing)
  const TASKS_PER_PAGE = 8;
  const phasePagesConfig: Array<{
    groupSummary: (typeof groupSummaries)[0];
    groupIndex: number;
    chunkIndex: number;
    totalChunks: number;
    chunkTasks: Task[];
  }> = [];

  groupSummaries.forEach((gSum, gIdx) => {
    const totalChunks = Math.max(1, Math.ceil(gSum.tasks.length / TASKS_PER_PAGE));
    for (let cIdx = 0; cIdx < totalChunks; cIdx++) {
      const chunkTasks = gSum.tasks.slice(cIdx * TASKS_PER_PAGE, (cIdx + 1) * TASKS_PER_PAGE);
      phasePagesConfig.push({
        groupSummary: gSum,
        groupIndex: gIdx,
        chunkIndex: cIdx,
        totalChunks,
        chunkTasks,
      });
    }
  });

  const totalPageCount = 1 + phasePagesConfig.length;

  // Timeline Compression for Page 1 Executive Summary
  const startDate = project.start_date ? parseISO(project.start_date) : new Date();
  const endDate = project.end_date ? parseISO(project.end_date) : new Date();
  let timelineWeeks: Date[] = [];
  try {
    timelineWeeks = eachWeekOfInterval({ start: startDate, end: endDate }, { weekStartsOn: 1 });
  } catch {
    timelineWeeks = [startDate];
  }

  return (
    <div className="print-template-a4-multipage w-full text-slate-900 font-sans text-xs">
      {/* ========================================================================= */}
      {/* PAGE 1: PROJECT EXECUTIVE SUMMARY */}
      {/* ========================================================================= */}
      <div className="print-page-band flex flex-col justify-between w-full h-full min-h-[210mm]">
        <div>
          {/* Header */}
          <PrintHeader
            title={pName}
            subtitle={isKo ? 'PROJECT EXECUTIVE SUMMARY (프로젝트 요약 보고서)' : 'PROJECT EXECUTIVE SUMMARY (Báo cáo tóm tắt dự án)'}
            referenceDate={referenceDate}
            authorName={viewerName}
            pageNumber={1}
            totalPages={totalPageCount}
            colorMode={colorMode}
            lang={lang}
          />

          {/* Executive Overview KPI Grid */}
          <div className="grid grid-cols-4 gap-2.5 mb-3">
            {/* Status Box */}
            <div className="border border-slate-200 rounded p-2 bg-slate-50">
              <span className="text-[10px] text-slate-500 font-medium block mb-1">
                {isKo ? '프로젝트 상태' : 'Trạng thái dự án'}
              </span>
              <span
                className="px-2 py-0.5 rounded text-xs font-bold border inline-block"
                style={{
                  backgroundColor: badgeStyle.backgroundColor,
                  borderColor: badgeStyle.borderColor,
                  color: badgeStyle.textColor,
                }}
              >
                {isKo ? reportProgress.statusDisplayKo : reportProgress.statusDisplayVi}
              </span>
            </div>

            {/* Period Box */}
            <div className="border border-slate-200 rounded p-2 bg-slate-50">
              <span className="text-[10px] text-slate-500 font-medium block mb-1">
                {isKo ? '프로젝트 기간' : 'Thời gian dự án'}
              </span>
              <span className="font-mono text-xs font-bold text-slate-800">
                {project.start_date} ~ {project.end_date}
              </span>
            </div>

            {/* Planned vs Actual Progress */}
            <div className="border border-slate-200 rounded p-2 bg-slate-50">
              <span className="text-[10px] text-slate-500 font-medium block mb-1">
                {isKo ? '예정 / 실제 공정률' : 'Tiến độ KH / Thực tế'}
              </span>
              <div className="flex items-center gap-2 font-bold text-xs">
                <span className="text-blue-700">{plannedProgress}%</span>
                <span className="text-slate-400">/</span>
                <span className="text-emerald-700 font-extrabold">{actualProgress}%</span>
              </div>
            </div>

            {/* Completion Info */}
            <div className="border border-slate-200 rounded p-2 bg-slate-50">
              <span className="text-[10px] text-slate-500 font-medium block mb-1">
                {isKo ? '완료 정보' : 'Thông tin hoàn thành'}
              </span>
              <span className="text-xs font-semibold text-slate-800">
                {isKo ? reportProgress.completedAtDisplayKo : reportProgress.completedAtDisplayVi}
              </span>
            </div>
          </div>

          {/* Task KPI Counters & Workforce Summary */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {/* Workforce Summary Box */}
            <div className="border border-slate-200 rounded p-2.5 bg-white">
              <h3 className="font-bold text-slate-800 text-xs mb-1.5 border-b border-slate-200 pb-1 flex items-center justify-between">
                <span>{isKo ? '담당자 (Task PRIMARY) & 투입 인력' : 'PIC & Phân công nhân sự'}</span>
                <span className="text-[10px] font-normal text-slate-600">
                  주요 PIC: <strong className="text-slate-900">{projectPic}</strong>
                </span>
              </h3>

              <div className="mb-2 text-[11px] text-slate-700 flex items-center gap-2">
                <span className="text-slate-500">{isKo ? 'Support 인력:' : 'Hỗ trợ:'}</span>
                <span className="font-medium text-slate-800">{projectSupport}</span>
              </div>

              <div className="border-t border-slate-100 pt-1.5">
                <span className="text-[10px] text-slate-500 font-bold block mb-1">
                  {isKo ? '프로젝트 투입률 (Capacity / FTE):' : 'Tỷ lệ phân công (Capacity):'}
                </span>
                {allocations && allocations.length > 0 ? (
                  <div className="space-y-1">
                    {allocations.map((alloc) => {
                      const name = workerMap.get(alloc.worker_id) || alloc.worker_id;
                      return (
                        <div key={alloc.worker_id} className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-slate-700">{name}</span>
                          <span className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                            {alloc.allocation_percent}% FTE
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10.5px] text-slate-400 italic">
                    {isKo ? '설정된 Capacity 투입 비율이 없습니다.' : 'Chưa thiết lập định mức capacity.'}
                  </p>
                )}
              </div>
            </div>

            {/* Task Issue Counter Box */}
            <div className="border border-slate-200 rounded p-2.5 bg-white">
              <h3 className="font-bold text-slate-800 text-xs mb-1.5 border-b border-slate-200 pb-1">
                {isKo ? '작업 현황 요약' : 'Tóm tắt trạng thái công việc'}
              </h3>
              <div className="grid grid-cols-4 gap-1 text-center text-[10.5px]">
                <div className="bg-emerald-50 border border-emerald-200 rounded p-1">
                  <span className="block text-[9.5px] text-emerald-700 font-medium">{isKo ? '완료' : 'Xong'}</span>
                  <span className="font-bold text-emerald-900 text-xs">{completedTasks}</span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded p-1">
                  <span className="block text-[9.5px] text-blue-700 font-medium">{isKo ? '진행중' : 'Đang làm'}</span>
                  <span className="font-bold text-blue-900 text-xs">{inProgressTasks}</span>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded p-1">
                  <span className="block text-[9.5px] text-amber-700 font-medium">{isKo ? '지연/경과' : 'Trễ hạn'}</span>
                  <span className="font-bold text-amber-900 text-xs">{delayedTasks}</span>
                </div>
                <div className="bg-rose-50 border border-rose-200 rounded p-1">
                  <span className="block text-[9.5px] text-rose-700 font-medium">{isKo ? '막힘 (!)' : 'Tắc nghẽn'}</span>
                  <span className="font-bold text-rose-900 text-xs">{blockedTasks}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Task Groups Breakdown Table */}
          <div className="mb-4">
            <h3 className="font-bold text-slate-800 text-xs mb-1.5 flex items-center justify-between">
              <span>{isKo ? '주요 공정 대분류 현황' : 'Hiện trạng nhóm công việc chính'}</span>
              <span className="text-[10px] font-normal text-slate-500">
                {isKo ? `총 ${totalTasks}개 작업` : `Tổng ${totalTasks} công việc`}
              </span>
            </h3>

            <table className="w-full border-collapse border border-slate-300 text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-300">
                  <th className="border border-slate-300 px-2 py-1 text-left">{isKo ? '공정 대분류명' : 'Tên nhóm'}</th>
                  <th className="border border-slate-300 px-2 py-1 text-center w-20">{isKo ? '전체 작업' : 'Tổng số'}</th>
                  <th className="border border-slate-300 px-2 py-1 text-center w-20">{isKo ? '완료' : 'Đã xong'}</th>
                  <th className="border border-slate-300 px-2 py-1 text-center w-20">{isKo ? '막힘' : 'Tắc nghẽn'}</th>
                  <th className="border border-slate-300 px-2 py-1 text-center w-28">{isKo ? '공정률' : 'Tiến độ'}</th>
                </tr>
              </thead>
              <tbody>
                {groupSummaries.map((g) => (
                  <tr key={g.group.id} className="hover:bg-slate-50 border-b border-slate-200">
                    <td className="border border-slate-300 px-2 py-1 font-medium">{g.name}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center font-mono">{g.tasksCount}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center font-mono text-emerald-700 font-bold">
                      {g.doneCount}
                    </td>
                    <td
                      className={`border border-slate-300 px-2 py-1 text-center font-mono ${
                        g.blockedCount > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'
                      }`}
                    >
                      {g.blockedCount}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center">
                      <div className="flex items-center gap-1.5 px-1">
                        <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-emerald-600 h-full rounded-full"
                            style={{ width: `${g.progressPercent}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] font-bold w-7 text-right">{g.progressPercent}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Compressed 1-line Timeline Summary */}
          <div className="mb-2 border border-slate-300 rounded p-2.5 bg-slate-50">
            <h3 className="font-bold text-slate-800 text-[11px] mb-1.5 flex items-center justify-between">
              <span>{isKo ? '주 단위 요약 타임라인 (Compressed 1-Line Timeline)' : 'Tiến trình tóm tắt theo tuần'}</span>
              <span className="text-[10px] font-normal text-slate-500">
                {project.start_date} ~ {project.end_date}
              </span>
            </h3>

            <div className="w-full overflow-hidden border border-slate-300 rounded bg-white p-1">
              <div className="grid gap-0.5 text-center text-[9px]" style={{ gridTemplateColumns: `repeat(${Math.max(1, timelineWeeks.length)}, minmax(0, 1fr))` }}>
                {timelineWeeks.slice(0, 16).map((wkDate, idx) => {
                  const wkStr = format(wkDate, 'MM/dd');
                  const barStyle = getPrintGanttBarStyle(project.status, colorMode);

                  return (
                    <div key={idx} className="flex flex-col items-center">
                      <span className="text-[8.5px] text-slate-500 font-mono mb-0.5">{wkStr}</span>
                      <div
                        className="w-full h-3.5 rounded-xs border"
                        style={{
                          backgroundColor: barStyle.backgroundColor,
                          borderColor: barStyle.borderColor,
                          backgroundImage: barStyle.pattern || 'none',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <PrintFooter colorMode={colorMode} lang={lang} viewerName={viewerName} />
      </div>

      {/* ========================================================================= */}
      {/* PAGE 2 ~ N: DETAILED PHASE PAGES (0단계 ~ 6단계) */}
      {/* ========================================================================= */}
      {phasePagesConfig.map((pConfig, pIdx) => {
        const currentPageNum = 2 + pIdx;
        const { groupSummary: gSum, groupIndex, chunkIndex, totalChunks, chunkTasks } = pConfig;
        const chunkSuffix = totalChunks > 1 ? ` (${chunkIndex + 1}/${totalChunks})` : '';

        // Phase date range for auto-scaling phase Gantt timeline
        const validTaskStarts = gSum.tasks.map((t) => t.start_date).filter(Boolean) as string[];
        const validTaskEnds = gSum.tasks.map((t) => t.end_date).filter(Boolean) as string[];

        let phaseMinStart = project.start_date ? parseISO(project.start_date) : new Date();
        let phaseMaxEnd = project.end_date ? parseISO(project.end_date) : new Date();

        if (validTaskStarts.length > 0) {
          const minTime = Math.min(...validTaskStarts.map((d) => parseISO(d).getTime()));
          phaseMinStart = new Date(minTime);
        }
        if (validTaskEnds.length > 0) {
          const maxTime = Math.max(...validTaskEnds.map((d) => parseISO(d).getTime()));
          phaseMaxEnd = new Date(maxTime);
        }

        const totalPhaseDays = Math.max(1, differenceInCalendarDays(phaseMaxEnd, phaseMinStart) + 1);

        // Daily array for Phase Gantt Header (capped to 24 columns max per page for clarity)
        const phaseDaysArray: Date[] = [];
        const stepDays = Math.max(1, Math.ceil(totalPhaseDays / 24));
        for (let i = 0; i < totalPhaseDays; i += stepDays) {
          phaseDaysArray.push(addDays(phaseMinStart, i));
        }

        return (
          <div
            key={`phase_page_${groupIndex}_${chunkIndex}`}
            className="print-page-band flex flex-col justify-between w-full h-full min-h-[210mm] page-break-before"
          >
            <div>
              {/* Header */}
              <PrintHeader
                title="CON-COST × VIETQS 개발팀 프로젝트 스케줄러"
                subtitle={`프로젝트: ${pName} | 공정: ${gSum.name}${chunkSuffix}`}
                referenceDate={referenceDate}
                authorName={viewerName}
                pageNumber={currentPageNum}
                totalPages={totalPageCount}
                colorMode={colorMode}
                lang={lang}
              />

              {/* Phase Summary KPI Box */}
              <div className="border border-slate-300 rounded p-2 bg-slate-50 mb-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2">
                  <h3 className="font-extrabold text-xs text-slate-900 flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-slate-800 text-white rounded text-[10.5px]">
                      {groupIndex}단계
                    </span>
                    <span>{gSum.name}</span>
                    {chunkSuffix && <span className="text-slate-500 font-normal">{chunkSuffix}</span>}
                  </h3>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">{isKo ? '공정률:' : 'Tiến độ:'}</span>
                    <span className="font-mono font-black text-emerald-700 text-sm">{gSum.progressPercent}%</span>
                  </div>
                </div>

                {/* KPI Cards Strip */}
                <div className="grid grid-cols-6 gap-2 text-center text-[10.5px]">
                  <div className="bg-white border border-slate-200 rounded p-1">
                    <span className="block text-[9.5px] text-slate-500">{isKo ? '공정률' : 'Tiến độ'}</span>
                    <span className="font-mono font-bold text-slate-900">{gSum.progressPercent}%</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded p-1">
                    <span className="block text-[9.5px] text-slate-500">{isKo ? '전체 작업' : 'Tổng số'}</span>
                    <span className="font-mono font-bold text-slate-900">{gSum.tasksCount}</span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded p-1">
                    <span className="block text-[9.5px] text-emerald-700">{isKo ? '완료' : 'Đã xong'}</span>
                    <span className="font-mono font-bold text-emerald-900">{gSum.doneCount}</span>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded p-1">
                    <span className="block text-[9.5px] text-blue-700">{isKo ? '진행 중' : 'Đang làm'}</span>
                    <span className="font-mono font-bold text-blue-900">{gSum.inProgressCount}</span>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded p-1">
                    <span className="block text-[9.5px] text-amber-700">{isKo ? '지연' : 'Trễ hạn'}</span>
                    <span className="font-mono font-bold text-amber-900">{gSum.delayedCount}</span>
                  </div>
                  <div className="bg-rose-50 border border-rose-200 rounded p-1">
                    <span className="block text-[9.5px] text-rose-700">{isKo ? '막힘' : 'Tắc nghẽn'}</span>
                    <span className="font-mono font-bold text-rose-900">{gSum.blockedCount}</span>
                  </div>
                </div>
              </div>

              {/* Detailed Tasks Table & Gantt Timeline */}
              <div className="w-full border border-slate-300 rounded overflow-hidden mb-3">
                <table className="w-full border-collapse text-[10px]">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold border-b border-slate-700">
                      <th className="border-r border-slate-700 px-1.5 py-1 text-center w-10">WBS</th>
                      <th className="border-r border-slate-700 px-2 py-1 text-left w-48">{isKo ? '세부 공정명' : 'Tên công việc'}</th>
                      <th className="border-r border-slate-700 px-1.5 py-1 text-left w-24">{isKo ? '담당자' : 'Người phụ trách'}</th>
                      <th className="border-r border-slate-700 px-1 py-1 text-center w-24">{isKo ? '기간' : 'Thời gian'}</th>
                      <th className="border-r border-slate-700 px-1 py-1 text-center w-14">{isKo ? '상태' : 'Trạng thái'}</th>
                      <th className="border-r border-slate-700 px-1 py-1 text-center w-12">{isKo ? '예정 %' : 'KH %'}</th>
                      <th className="border-r border-slate-700 px-1 py-1 text-center w-12">{isKo ? '실제 %' : 'Thực %'}</th>

                      {/* Phase Scaled Gantt Header Columns */}
                      {phaseDaysArray.map((dayDate, dIdx) => {
                        const dateStr = format(dayDate, 'yyyy-MM-dd');
                        const dayNum = format(dayDate, 'dd');
                        return (
                          <th key={dIdx} className="border-r border-slate-700 px-0.5 py-1 text-center font-mono text-[8px] bg-slate-700 text-slate-200">
                            <div>{dayNum}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {chunkTasks.map((task, tIdx) => {
                      const wbsIndex = `${groupIndex}.${chunkIndex * TASKS_PER_PAGE + tIdx + 1}`;
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
                      const tProgress = task.actual_progress ?? (task.schedule_state === 'COMPLETED' ? 100 : 0);

                      // Calculate span inside scaled phase timeline
                      let tStartCol = 0;
                      let tEndCol = phaseDaysArray.length - 1;

                      if (tStartStr) {
                        const idx = phaseDaysArray.findIndex((d) => format(d, 'yyyy-MM-dd') >= tStartStr);
                        if (idx !== -1) tStartCol = idx;
                      }
                      if (tEndStr) {
                        const idx = phaseDaysArray.findIndex((d) => format(d, 'yyyy-MM-dd') > tEndStr);
                        if (idx !== -1) tEndCol = Math.max(0, idx - 1);
                      }

                      const tSpanCount = Math.max(1, tEndCol - tStartCol + 1);

                      return (
                        <tr key={task.id} className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="border-r border-slate-300 px-1 py-1 text-center font-mono font-bold text-slate-500">
                            {wbsIndex}
                          </td>
                          <td className="border-r border-slate-300 px-2 py-1 font-medium text-slate-900">
                            {tName}
                          </td>
                          <td className="border-r border-slate-300 px-1.5 py-1 text-slate-700 text-[9.5px] truncate">
                            {tPic}
                          </td>
                          <td className="border-r border-slate-300 px-1 py-1 text-center font-mono text-[9px] text-slate-500">
                            {task.start_date?.substring(5)} ~ {task.end_date?.substring(5)}
                          </td>
                          <td className="border-r border-slate-300 px-1 py-1 text-center">
                            <span
                              className="px-1 py-0.5 rounded text-[8.5px] font-bold border inline-block"
                              style={{
                                backgroundColor: taskBadge.backgroundColor,
                                borderColor: badgeStyle.borderColor,
                                color: taskBadge.textColor,
                              }}
                            >
                              {taskBadge.label}
                            </span>
                          </td>
                          <td className="border-r border-slate-300 px-1 py-1 text-center font-mono text-slate-500">
                            {task.progress ?? 0}%
                          </td>
                          <td className="border-r border-slate-300 px-1 py-1 text-center font-mono font-bold text-emerald-700">
                            {tProgress}%
                          </td>

                          {/* Phase Gantt Timeline Cell */}
                          <td colSpan={phaseDaysArray.length} className="p-0 relative h-6 bg-white overflow-hidden">
                            <div className="absolute inset-0 grid w-full h-full" style={{ gridTemplateColumns: `repeat(${phaseDaysArray.length}, minmax(0, 1fr))` }}>
                              {phaseDaysArray.map((dayDate, dIdx) => {
                                const dateStr = format(dayDate, 'yyyy-MM-dd');
                                const isTodayCol = dateStr === referenceDate;

                                return (
                                  <div
                                    key={dIdx}
                                    className={`h-full border-r border-slate-200/40 relative ${isTodayCol ? 'bg-blue-50/40' : ''}`}
                                  >
                                    {isTodayCol && (
                                      <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-blue-600 z-20 pointer-events-none opacity-80" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Task Bar */}
                            <div
                              className="absolute inset-0 grid w-full h-full pointer-events-none z-10"
                              style={{ gridTemplateColumns: `repeat(${phaseDaysArray.length}, minmax(0, 1fr))` }}
                            >
                              <div
                                style={{ gridColumn: `${tStartCol + 1} / span ${tSpanCount}` }}
                                className="flex items-center h-full w-full px-0.5"
                              >
                                <div
                                  className="w-full h-3.5 rounded-xs border relative overflow-hidden flex items-center shadow-2xs"
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
                                  <div className="relative z-10 px-1 text-[8px] font-bold font-mono text-slate-800">
                                    {tProgress}%
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <PrintFooter colorMode={colorMode} lang={lang} viewerName={viewerName} />
          </div>
        );
      })}
    </div>
  );
};

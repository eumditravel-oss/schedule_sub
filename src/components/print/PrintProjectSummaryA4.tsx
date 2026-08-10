// src/components/print/PrintProjectSummaryA4.tsx
import React from 'react';
import { Project, Task, TaskGroup, ProjectWorkerAllocation, Worker } from '../../types';
import { PrintHeader } from './PrintHeader';
import { PrintFooter } from './PrintFooter';
import { PrintColorMode, getPrintStatusBadgeStyle, getPrintGanttBarStyle, getProjectPicSummary, getProjectSupportSummary } from '../../utils/printVisualTokens';
import { calculateProjectProgress } from '../../utils/progressCalculator';
import { parseISO, format, eachWeekOfInterval } from 'date-fns';

export interface PrintProjectSummaryA4Props {
  project: Project;
  tasks: Task[];
  taskGroups: TaskGroup[];
  allocations?: ProjectWorkerAllocation[];
  workers?: Worker[];
  colorMode?: PrintColorMode;
  lang?: 'ko' | 'vi';
  viewerName?: string;
  referenceDate?: string;
}

export const PrintProjectSummaryA4: React.FC<PrintProjectSummaryA4Props> = ({
  project,
  tasks,
  taskGroups,
  allocations = [],
  workers = [],
  colorMode = 'color',
  lang = 'ko',
  viewerName,
  referenceDate = new Date().toISOString().substring(0, 10),
}) => {
  const isKo = lang === 'ko';
  const workerMap = new Map(workers.map((w) => [w.id, w.name]));

  // Calculate project statistics
  const progressInfo = calculateProjectProgress(project, tasks);
  const plannedProgress = progressInfo.planned_progress;
  const actualProgress = progressInfo.actual_progress;

  const isCompleted = project.status === 'COMPLETED' || actualProgress === 100;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.schedule_state === 'COMPLETED' || t.actual_progress === 100).length;
  const blockedTasks = tasks.filter((t) => Boolean(t.is_blocked)).length;
  const delayedTasks = tasks.filter((t) => t.schedule_state === 'DELAYED' || (t.end_date && t.end_date < referenceDate && t.actual_progress !== 100)).length;
  const inProgressTasks = tasks.filter((t) => t.schedule_state === 'IN_PROGRESS' && !t.is_blocked).length;

  const badgeStyle = getPrintStatusBadgeStyle(project.status, colorMode, lang);

  // V2 Domain Semantics: Task PRIMARY = PIC, Task CO_ASSIGNEE = Support
  const projectPic = getProjectPicSummary(tasks, workerMap, lang);
  const projectSupport = getProjectSupportSummary(tasks, workerMap);

  // Task Group summaries
  const groupSummaries = taskGroups.map((group) => {
    const groupTasks = tasks.filter((t) => t.task_group_id === group.id);
    const gTotal = groupTasks.length;
    const gDone = groupTasks.filter((t) => t.schedule_state === 'COMPLETED' || t.actual_progress === 100).length;
    const gBlocked = groupTasks.filter((t) => Boolean(t.is_blocked)).length;
    const gPct = gTotal > 0 ? Math.round((gDone / gTotal) * 100) : 0;
    const gName = isKo ? (group.group_name_ko || group.group_name) : (group.group_name_vi || group.group_name);
    return {
      id: group.id,
      name: gName,
      tasksCount: gTotal,
      doneCount: gDone,
      blockedCount: gBlocked,
      progressPercent: gPct,
    };
  });

  // Timeline Compression (Week-based 1-line timeline)
  const startDate = project.start_date ? parseISO(project.start_date) : new Date();
  const endDate = project.end_date ? parseISO(project.end_date) : new Date();
  let timelineWeeks: Date[] = [];
  try {
    timelineWeeks = eachWeekOfInterval({ start: startDate, end: endDate }, { weekStartsOn: 1 });
  } catch {
    timelineWeeks = [startDate];
  }

  return (
    <div className="print-template-a4-summary flex flex-col justify-between w-full h-full text-slate-900 font-sans text-xs">
      <div>
        {/* Header */}
        <PrintHeader
          title={isKo ? (project.name_ko || project.name) : (project.name_vi || project.name)}
          subtitle={isKo ? '프로젝트 요약 보고서 (A4 Summary)' : 'Báo cáo tóm tắt dự án (A4 Summary)'}
          referenceDate={referenceDate}
          authorName={viewerName}
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
              {badgeStyle.label}
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
              {isCompleted
                ? isKo
                  ? `완료 (${project.completed_at || referenceDate})`
                  : `Đã xong (${project.completed_at || referenceDate})`
                : isKo
                ? '진행 중'
                : 'Đang thực hiện'}
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
                <tr key={g.id} className="hover:bg-slate-50 border-b border-slate-200">
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
  );
};

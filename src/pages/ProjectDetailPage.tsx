// src/pages/ProjectDetailPage.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Project, Task, TaskGroup, TaskGroupColorKey, Worker, ProjectWorkerAllocation, CountryHoliday, CalendarOverride, DailyStatusType, WorkDayStatus, CountryCode, WorkweekProfile, ScheduleConflictDetail, isExecutiveViewer, isEditableWorker, GanttDateColumn, DateColumn } from '../types';
import { WorkerConflictModal } from '../components/modals/WorkerConflictModal';
import { TaskGroupModal } from '../components/modals/TaskGroupModal';
import { TaskGroupDeleteModal } from '../components/modals/TaskGroupDeleteModal';
import { TaskMoveModal } from '../components/modals/TaskMoveModal';
import { api, getCurrentWorkerId, setCurrentWorker as setCurrentWorkerApi } from '../services/api';
import { calculateVisibleGanttSpan } from '../utils/dateUtils';
import { resolveWorkDayStatus, getCountryOffState } from '../utils/workCalendar';
import { getCalendarVisualStyle, CalendarVisualState, buildCalendarHatchPattern } from '../utils/calendarVisualTokens';
import { useGanttDateRange } from '../hooks/useGanttDateRange';
import { useGanttGeometry } from '../hooks/useGanttGeometry';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useI18n } from '../hooks/useI18n';
import { getLocalizedErrorMessage } from '../i18n';
import {
  GANTT_DAY_WIDTH_PX,
  PRIMARY_BUTTON_H36_CLASS,
  TASK_ROW_HEIGHT_PX,
  TASK_GROUP_ROW_HEIGHT_PX,
  EMPTY_GROUP_ROW_HEIGHT_PX,
  GANTT_MONTH_HEADER_HEIGHT_PX,
  GANTT_DATE_HEADER_HEIGHT_PX,
  GANTT_HEADER_TOTAL_HEIGHT_PX,
} from '../constants/gantt';
import { GANTT_Z } from '../constants/ganttLayers';
import { TaskModal } from '../components/modals/TaskModal';
import { ProjectWorkforceModal } from '../components/modals/ProjectWorkforceModal';
import { GlobalCountryCalendarOverlay } from '../components/gantt/GlobalCountryCalendarOverlay';
import { isMonthStartColumn, GANTT_MONTH_BOUNDARY_STYLE } from '../utils/GanttMonthBoundary';
import { WorkerConflictSummaryModal } from '../components/modals/WorkerConflictSummaryModal';
import { StatusPopover } from '../components/modals/StatusPopover';
import { WorkerSelector } from '../components/common/WorkerSelector';
import { ProjectReadinessPopover } from '../components/common/ProjectReadinessPopover';
import { calculateProjectReadiness } from '../utils/projectReadiness';
import { calculateDateVarianceDays, formatVarianceBadgeText } from '../utils/scheduleBaseline';
import { AlertOctagon, BookmarkCheck } from 'lucide-react';
import { WorkerPromptModal } from '../components/modals/WorkerPromptModal';
import { WorkerDayCellBackground } from '../components/gantt/WorkerDayCellBackground';
import { GanttViewControls } from '../components/common/GanttViewControls';
import { MobileAppHeader } from '../components/mobile/MobileAppHeader';
import { MobileWorkerSheet } from '../components/mobile/MobileWorkerSheet';
import { MobileStatusSheet } from '../components/mobile/MobileStatusSheet';
import { MobileSummaryView } from '../components/mobile/MobileSummaryView';
import { MobileWeekView } from '../components/mobile/MobileWeekView';
import { MobileThirtyDayGanttView } from '../components/mobile/MobileThirtyDayGanttView';
import { MobileScheduleInfoSheet } from '../components/mobile/MobileScheduleInfoSheet';
import { CalendarManagerModal } from '../components/modals/CalendarManagerModal';
import { CalendarLegend } from '../components/common/CalendarLegend';
import { DayActionPanel } from '../components/modals/DayActionPanel';
import { DateHeaderInfoPanel } from '../components/modals/DateHeaderInfoPanel';
import { WorkerUtilizationBadge } from '../components/common/WorkerUtilizationBadge';
import { ScheduleShiftHistoryModal } from '../components/modals/ScheduleShiftHistoryModal';
import { BuildVersionIndicator } from '../components/common/BuildVersionIndicator';
import { ScheduleBar } from '../components/gantt/ScheduleBar';
import { TaskAssigneePopover } from '../components/gantt/TaskAssigneePopover';
import { TodayColumnOverlay } from '../components/gantt/TodayColumnOverlay';
import { getTimelineWidth, getMonthSegments } from '../utils/ganttGeometry';
import { getGanttSpanColumns } from '../utils/ganttOverlay';
import { calculateTaskWorkdayBreakdown } from '../utils/workCalendar';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Users,
  CheckCircle,
  RotateCcw,
  Calendar,
  Lock,
  AlertTriangle,
  History,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  ChevronDown,
  GripVertical,
  ArrowRightLeft,
  RotateCw,
} from 'lucide-react';

function getShortWorkerName(fullName?: string | null): string {
  if (!fullName) return '미배정';
  const match = fullName.match(/^([^(]+)/);
  return match ? match[1].trim() : fullName.trim();
}

interface SortableTaskRowProps {
  tItem: Task;
  groupNum: number;
  tIdx: number;
  dateColumns: { dateStr: string; isToday?: boolean }[];
  workers: Worker[];
  countryHolidays: CountryHoliday[];
  calendarOverrides: CalendarOverride[];
  isViewer: boolean;
  isCompleted: boolean;
  lang: string;
  leftPanelWidth: number;
  timelineWidth: number;
  dateGridTemplate: string;
  t?: (key: any) => string;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onMoveTask: (task: Task) => void;
  onCellClick: (tItem: Task, dateStr: string, dayStatus: any, workerObj: any) => void;
  onOpenAssigneePopover?: (task: Task, rect: DOMRect) => void;
}

const SortableTaskRow: React.FC<SortableTaskRowProps> = ({
  tItem,
  groupNum,
  tIdx,
  dateColumns,
  workers,
  countryHolidays,
  calendarOverrides,
  isViewer,
  isCompleted,
  lang,
  leftPanelWidth,
  timelineWidth,
  dateGridTemplate,
  onEditTask,
  onDeleteTask,
  onMoveTask,
  onCellClick,
  onOpenAssigneePopover,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tItem.id,
    data: { type: 'TASK', task: tItem },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    height: `${TASK_ROW_HEIGHT_PX}px`,
  };

  const taskNumStr = `${groupNum}.${tIdx + 1}`;
  const taskTitle = lang === 'vi' ? (tItem.task_name_vi || tItem.task_name) : (tItem.task_name_ko || tItem.task_name);

  const assignees = tItem.assignees || [];
  const primaryAssignee = assignees.find((a) => a.assignment_role === 'PRIMARY') || assignees[0];
  const primaryWorkerName = primaryAssignee ? getShortWorkerName(primaryAssignee.name || primaryAssignee.worker_id) : getShortWorkerName(tItem.worker_name);

  let secondaryWorkerName: string | null = null;
  if (assignees.length >= 2) {
    const sec = assignees.find((a) => a !== primaryAssignee) || assignees[1];
    if (sec) {
      secondaryWorkerName = getShortWorkerName(sec.name || sec.worker_id);
    }
  }

  const spanInfo = getGanttSpanColumns(tItem.start_date, tItem.end_date, dateColumns);

  const taskNameColWidth = leftPanelWidth >= 564 ? 260 : leftPanelWidth >= 504 ? 230 : 210;
  const workerColWidth = leftPanelWidth >= 564 ? 240 : leftPanelWidth >= 504 ? 210 : 170;
  const gridTemplateColumns = `${taskNameColWidth}px ${workerColWidth}px 64px`;

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, position: 'relative', isolation: 'isolate' }}
      role="row"
      data-testid={`task-row-${tItem.id}`}
      className={`hover:bg-slate-50 transition border-b border-slate-200 flex shrink-0 ${isDragging ? 'bg-blue-50/50' : ''}`}
    >
      {/* Sticky Task Info Header Cell with Explicit 3-Column CSS Grid */}
      <div
        role="cell"
        data-testid={`task-left-panel-${tItem.id}`}
        style={{
          width: `${leftPanelWidth}px`,
          minWidth: `${leftPanelWidth}px`,
          maxWidth: `${leftPanelWidth}px`,
          display: 'grid',
          gridTemplateColumns,
          position: 'sticky',
          left: 0,
          zIndex: GANTT_Z.STICKY_LEFT_BODY,
          backgroundColor: '#ffffff',
          backgroundClip: 'padding-box',
          isolation: 'isolate',
        }}
        className="sticky left-0 bg-white hover:!bg-[#f8fafc] border-r border-slate-200 shrink-0 h-full items-center relative"
      >
        <div
          data-testid="gantt-sticky-occlusion-rail"
          style={{
            position: 'absolute',
            top: 0,
            right: '-1px',
            bottom: 0,
            width: '2px',
            backgroundColor: 'inherit',
            pointerEvents: 'none',
            zIndex: 1,
            boxShadow: '4px 0 8px rgba(15, 23, 42, 0.08)',
          }}
        />
        {/* 1. Task Name Column Cell */}
        <div className="flex items-center gap-[4px] min-w-0 pl-[6px] pr-[4px] py-0.5 overflow-hidden h-full">
          {!isViewer && !isCompleted && (
            <button
              type="button"
              data-testid={`task-row-drag-handle-${tItem.id}`}
              {...attributes}
              {...listeners}
              className="w-[18px] h-[24px] flex items-center justify-center rounded-xs text-slate-300 hover:text-slate-600 hover:bg-slate-100 cursor-grab active:cursor-grabbing shrink-0 transition"
              title="드래그하여 공정 이동 또는 순서 변경"
            >
              <GripVertical className="w-3 h-3" />
            </button>
          )}
          <span className="font-bold text-slate-400 shrink-0 text-[11px] mr-1">{taskNumStr}</span>
          <span className="font-extrabold text-slate-800 text-[11px] leading-[16px] truncate" title={taskTitle}>
            {taskTitle}
          </span>
          {(tItem.schedule_status === 'UNSCHEDULED' || (!tItem.start_date && !tItem.end_date)) && (
            <span
              data-testid="unscheduled-task-badge"
              className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-800 font-extrabold text-[10px] shrink-0 ml-1"
            >
              {lang === 'vi' ? 'Chưa xác định' : '일정 미정'}
            </span>
          )}
          {Boolean(tItem.is_blocked) && (
            <span
              data-testid={`task-blocked-badge-${tItem.id}`}
              title={tItem.blocked_reason || (lang === 'vi' ? 'Công việc bị tắc nghẽn' : '작업 진행 막힘')}
              className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-800 font-extrabold text-[10px] shrink-0 ml-1 flex items-center gap-0.5"
            >
              <AlertOctagon className="w-3 h-3 text-rose-600 shrink-0" />
              <span>{lang === 'vi' ? 'Tắc nghẽn' : '막힘'}</span>
            </span>
          )}
          {tItem.baseline_end_date && tItem.end_date && tItem.baseline_end_date !== tItem.end_date && (
            <span
              data-testid={`task-baseline-badge-${tItem.id}`}
              className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 ml-1 border ${
                formatVarianceBadgeText(calculateDateVarianceDays(tItem.baseline_end_date, tItem.end_date), lang === 'vi' ? 'vi' : 'ko').colorClass
              }`}
            >
              {formatVarianceBadgeText(calculateDateVarianceDays(tItem.baseline_end_date, tItem.end_date), lang === 'vi' ? 'vi' : 'ko').text}
            </span>
          )}
        </div>

        {/* 2. Worker Assignees Column Cell */}
        <div
          data-testid={`task-assignee-summary-${tItem.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenAssigneePopover?.(tItem, e.currentTarget.getBoundingClientRect());
          }}
          className="pl-[4px] pr-[4px] py-0.5 overflow-hidden flex items-center gap-1 cursor-pointer hover:bg-slate-100/70 rounded transition h-full"
          title="클릭 시 담당자 상세 보기"
        >
          {/* Primary Worker Badge */}
          <span className="h-[20px] px-[6px] py-0 flex items-center rounded bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px] leading-[18px] truncate max-w-[90px] xl:max-w-[100px]">
            {primaryWorkerName}
          </span>

          {/* Secondary Worker Badge */}
          {secondaryWorkerName && (
            <span className="hidden xl:flex h-[20px] px-[6px] py-0 items-center rounded bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px] leading-[18px] truncate max-w-[90px] xl:max-w-[100px]">
              {secondaryWorkerName}
            </span>
          )}

          {/* +N More Button */}
          {assignees.length > (secondaryWorkerName ? 2 : 1) && (
            <button
              type="button"
              data-testid={`task-assignee-more-${tItem.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenAssigneePopover?.(tItem, e.currentTarget.getBoundingClientRect());
              }}
              className="h-[20px] px-[6px] py-0 flex items-center rounded-full bg-blue-100 hover:bg-blue-200 text-blue-800 font-extrabold text-[10px] leading-[18px] shrink-0 transition"
              title={`추가 담당자 ${assignees.length - (secondaryWorkerName ? 2 : 1)}명 보기`}
            >
              +{assignees.length - (secondaryWorkerName ? 2 : 1)}
            </button>
          )}
        </div>

        {/* 3. Action Buttons Column Cell */}
        <div
          data-testid={`task-action-column-${tItem.id}`}
          className="pl-[2px] pr-[4px] flex items-center justify-end gap-[1px] overflow-hidden h-full"
        >
          {!isViewer && !isCompleted && (
            <>
              <button
                type="button"
                data-testid={`task-move-menu-${tItem.id}`}
                onClick={() => onMoveTask(tItem)}
                className="w-[20px] h-[24px] flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition shrink-0"
                title={lang === 'vi' ? 'Chuyển sang nhóm khác' : '다른 공정으로 이동'}
              >
                <ArrowRightLeft className="w-3 h-3" />
              </button>
              <button
                type="button"
                data-testid={`task-edit-btn-${tItem.id}`}
                onClick={() => onEditTask(tItem)}
                className="w-[20px] h-[24px] flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition shrink-0"
                title={lang === 'vi' ? 'Sửa công việc' : '작업 수정'}
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button
                type="button"
                data-testid={`task-delete-btn-${tItem.id}`}
                onClick={() => onDeleteTask(tItem)}
                className="w-[20px] h-[24px] flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0"
                title={lang === 'vi' ? 'Xóa công việc' : '작업 삭제'}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Right Timeline Cell for all Gantt Days */}
      <div
        role="cell"
        data-testid={`task-timeline-${tItem.id}`}
        style={{ width: `${timelineWidth}px`, minWidth: `${timelineWidth}px` }}
        className="relative shrink-0 h-full"
      >
        {/* Layer 0: Day Cell Background Grid */}
        <div
          className="absolute inset-0 z-0 grid h-full w-full"
          style={{ gridTemplateColumns: dateGridTemplate }}
        >
          {(() => {
            const isUnscheduled = tItem.schedule_status === 'UNSCHEDULED' || !tItem.start_date || !tItem.end_date;
            return dateColumns.map((col, cIdx) => {
              const isInRange = !isUnscheduled && col.dateStr >= tItem.start_date! && col.dateStr <= tItem.end_date!;
              const workerObj = workers.find((w) => w.name === tItem.worker_name) || null;
              const dayStatus = resolveWorkDayStatus(col.dateStr, (workerObj || { id: tItem.worker_name, name: tItem.worker_name }) as any, countryHolidays, calendarOverrides);
              const isMonthStart = isMonthStartColumn(dateColumns, cIdx);
              return (
                <div
                  key={cIdx}
                  data-testid={`gantt-task-cell-${tItem.id}-${col.dateStr}`}
                  data-month-boundary={isMonthStart ? 'true' : undefined}
                  onClick={() => onCellClick(tItem, col.dateStr, dayStatus, workerObj)}
                  style={{ boxSizing: 'border-box', ...(isMonthStart ? GANTT_MONTH_BOUNDARY_STYLE : {}) }}
                  className={`border-r border-slate-200 cursor-pointer h-full ${isInRange ? 'bg-blue-50/30' : ''}`}
                />
              );
            });
          })()}
        </div>

        {/* Layer 5: Today Column Overlay Highlight */}
        <TodayColumnOverlay dateColumns={dateColumns} dayWidthPx={timelineWidth / dateColumns.length} />

        {/* Layer 10: ScheduleBar Grid Column Overlay (z-10) */}
        {spanInfo && (
          <div
            className="absolute inset-0 z-10 grid h-full w-full pointer-events-none"
            style={{ gridTemplateColumns: dateGridTemplate }}
          >
            <div
              data-testid={`gantt-schedule-bar-track-${tItem.id}`}
              style={{ gridColumn: `${spanInfo.startIndex + 1} / span ${spanInfo.spanCount}` }}
              className="flex items-center h-full w-full pointer-events-auto"
            >
              <ScheduleBar
                title={taskTitle}
                startDate={tItem.start_date || ''}
                endDate={tItem.end_date || ''}
                calendarSpanDays={spanInfo.spanCount}
                plannedWorkingDays={tItem.planned_working_days || spanInfo.spanCount}
                plannedProgress={tItem.planned_progress ?? tItem.progress ?? 0}
                actualProgress={tItem.actual_progress ?? tItem.progress ?? 0}
                status={tItem.schedule_state || 'UPCOMING'}
                hasConflict={tItem.has_schedule_conflict}
                onClick={() => onEditTask(tItem)}
              />
            </div>
          </div>
        )}

        {/* Layer 20: Worker/Country Off & Vacation Hatch Grid (z-20) */}
        <div
          className="absolute inset-0 z-20 grid h-full w-full pointer-events-none"
          style={{ gridTemplateColumns: dateGridTemplate }}
        >
          {dateColumns.map((col, cIdx) => {
            const workerObj = workers.find((w) => w.name === tItem.worker_name) || null;
            const dayStatus = resolveWorkDayStatus(col.dateStr, (workerObj || { id: tItem.worker_name, name: tItem.worker_name }) as any, countryHolidays, calendarOverrides);
            return (
              <WorkerDayCellBackground
                key={cIdx}
                dateStr={col.dateStr}
                taskId={tItem.id}
                taskStartDate={tItem.start_date}
                taskEndDate={tItem.end_date}
                worker={workerObj as any}
                assignees={tItem.assignees}
                availabilityPolicy={tItem.availability_policy}
                dayStatus={dayStatus}
                countryHolidays={countryHolidays}
                calendarOverrides={calendarOverrides}
                workers={workers}
                isToday={col.isToday}
                isOverlayOnly={true}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface DroppableTaskGroupRowProps {
  group: TaskGroup;
  groupNum: number;
  groupTasks: Task[];
  isCollapsed: boolean;
  dateColumnsCount: number;
  isViewer: boolean;
  isCompleted: boolean;
  lang: string;
  leftPanelWidth: number;
  timelineWidth: number;
  dateColumns?: DateColumn[];
  dateGridTemplate?: string;
  onToggleCollapse: (groupId: string) => void;
  onOpenEditGroup: (group: TaskGroup) => void;
  onOpenDeleteGroup: (group: TaskGroup, taskCount: number) => void;
  onOpenAddTaskInGroup: (groupId: string) => void;
  isOver: boolean;
}

const DroppableTaskGroupRow: React.FC<DroppableTaskGroupRowProps> = ({
  group,
  groupNum,
  groupTasks,
  isCollapsed,
  dateColumnsCount,
  isViewer,
  isCompleted,
  lang,
  leftPanelWidth,
  timelineWidth,
  dateColumns,
  dateGridTemplate,
  onToggleCollapse,
  onOpenEditGroup,
  onOpenDeleteGroup,
  onOpenAddTaskInGroup,
  isOver,
}) => {
  const { setNodeRef: setDropNodeRef } = useDroppable({
    id: `drop-group-${group.id}`,
  });

  const {
    attributes,
    listeners,
    setNodeRef: setSortableNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: group.id,
    disabled: isViewer || isCompleted,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    height: `${TASK_GROUP_ROW_HEIGHT_PX}px`,
  };

  const groupName = lang === 'vi' ? (group.group_name_vi || group.group_name) : (group.group_name_ko || group.group_name);
  const colorKey = group.color_key || 'BLUE';

  const GROUP_BORDER_COLORS: Record<TaskGroupColorKey, string> = {
    BLUE: 'border-l-blue-500',
    GREEN: 'border-l-emerald-500',
    ORANGE: 'border-l-amber-500',
    VIOLET: 'border-l-purple-500',
    SLATE: 'border-l-slate-500',
  };

  return (
    <div
      ref={(node) => {
        setDropNodeRef(node);
        setSortableNodeRef(node);
      }}
      style={{ ...style, position: 'relative', isolation: 'isolate' }}
      role="row"
      data-testid={`task-group-row-${group.id}`}
      data-testid-dropzone={`task-group-drop-zone-${group.id}`}
      className={`transition border-b border-slate-200 flex shrink-0 ${
        isOver
          ? 'bg-blue-100 border-2 border-dashed border-blue-500'
          : 'bg-slate-100 hover:bg-slate-200'
      }`}
    >
      <div
        role="cell"
        data-testid={`task-group-left-panel-${group.id}`}
        style={{
          width: `${leftPanelWidth}px`,
          minWidth: `${leftPanelWidth}px`,
          maxWidth: `${leftPanelWidth}px`,
          position: 'sticky',
          left: 0,
          zIndex: GANTT_Z.STICKY_LEFT_GROUP,
          backgroundColor: isOver ? '#dbeafe' : '#f1f5f9',
          backgroundClip: 'padding-box',
          isolation: 'isolate',
        }}
        className={`sticky left-0 border-r border-slate-200 border-l-4 ${GROUP_BORDER_COLORS[colorKey]} shrink-0 flex items-center h-full relative ${
          isOver ? 'bg-blue-100' : 'bg-slate-100'
        }`}
      >
        <div
          data-testid="gantt-sticky-occlusion-rail"
          style={{
            position: 'absolute',
            top: 0,
            right: '-1px',
            bottom: 0,
            width: '2px',
            backgroundColor: isOver ? '#dbeafe' : '#f1f5f9',
            pointerEvents: 'none',
            zIndex: 1,
            boxShadow: '4px 0 8px rgba(15, 23, 42, 0.08)',
          }}
        />
        <div className="flex items-center justify-between text-xs font-bold text-slate-800 w-full">
          <div className="flex items-center gap-1 min-w-0 pr-2">
            {!isViewer && !isCompleted && (
              <button
                type="button"
                data-testid={`task-group-drag-handle-${group.id}`}
                {...attributes}
                {...listeners}
                className="w-5 h-6 flex items-center justify-center rounded-xs text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 cursor-grab active:cursor-grabbing shrink-0 transition"
                title="공정 순서 변경"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              data-testid={`task-group-toggle-${group.id}`}
              onClick={() => onToggleCollapse(group.id)}
              className="p-0.5 rounded-md hover:bg-slate-200 text-slate-600 transition shrink-0"
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            <span className="font-extrabold text-blue-900 shrink-0 text-xs">{groupNum}.</span>
            <span className="font-extrabold text-slate-900 truncate" title={groupName}>
              {groupName}
            </span>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] shrink-0 ml-1">
              {groupTasks.length}
            </span>

            {isOver && (
              <span className="px-1.5 py-0.5 rounded-md bg-blue-600 text-white font-bold text-[10px] animate-pulse shrink-0 ml-1">
                {lang === 'vi' ? 'Thả vào đây để chuyển nhóm' : '여기에 놓아 공정 이동'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!isViewer && !isCompleted && (
              <>
                <button
                  type="button"
                  data-testid={`task-group-add-task-${group.id}`}
                  onClick={() => onOpenAddTaskInGroup(group.id)}
                  className="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-[11px] flex items-center gap-0.5 transition"
                >
                  <Plus className="w-3 h-3 text-blue-600" />
                  <span>{lang === 'vi' ? '+ Thêm' : '+ 세부 작업'}</span>
                </button>

                <button
                  type="button"
                  data-testid={`task-group-edit-${group.id}`}
                  onClick={() => onOpenEditGroup(group)}
                  className="p-1 rounded-md text-slate-500 hover:text-blue-600 hover:bg-slate-200/60 transition"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  data-testid={`task-group-delete-${group.id}`}
                  onClick={() => onOpenDeleteGroup(group, groupTasks.length)}
                  className="p-1 rounded-md text-slate-500 hover:text-rose-600 hover:bg-slate-200/60 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div
        role="cell"
        style={{ width: `${timelineWidth}px`, minWidth: `${timelineWidth}px`, height: `${TASK_GROUP_ROW_HEIGHT_PX}px` }}
        className={`relative shrink-0 ${isOver ? 'bg-blue-50/50' : ''}`}
      >
        {dateGridTemplate && dateColumns && (
          <div className="absolute inset-0 z-0 grid h-full w-full pointer-events-none" style={{ gridTemplateColumns: dateGridTemplate }}>
            {dateColumns.map((col, cIdx) => {
              const isMonthStart = isMonthStartColumn(dateColumns, cIdx);
              return (
                <div
                  key={cIdx}
                  data-month-boundary={isMonthStart ? 'true' : undefined}
                  style={{ boxSizing: 'border-box', ...(isMonthStart ? GANTT_MONTH_BOUNDARY_STYLE : {}) }}
                  className="border-r border-slate-200 h-full"
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const EmptyGroupDropZoneCard: React.FC<{
  groupId: string;
  leftPanelWidth: number;
  timelineWidth: number;
  lang: string;
  isOver: boolean;
  dateColumns?: DateColumn[];
  dateGridTemplate?: string;
}> = ({ groupId, leftPanelWidth, timelineWidth, lang, isOver, dateColumns, dateGridTemplate }) => {
  const { setNodeRef } = useDroppable({
    id: `drop-group-${groupId}`,
  });

  return (
    <div
      ref={setNodeRef}
      role="row"
      data-testid={`task-group-empty-drop-zone-${groupId}`}
      style={{ height: `${EMPTY_GROUP_ROW_HEIGHT_PX}px` }}
      className={`border-b border-dashed border-slate-300 transition flex shrink-0 ${
        isOver ? 'bg-blue-100 border-blue-500 font-bold text-blue-800' : 'bg-slate-50/70 text-slate-400'
      }`}
    >
      <div
        role="cell"
        style={{
          width: `${leftPanelWidth}px`,
          minWidth: `${leftPanelWidth}px`,
          maxWidth: `${leftPanelWidth}px`,
          position: 'sticky',
          left: 0,
          zIndex: GANTT_Z.STICKY_LEFT_BODY,
          backgroundColor: isOver ? '#dbeafe' : '#f8fafc',
          backgroundClip: 'padding-box',
          isolation: 'isolate',
        }}
        className="sticky left-0 bg-slate-50 px-4 py-1.5 border-r border-slate-200 text-xs font-semibold text-center italic shrink-0 flex items-center justify-center h-full relative"
      >
        {lang === 'vi' ? 'Kéo công việc chi tiết vào đây' : '세부 작업을 여기에 끌어오세요'}
        <div
          data-testid="gantt-sticky-occlusion-rail"
          style={{
            position: 'absolute',
            top: 0,
            right: '-1px',
            bottom: 0,
            width: '2px',
            backgroundColor: isOver ? '#dbeafe' : '#f8fafc',
            pointerEvents: 'none',
            zIndex: 1,
            boxShadow: '4px 0 8px rgba(15, 23, 42, 0.08)',
          }}
        />
      </div>
      <div role="cell" style={{ width: `${timelineWidth}px`, minWidth: `${timelineWidth}px` }} className="h-full shrink-0 relative">
        {dateGridTemplate && dateColumns && (
          <div className="absolute inset-0 z-0 grid h-full w-full pointer-events-none" style={{ gridTemplateColumns: dateGridTemplate }}>
            {dateColumns.map((col, cIdx) => {
              const isMonthStart = isMonthStartColumn(dateColumns, cIdx);
              return (
                <div
                  key={cIdx}
                  data-month-boundary={isMonthStart ? 'true' : undefined}
                  style={{ boxSizing: 'border-box', ...(isMonthStart ? GANTT_MONTH_BOUNDARY_STYLE : {}) }}
                  className="border-r border-slate-200 h-full"
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const TaskDragOverlay: React.FC<{ activeDragItem: any; lang: string }> = ({ activeDragItem, lang }) => {
  if (!activeDragItem) return null;

  if (activeDragItem.type === 'TASK' && activeDragItem.task) {
    const tItem = activeDragItem.task;
    const taskTitle = lang === 'vi' ? (tItem.task_name_vi || tItem.task_name) : (tItem.task_name_ko || tItem.task_name);
    const assignees = tItem.assignees || [];
    const primaryAssignee = assignees.find((a: any) => a.assignment_role === 'PRIMARY') || assignees[0];
    const primaryWorkerName = primaryAssignee ? (primaryAssignee.name || primaryAssignee.worker_id) : (tItem.worker_name || '미배정');
    const extraCount = Math.max(0, assignees.length - 1);

    return (
      <div
        data-testid="task-drag-overlay"
        className="w-[320px] h-10 px-3 bg-white border border-blue-400 rounded-xl shadow-xl flex items-center justify-between text-xs opacity-95 pointer-events-none cursor-grabbing"
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          <GripVertical className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="font-extrabold text-slate-800 truncate">{taskTitle}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <span className="px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-800 font-bold text-[11px]">
            {primaryWorkerName}
          </span>
          {extraCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white font-bold text-[10px]">
              +{extraCount}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (activeDragItem.type === 'GROUP' && activeDragItem.group) {
    const group = activeDragItem.group;
    const groupName = lang === 'vi' ? (group.group_name_vi || group.group_name) : (group.group_name_ko || group.group_name);
    return (
      <div
        data-testid="task-drag-overlay"
        className="w-[300px] h-10 px-3 bg-slate-900 text-white rounded-xl shadow-2xl flex items-center gap-2 text-xs font-extrabold opacity-95 pointer-events-none cursor-grabbing"
      >
        <GripVertical className="w-4 h-4 text-blue-400" />
        <span>{groupName}</span>
      </div>
    );
  }

  return null;
};

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { t, lang, setLanguage } = useI18n();
  const { isMobile, isTabletFold } = useResponsiveLayout();
  const isMobileView = isMobile || isTabletFold;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`schedule_task_group_collapsed_${projectId}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<TaskGroup | null>(null);
  const [deleteGroupModalState, setDeleteGroupModalState] = useState<{
    isOpen: boolean;
    group: TaskGroup | null;
    taskCount: number;
  }>({
    isOpen: false,
    group: null,
    taskCount: 0,
  });

  // Task Move Modal State
  const [moveModalState, setMoveModalState] = useState<{
    isOpen: boolean;
    task: Task | null;
  }>({
    isOpen: false,
    task: null,
  });

  // Toast with Undo state
  const [toastState, setToastState] = useState<{
    isOpen: boolean;
    message: string;
    undoData?: {
      previousGroups: TaskGroup[];
      previousTasks: Task[];
    } | null;
  }>({
    isOpen: false,
    message: '',
    undoData: null,
  });

  // DND Active State
  const [activeDragItem, setActiveDragItem] = useState<{
    type: 'TASK' | 'GROUP';
    id: string;
    task?: Task;
    group?: TaskGroup;
  } | null>(null);

  const [overGroupId, setOverGroupId] = useState<string | null>(null);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 5,
    },
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 250,
      tolerance: 5,
    },
  });

  const sensors = useSensors(pointerSensor, touchSensor);

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [countryHolidays, setCountryHolidays] = useState<CountryHoliday[]>([]);
  const [calendarOverrides, setCalendarOverrides] = useState<CalendarOverride[]>([]);
  const [loading, setLoading] = useState(true);

  // Mobile View Mode
  const [mobileViewMode, setMobileViewMode] = useState<'SUMMARY' | 'WEEK' | 'GANTT'>(() => {
    try {
      const saved = localStorage.getItem('schedule_mobile_view_mode');
      if (saved === 'WEEK' || saved === 'GANTT') return saved;
    } catch {}
    return 'SUMMARY';
  });

  const handleMobileViewChange = (mode: 'SUMMARY' | 'WEEK' | 'GANTT') => {
    setMobileViewMode(mode);
    try {
      localStorage.setItem('schedule_mobile_view_mode', mode);
    } catch {}
  };

  // Worker & Modal States
  const [currentWorker, setCurrentWorker] = useState<Worker | null>(null);
  const [isWorkerPromptOpen, setIsWorkerPromptOpen] = useState(false);
  const [isMobileWorkerSheetOpen, setIsMobileWorkerSheetOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isShiftHistoryOpen, setIsShiftHistoryOpen] = useState(false);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isWorkforceModalOpen, setIsWorkforceModalOpen] = useState(false);
  const [allocations, setAllocations] = useState<ProjectWorkerAllocation[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const [conflictModalState, setConflictModalState] = useState<{
    isOpen: boolean;
    conflicts: ScheduleConflictDetail[];
    pendingTaskData: (Partial<Task> & Record<string, any>) | null;
  }>({
    isOpen: false,
    conflicts: [],
    pendingTaskData: null,
  });

  // Info Sheet State
  const [infoSheetState, setInfoSheetState] = useState<{
    isOpen: boolean;
    task: Task | null;
  }>({
    isOpen: false,
    task: null,
  });

  // Status Popover State (Desktop)
  const [popoverState, setPopoverState] = useState<{
    isOpen: boolean;
    taskId: string;
    dateStr: string;
    currentStatus: DailyStatusType;
    anchorRect: DOMRect | null;
  }>({
    isOpen: false,
    taskId: '',
    dateStr: '',
    currentStatus: 'NONE',
    anchorRect: null,
  });

  // Mobile Status Sheet State
  const [mobileStatusSheetState, setMobileStatusSheetState] = useState<{
    isOpen: boolean;
    taskId: string;
    dateStr: string;
    taskName: string;
    currentStatus: DailyStatusType;
    workStatus?: WorkDayStatus;
  }>({
    isOpen: false,
    taskId: '',
    dateStr: '',
    taskName: '',
    currentStatus: 'NONE',
  });

  const [dayActionState, setDayActionState] = useState<{
    isOpen: boolean;
    task: Task | null;
    dateStr: string;
    dayStatus: WorkDayStatus | null;
    workerObj: Worker | null;
  }>({
    isOpen: false,
    task: null,
    dateStr: '',
    dayStatus: null,
    workerObj: null,
  });

  const [headerInfoState, setHeaderInfoState] = useState<{
    isOpen: boolean;
    dateStr: string;
    dayName: string;
  }>({
    isOpen: false,
    dateStr: '',
    dayName: '',
  });

  const handleCellClick = (taskItem: Task, dateStr: string, dayStatus: WorkDayStatus, workerObj: Worker | null) => {
    setDayActionState({
      isOpen: true,
      task: taskItem,
      dateStr,
      dayStatus,
      workerObj,
    });
  };

  const handleUpdateDailyStatus = async (taskId: string, dateStr: string, status: DailyStatusType) => {
    try {
      await api.updateDailyStatus(taskId, dateStr, status);
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleCreateOverrideFromCell = async (overrideType: 'LEAVE' | 'OFF' | 'WORK') => {
    if (!dayActionState.task || !dayActionState.workerObj) return;
    try {
      await api.createOverride({
        scope_type: 'WORKER',
        scope_key: dayActionState.workerObj.id,
        start_date: dayActionState.dateStr,
        end_date: dayActionState.dateStr,
        override_type: overrideType,
        confirm_leave_schedule_cascade: true,
      });
      await fetchCalendarData();
      await fetchProjectDetail();
    } catch (err: any) {
      if (err.code === 'LEAVE_SCHEDULE_CASCADE_CONFIRMATION_REQUIRED') {
        if (confirm(err.message + '\n\n' + (lang === 'vi' ? 'Bạn có muốn chuyển lịch công việc không?' : '작업 일정을 이연하시겠습니까?'))) {
          await api.createOverride({
            scope_type: 'WORKER',
            scope_key: dayActionState.workerObj.id,
            start_date: dayActionState.dateStr,
            end_date: dayActionState.dateStr,
            override_type: overrideType,
            confirm_leave_schedule_cascade: true,
          });
          await fetchCalendarData();
          await fetchProjectDetail();
          return;
        }
      }
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleClearOverrideFromCell = async (overrideId?: string) => {
    if (!dayActionState.task || !dayActionState.workerObj) return;
    try {
      if (overrideId) {
        await api.deleteOverride(overrideId);
      } else {
        const ovr = calendarOverrides.find(
          (o) => o.scope_type === 'WORKER' && (o.scope_key === dayActionState.workerObj?.id || o.scope_key === dayActionState.workerObj?.name) && o.work_date === dayActionState.dateStr
        );
        if (ovr) {
          await api.deleteOverride(ovr.id);
        }
      }
      await fetchCalendarData();
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const detailDateColumns = useMemo(() => {
    if (!project?.start_date || !project?.end_date) return [];
    const cols = [];
    let cur = new Date(`${project.start_date}T00:00:00Z`);
    const endObj = new Date(`${project.end_date}T00:00:00Z`);
    const todayStr = new Date().toISOString().slice(0, 10);
    const dayNamesKo = ['일', '월', '화', '수', '목', '금', '토'];
    const dayNamesVi = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

    while (cur <= endObj) {
      const dateStr = cur.toISOString().slice(0, 10);
      const dayOfWeek = cur.getUTCDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const monthStr = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`;
      cols.push({
        dateStr,
        date: new Date(cur),
        dayNum: cur.getUTCDate(),
        dayNumber: cur.getUTCDate(),
        dayOfWeek,
        dayName: lang === 'vi' ? dayNamesVi[dayOfWeek] : dayNamesKo[dayOfWeek],
        isToday: dateStr === todayStr,
        isWeekend,
        monthStr,
      });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return cols;
  }, [project?.start_date, project?.end_date, lang]);

  const detailMonthGroups = useMemo(() => {
    if (detailDateColumns.length === 0) return [];
    const groups: { monthStr: string; startIndex: number; span: number }[] = [];
    let currentMonth = '';
    let currentGroup: { monthStr: string; startIndex: number; span: number } | null = null;

    detailDateColumns.forEach((col, idx) => {
      const parts = col.dateStr.split('-');
      const monthKey = `${parts[0]}-${parts[1]}`;
      const year = parts[0];
      const monthNum = Number(parts[1]);
      const monthLabel = lang === 'vi' ? `Tháng ${monthNum}, ${year}` : `${year}년 ${monthNum}월`;

      if (monthKey !== currentMonth) {
        currentMonth = monthKey;
        if (currentGroup) groups.push(currentGroup);
        currentGroup = { monthStr: monthLabel, startIndex: idx, span: 1 };
      } else if (currentGroup) {
        currentGroup.span += 1;
      }
    });
    if (currentGroup) groups.push(currentGroup);
    return groups;
  }, [detailDateColumns, lang]);

  const dateColumns = detailDateColumns;
  const monthGroups = detailMonthGroups;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { width: windowWidth } = useResponsiveLayout();
  let DETAIL_LEFT_WIDTH = 444;
  if (windowWidth >= 1536) {
    DETAIL_LEFT_WIDTH = 564;
  } else if (windowWidth >= 1280) {
    DETAIL_LEFT_WIDTH = 504;
  }

  const {
    timelineWidth,
    dateGridTemplate,
  } = useGanttGeometry({
    containerRef: scrollContainerRef,
    leftPanelWidth: DETAIL_LEFT_WIDTH,
    dateCount: dateColumns.length,
    minDayWidthPx: GANTT_DAY_WIDTH_PX,
  });

  const fetchCalendarData = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const [wData, krData, vnData, ovrData] = await Promise.all([
        api.getWorkers(),
        api.getHolidays('KR', currentYear),
        api.getHolidays('VN', currentYear),
        api.getOverrides(),
      ]);
      const workerList = wData || [];
      setWorkers(workerList);
      setCountryHolidays([...(krData || []), ...(vnData || [])]);
      setCalendarOverrides(ovrData || []);

      const savedId = getCurrentWorkerId();
      const found = workerList.find((w) => w.id === savedId || w.name === savedId);
      if (found) {
        setCurrentWorker(found);
        setLanguage(found.ui_language || (found.country_code === 'VN' ? 'vi' : 'ko'));
      } else {
        setIsWorkerPromptOpen(true);
      }
    } catch (err) {
      console.error('Failed to fetch calendar data in detail:', err);
    }
  };

  const fetchProjectDetail = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [data, allocData] = await Promise.all([
        api.getProjectDetail(projectId),
        api.getProjectWorkerAllocations(projectId),
      ]);
      setProject(data.project);
      setTasks(data.tasks || []);
      setTaskGroups(data.task_groups || []);
      setAllocations(allocData || []);
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
      navigate('/projects');
    } finally {
      setLoading(false);
    }
  };

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroupIds((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      try {
        localStorage.setItem(`schedule_task_group_collapsed_${projectId}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleOpenAddGroup = () => {
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    setSelectedGroup(null);
    setIsGroupModalOpen(true);
  };

  const handleOpenEditGroup = (group: TaskGroup) => {
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    setSelectedGroup(group);
    setIsGroupModalOpen(true);
  };

  const handleSaveGroup = async (data: Partial<TaskGroup>) => {
    if (!projectId) return;
    try {
      if (selectedGroup) {
        await api.updateTaskGroup(selectedGroup.id, data);
      } else {
        await api.createTaskGroup(projectId, data);
      }
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleDeleteGroup = async (group: TaskGroup) => {
    if (isViewer || isCompleted) return;
    if (!requireWorkerSelection()) return;

    const groupTasks = tasks.filter((t) => t.task_group_id === group.id);
    if (groupTasks.length > 0) {
      setDeleteGroupModalState({
        isOpen: true,
        group,
        taskCount: groupTasks.length,
      });
      return;
    }

    const gName = lang === 'vi' ? (group.group_name_vi || group.group_name) : (group.group_name_ko || group.group_name);
    if (!confirm(lang === 'vi' ? `Bạn có chắc muốn xóa nhóm [${gName}]?` : `공정 대분류 [${gName}]을 삭제하시겠습니까?`)) return;

    try {
      await api.deleteTaskGroup(group.id);
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleConfirmDeleteGroup = async (options: { move_to_group_id?: string; delete_tasks?: boolean }) => {
    if (!deleteGroupModalState.group) return;
    try {
      await api.deleteTaskGroup(deleteGroupModalState.group.id, options);
      await fetchProjectDetail();
      setDeleteGroupModalState({ isOpen: false, group: null, taskCount: 0 });
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleOpenAddTaskInGroup = (groupId: string) => {
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;

    setSelectedTask({
      task_group_id: groupId,
    } as any);
    setIsTaskModalOpen(true);
  };

  // Helper to build group structure payload for API
  const buildGroupStructurePayload = (groupsList: TaskGroup[], tasksList: Task[]) => {
    const payloadGroups = groupsList.map((grp, gIdx) => {
      const groupTasks = tasksList.filter(
        (tItem) => tItem.task_group_id === grp.id || (!tItem.task_group_id && gIdx === 0)
      );
      return {
        group_id: grp.id,
        sort_order: gIdx + 1,
        task_ids: groupTasks.map((tItem) => tItem.id),
      };
    });
    return { groups: payloadGroups };
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeId = String(active.id);

    const taskObj = tasks.find((tItem) => tItem.id === activeId);
    if (taskObj) {
      setActiveDragItem({ type: 'TASK', id: activeId, task: taskObj });
      return;
    }

    const groupObj = taskGroups.find((g) => g.id === activeId);
    if (groupObj) {
      setActiveDragItem({ type: 'GROUP', id: activeId, group: groupObj });
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) {
      setOverGroupId(null);
      return;
    }
    const overId = String(over.id);
    if (overId.startsWith('drop-group-')) {
      setOverGroupId(overId.replace('drop-group-', ''));
    } else {
      const overTask = tasks.find((tItem) => tItem.id === overId);
      if (overTask && overTask.task_group_id) {
        setOverGroupId(overTask.task_group_id);
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragItem(null);
    setOverGroupId(null);

    if (!over || isViewer || isCompleted) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const previousGroups = [...taskGroups];
    const previousTasks = [...tasks];

    // CASE 1: Task Dragging
    const activeTask = tasks.find((tItem) => tItem.id === activeId);
    if (activeTask) {
      let targetGroupId: string | null = null;
      let targetIndex = 0;

      if (overId.startsWith('drop-group-')) {
        targetGroupId = overId.replace('drop-group-', '');
        const targetTasks = tasks.filter((tItem) => tItem.task_group_id === targetGroupId);
        targetIndex = targetTasks.length;
      } else {
        const overTask = tasks.find((tItem) => tItem.id === overId);
        if (overTask) {
          targetGroupId = overTask.task_group_id || taskGroups[0]?.id;
          const targetGroupTasks = tasks.filter((tItem) => (tItem.task_group_id || taskGroups[0]?.id) === targetGroupId);
          targetIndex = targetGroupTasks.findIndex((tItem) => tItem.id === overId);
        }
      }

      if (!targetGroupId) return;

      const sourceGroupId = activeTask.task_group_id || taskGroups[0]?.id;
      const targetGroupObj = taskGroups.find((g) => g.id === targetGroupId) || taskGroups[0];
      const targetGroupName = lang === 'vi' ? (targetGroupObj?.group_name_vi || targetGroupObj?.group_name) : (targetGroupObj?.group_name_ko || targetGroupObj?.group_name);

      const updatedTasks = tasks.map((tItem) => {
        if (tItem.id === activeId) {
          return { ...tItem, task_group_id: targetGroupId! };
        }
        return tItem;
      });

      setTasks(updatedTasks);

      const isGroupChanged = sourceGroupId !== targetGroupId;
      const toastMsg = isGroupChanged
        ? (lang === 'vi' ? `Đã chuyển công việc sang nhóm '${targetGroupName}'.` : `작업을 '${targetGroupName}' 공정으로 이동했습니다.`)
        : (lang === 'vi' ? 'Đã thay đổi thứ tự công việc.' : '작업 순서를 변경했습니다.');

      setToastState({
        isOpen: true,
        message: toastMsg,
        undoData: { previousGroups, previousTasks },
      });

      setTimeout(() => {
        setToastState((prev) => (prev.message === toastMsg ? { ...prev, isOpen: false } : prev));
      }, 5000);

      try {
        const payload = buildGroupStructurePayload(taskGroups, updatedTasks);
        await api.updateTaskStructureOrder(projectId!, payload.groups, {
          moved_task_id: activeId,
          source_group_id: sourceGroupId,
          target_group_id: targetGroupId,
          target_index: targetIndex,
        });
      } catch (err: any) {
        setTasks(previousTasks);
        setToastState({
          isOpen: true,
          message: getLocalizedErrorMessage(err, t),
          undoData: null,
        });
      }
      return;
    }

    // CASE 2: TaskGroup Dragging
    const activeGroupIndex = taskGroups.findIndex((g) => g.id === activeId);
    let overGroupIndex = taskGroups.findIndex((g) => g.id === overId || `drop-group-${g.id}` === overId);

    if (activeGroupIndex !== -1 && overGroupIndex !== -1 && activeGroupIndex !== overGroupIndex) {
      const reorderedGroups = arrayMove(taskGroups, activeGroupIndex, overGroupIndex).map((g, idx) => ({
        ...g,
        sort_order: idx + 1,
      }));

      setTaskGroups(reorderedGroups);

      const toastMsg = lang === 'vi' ? 'Đã thay đổi thứ tự nhóm công việc.' : '공정 대분류 순서를 변경했습니다.';
      setToastState({
        isOpen: true,
        message: toastMsg,
        undoData: { previousGroups, previousTasks },
      });

      setTimeout(() => {
        setToastState((prev) => (prev.message === toastMsg ? { ...prev, isOpen: false } : prev));
      }, 5000);

      try {
        const payload = buildGroupStructurePayload(reorderedGroups, tasks);
        await api.updateTaskStructureOrder(projectId!, payload.groups, {
          group_reordered: true,
        });
      } catch (err: any) {
        setTaskGroups(previousGroups);
        setToastState({
          isOpen: true,
          message: getLocalizedErrorMessage(err, t),
          undoData: null,
        });
      }
    }
  };

  const handleUndoStructure = async () => {
    if (!toastState.undoData || !projectId) return;
    const { previousGroups, previousTasks } = toastState.undoData;

    setTaskGroups(previousGroups);
    setTasks(previousTasks);
    setToastState({ isOpen: false, message: '', undoData: null });

    try {
      const payload = buildGroupStructurePayload(previousGroups, previousTasks);
      await api.updateTaskStructureOrder(projectId, payload.groups, {
        change_type: 'UNDO_RESTORED',
      });
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
      await fetchProjectDetail();
    }
  };

  const handleMoveTaskToGroup = async (taskId: string, targetGroupId: string) => {
    if (!projectId) return;
    const activeTask = tasks.find((tItem) => tItem.id === taskId);
    if (!activeTask) return;

    const previousGroups = [...taskGroups];
    const previousTasks = [...tasks];
    const sourceGroupId = activeTask.task_group_id || taskGroups[0]?.id;

    const targetGroupObj = taskGroups.find((g) => g.id === targetGroupId) || taskGroups[0];
    const targetGroupName = lang === 'vi' ? (targetGroupObj?.group_name_vi || targetGroupObj?.group_name) : (targetGroupObj?.group_name_ko || targetGroupObj?.group_name);

    const updatedTasks = tasks.map((tItem) => {
      if (tItem.id === taskId) {
        return { ...tItem, task_group_id: targetGroupId };
      }
      return tItem;
    });

    setTasks(updatedTasks);

    const toastMsg = lang === 'vi' ? `Đã chuyển công việc sang nhóm '${targetGroupName}'.` : `작업을 '${targetGroupName}' 공정으로 이동했습니다.`;
    setToastState({
      isOpen: true,
      message: toastMsg,
      undoData: { previousGroups, previousTasks },
    });

    setTimeout(() => {
      setToastState((prev) => (prev.message === toastMsg ? { ...prev, isOpen: false } : prev));
    }, 5000);

    try {
      const payload = buildGroupStructurePayload(taskGroups, updatedTasks);
      await api.updateTaskStructureOrder(projectId, payload.groups, {
        moved_task_id: taskId,
        source_group_id: sourceGroupId,
        target_group_id: targetGroupId,
      });
    } catch (err: any) {
      setTasks(previousTasks);
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const [popoverTask, setPopoverTask] = useState<Task | null>(null);
  const [popoverAnchorRect, setPopoverAnchorRect] = useState<DOMRect | null>(null);

  const handleOpenAssigneePopover = (task: Task, rect: DOMRect) => {
    setPopoverTask(task);
    setPopoverAnchorRect(rect);
  };

  useEffect(() => {
    fetchCalendarData();
    fetchProjectDetail();
  }, [projectId]);

  const handleSelectWorkerProfile = (w: Worker) => {
    setCurrentWorker(w);
    setCurrentWorkerApi(w);
    const targetLang = w.ui_language || (w.country_code === 'VN' ? 'vi' : 'ko');
    setLanguage(targetLang);
  };

  const requireWorkerSelection = (): boolean => {
    if (!currentWorker) {
      if (isMobileView) {
        setIsMobileWorkerSheetOpen(true);
      } else {
        setIsWorkerPromptOpen(true);
      }
      return false;
    }
    return true;
  };

  const isCompleted = project?.status === 'COMPLETED';
  const isViewer = isExecutiveViewer(currentWorker);

  const handleSaveBaseline = async () => {
    if (!project || isViewer) return;
    if (!confirm(lang === 'vi' ? 'Lưu lịch hiện tại làm lịch cơ sở (Baseline)?' : '현재 확정 일정을 기준 일정(Baseline)으로 저장하시겠습니까?')) return;
    try {
      await api.saveProjectBaseline(project.id);
      await fetchProjectDetail();
      alert(lang === 'vi' ? 'Đã lưu lịch cơ sở thành công.' : '기준 일정이 성공적으로 저장되었습니다.');
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleOpenAddTask = () => {
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    setSelectedTask(null);
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (data: Partial<Task>) => {
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    try {
      if (selectedTask) {
        await api.updateTask(selectedTask.id, data);
      } else {
        await api.createTask({ ...data, project_id: projectId });
      }
      await fetchProjectDetail();
      setConflictModalState({ isOpen: false, conflicts: [], pendingTaskData: null });
    } catch (err: any) {
      const errCode = err?.code || err?.error?.code;
      const errDetails = err?.details || err?.error?.details;
      if (
        err &&
        (errCode === 'CROSS_PROJECT_CONFLICT_CONFIRMATION_REQUIRED' ||
          errCode === 'WORKER_SCHEDULE_CONFLICT_CONFIRMATION_REQUIRED') &&
        errDetails?.conflicts
      ) {
        setConflictModalState({
          isOpen: true,
          conflicts: errDetails.conflicts,
          pendingTaskData: {
            ...data,
            confirm_cross_project_conflicts: errDetails.fingerprints || true,
          },
        });
        return;
      }
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleConfirmTaskConflictSave = async () => {
    if (!conflictModalState.pendingTaskData) return;
    try {
      const payload = {
        ...conflictModalState.pendingTaskData,
        confirm_worker_schedule_conflict: true,
        confirm_cross_project_conflicts:
          conflictModalState.pendingTaskData.confirm_cross_project_conflicts || true,
      };
      if (selectedTask) {
        await api.updateTask(selectedTask.id, payload);
      } else {
        await api.createTask({ ...payload, project_id: projectId });
      }
      await fetchProjectDetail();
      setConflictModalState({ isOpen: false, conflicts: [], pendingTaskData: null });
      setIsTaskModalOpen(false);
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleEditTask = (taskItem: Task) => {
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    setSelectedTask(taskItem);
    setIsTaskModalOpen(true);
  };

  const handleDeleteTask = async (taskItem: Task) => {
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    if (!confirm(t('deleteTaskConfirm'))) return;
    try {
      await api.deleteTask(taskItem.id);
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleCompleteProject = async () => {
    if (!project) return;
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (!requireWorkerSelection()) return;
    if (!confirm(t('completeConfirmText'))) return;
    try {
      await api.completeProject(project.id);
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleReopenProject = async () => {
    if (!project) return;
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (!requireWorkerSelection()) return;
    if (!confirm(t('reopenConfirmText'))) return;
    try {
      await api.reopenProject(project.id);
      await fetchProjectDetail();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleMobileSheetStatusSelect = async (status: DailyStatusType) => {
    const { taskId, dateStr } = isMobileView ? mobileStatusSheetState : popoverState;
    if (!taskId || !dateStr) return;
    if (isViewer) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (isCompleted) {
      alert(t('readOnlyCompletedNotice'));
      return;
    }
    if (!requireWorkerSelection()) return;
    try {
      await api.updateDailyStatus(taskId, dateStr, status);
      await fetchProjectDetail();
      setPopoverState((prev) => ({ ...prev, isOpen: false }));
      setMobileStatusSheetState((prev) => ({ ...prev, isOpen: false }));
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const getProjectDisplayName = (prj: Project): string => {
    const currentLang = currentWorker?.ui_language || lang;
    if (currentLang === 'vi') return prj.name_vi || prj.name_ko || prj.name;
    return prj.name_ko || prj.name_vi || prj.name;
  };

  const getTaskDisplayName = (taskItem: Task): string => {
    const currentLang = currentWorker?.ui_language || lang;
    if (currentLang === 'vi') return taskItem.task_name_vi || taskItem.task_name_ko || taskItem.task_name;
    return taskItem.task_name_ko || taskItem.task_name_vi || taskItem.task_name;
  };

  const handleMobileCellClick = (taskItem: Task, dateStr: string) => {
    const workerObj = workers.find((w) => w.name === taskItem.worker_name);
    const workStatus = resolveWorkDayStatus(dateStr, workerObj as any, countryHolidays, calendarOverrides);
    const currentStatus = taskItem.daily_statuses?.[dateStr] || 'NONE';

    if (isViewer || isCompleted) {
      setInfoSheetState({ isOpen: true, task: taskItem });
      return;
    }

    setMobileStatusSheetState({
      isOpen: true,
      taskId: taskItem.id,
      dateStr,
      taskName: getTaskDisplayName(taskItem),
      currentStatus,
      workStatus,
    });
  };

  return (
    <div data-testid="project-detail-page" className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">
      {/* App Header */}
      {isMobileView ? (
        <MobileAppHeader
          currentWorker={currentWorker}
          onOpenWorkerSheet={() => setIsMobileWorkerSheetOpen(true)}
        />
      ) : (
        <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="back-to-list-btn"
              onClick={() => navigate('/projects')}
              className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition shadow-2xs"
              title={t('backToList')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-base md:text-lg text-slate-900 tracking-tight leading-none">
                  {project ? getProjectDisplayName(project) : t('loading')}
                </h1>
                {isCompleted && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                    {t('statusCompleted')}
                  </span>
                )}
                {project && (
                  <ProjectReadinessPopover
                    readiness={calculateProjectReadiness(project, tasks, allocations, workers)}
                    projectName={getProjectDisplayName(project)}
                    onOpenWorkforceModal={() => setIsWorkforceModalOpen(true)}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isViewer ? (
              <div
                data-testid="viewer-readonly-badge"
                className="h-9 px-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-extrabold flex items-center gap-1.5 shrink-0 shadow-xs"
              >
                <Lock className="w-4 h-4 text-red-600" />
                <span>{lang === 'vi' ? 'Chỉ xem' : '보기 전용'}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="project-workforce-btn"
                  onClick={() => setIsWorkforceModalOpen(true)}
                  className="h-9 px-3 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-xs font-bold text-blue-700 flex items-center gap-1.5 transition shadow-xs"
                >
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>{lang === 'vi' ? 'Phân bổ nhân lực' : '투입 인력'}</span>
                </button>
                <button
                  type="button"
                  data-testid="desktop-manage-calendar-btn"
                  onClick={() => setIsCalendarModalOpen(true)}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition shadow-xs"
                >
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>{t('manageHolidays')}</span>
                </button>
                <button
                  type="button"
                  data-testid="save-baseline-btn"
                  onClick={handleSaveBaseline}
                  title={lang === 'vi' ? 'Lưu lịch cơ sở (Baseline)' : '현재 확정 일정을 기준 일정(Baseline)으로 저장'}
                  className="h-9 px-3 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-xs font-bold text-purple-700 flex items-center gap-1.5 transition shadow-xs"
                >
                  <BookmarkCheck className="w-4 h-4 text-purple-600" />
                  <span>{lang === 'vi' ? 'Lưu lịch cơ sở' : '기준 일정 저장'}</span>
                </button>
              </div>
            )}

            <WorkerSelector
              currentWorker={currentWorker}
              onWorkerChange={handleSelectWorkerProfile}
            />

            <WorkerUtilizationBadge
              worker={currentWorker}
              tasks={tasks}
              holidays={countryHolidays}
              overrides={calendarOverrides}
              compact={true}
            />

            {!isViewer && (!isCompleted ? (
              <>
                <button
                  type="button"
                  data-testid="add-task-group-btn"
                  onClick={handleOpenAddGroup}
                  className="h-9 px-3 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-1.5 transition shadow-xs"
                >
                  <FolderPlus className="w-4 h-4 text-blue-600" />
                  <span>{lang === 'vi' ? '+ Thêm nhóm' : '+ 공정 대분류 추가'}</span>
                </button>
                <button
                  type="button"
                  data-testid="add-task-btn"
                  onClick={handleOpenAddTask}
                  className={PRIMARY_BUTTON_H36_CLASS}
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('addTask')}</span>
                </button>
                <button
                  type="button"
                  data-testid="complete-project-btn"
                  onClick={handleCompleteProject}
                  className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{t('completeProject')}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                data-testid="reopen-project-btn"
                onClick={handleReopenProject}
                className="h-9 px-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{t('reopenProject')}</span>
              </button>
            ))}
          </div>
        </header>
      )}

      {/* Desktop Toolbar & Navigation Controls */}
      {isMobileView ? (
        <div className="bg-white border-b border-slate-200 p-3 flex flex-col gap-2 w-full shadow-2xs">
          <div className="flex items-center justify-between">
            <div role="tablist" aria-label="Mobile View Modes" className="flex items-center p-0.5 bg-slate-200/80 rounded-lg text-xs font-semibold flex-1 mr-2">
              <button
                type="button"
                role="tab"
                aria-selected={mobileViewMode === 'SUMMARY'}
                data-testid="mobile-view-summary-btn"
                onClick={() => handleMobileViewChange('SUMMARY')}
                className={`flex-1 h-8 rounded-md transition font-bold ${
                  mobileViewMode === 'SUMMARY'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t('summaryView')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileViewMode === 'WEEK'}
                data-testid="mobile-view-week-btn"
                onClick={() => handleMobileViewChange('WEEK')}
                className={`flex-1 h-8 rounded-md transition font-bold ${
                  mobileViewMode === 'WEEK'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t('week7View')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileViewMode === 'GANTT'}
                data-testid="mobile-view-gantt-btn"
                onClick={() => handleMobileViewChange('GANTT')}
                className={`flex-1 h-8 rounded-md transition font-bold ${
                  mobileViewMode === 'GANTT'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t('gantt30View')}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {!isViewer && !isCompleted && (
                <button
                  type="button"
                  data-testid="add-task-btn"
                  onClick={handleOpenAddTask}
                  className="h-8 px-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition shrink-0 flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ {t('addTask')}</span>
                </button>
              )}
              <CalendarLegend isMobileView={true} />
            </div>
          </div>
        </div>
      ) : (
        <section data-testid="desktop-schedule-toolbar" className="bg-white border-b border-slate-200 px-4 md:px-6 py-2.5 space-y-2 text-slate-900 shadow-2xs">
          {/* Toolbar Main Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: Back button & Project Title Badge */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => navigate('/projects')}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center gap-1 shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('backToList')}</span>
              </button>
              <span className="text-slate-300">|</span>
              <span className="font-extrabold text-xs text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                {project ? getProjectDisplayName(project) : t('loading')}
              </span>
            </div>

            {/* Center: Project Boundary Badge */}
            <div className="flex items-center gap-2 shrink-0">
              <div
                data-testid="project-boundary-badge"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50/70 border border-blue-200 rounded-lg text-xs font-bold text-blue-900 shrink-0"
              >
                <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>{lang === 'vi' ? 'Thời gian dự án' : '프로젝트 일정'}: {project?.start_date} ~ {project?.end_date}</span>
              </div>
            </div>

            {/* Right: Today Control & Shift History */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                data-testid="nav-today-btn"
                disabled={!(project?.start_date && project?.end_date && new Date().toISOString().slice(0, 10) >= project.start_date && new Date().toISOString().slice(0, 10) <= project.end_date)}
                onClick={() => {
                  const todayStr = new Date().toISOString().slice(0, 10);
                  const todayIdx = dateColumns.findIndex((c) => c.dateStr === todayStr);
                  if (todayIdx >= 0 && scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTo({ left: todayIdx * GANTT_DAY_WIDTH_PX, behavior: 'smooth' });
                  }
                }}
                className={`h-8 px-3 rounded-lg text-xs font-bold transition border ${
                  project?.start_date && project?.end_date && new Date().toISOString().slice(0, 10) >= project.start_date && new Date().toISOString().slice(0, 10) <= project.end_date
                    ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 cursor-pointer shadow-2xs'
                    : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                }`}
              >
                {t('today')}
              </button>

              <button
                type="button"
                data-testid="schedule-shift-history-btn"
                onClick={() => setIsShiftHistoryOpen(true)}
                className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1 transition shadow-2xs shrink-0"
                title={lang === 'vi' ? 'Lịch sử thay đổi' : '변경 이력'}
              >
                <History className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden lg:inline">{lang === 'vi' ? 'Lịch sử' : '변경 이력'}</span>
              </button>
            </div>
          </div>

          {/* Legend Row */}
          <div className="pt-1.5 border-t border-slate-100">
            <CalendarLegend isMobileView={false} />
          </div>
        </section>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-3 md:p-5 overflow-x-hidden flex flex-col">
        {isMobileView ? (
          /* Dedicated Mutually Exclusive Mobile & Fold Views */
          <div className="w-full flex-1 flex flex-col">
            {mobileViewMode === 'SUMMARY' && (
              <MobileSummaryView
                mode="DETAIL"
                project={project}
                tasks={tasks}
                workers={workers}
                onTaskClick={(tItem) => setInfoSheetState({ isOpen: true, task: tItem })}
                isReadOnly={isViewer || isCompleted}
              />
            )}
            {mobileViewMode === 'WEEK' && (
              <MobileWeekView
                mode="DETAIL"
                project={project}
                tasks={tasks}
                workers={workers}
                currentWorker={currentWorker}
                holidays={countryHolidays}
                overrides={calendarOverrides}
                onTaskClick={(tItem) => setInfoSheetState({ isOpen: true, task: tItem })}
                onTaskCellClick={(tItem, dateStr) => {
                  const workerObj = workers.find((w) => w.name === tItem.worker_name) || null;
                  const dayStatus = resolveWorkDayStatus(dateStr, (workerObj || { id: tItem.worker_name, name: tItem.worker_name }) as any, countryHolidays, calendarOverrides);
                  handleCellClick(tItem, dateStr, dayStatus, workerObj);
                }}
              />
            )}
            {mobileViewMode === 'GANTT' && (
              <MobileThirtyDayGanttView
                mode="DETAIL"
                project={project}
                tasks={tasks}
                workers={workers}
                dateColumns={dateColumns}
                holidays={countryHolidays}
                overrides={calendarOverrides}
                onTaskClick={(tItem) => setInfoSheetState({ isOpen: true, task: tItem })}
                onTaskCellClick={(tItem, dateStr) => {
                  const workerObj = workers.find((w) => w.name === tItem.worker_name) || null;
                  const dayStatus = resolveWorkDayStatus(dateStr, (workerObj || { id: tItem.worker_name, name: tItem.worker_name }) as any, countryHolidays, calendarOverrides);
                  handleCellClick(tItem, dateStr, dayStatus, workerObj);
                }}
              />
            )}
          </div>
        ) : (
          /* Desktop Canvas View */
          <div
            ref={scrollContainerRef}
            data-testid="desktop-gantt-scroll"
            style={{ position: 'relative', isolation: 'isolate' }}
            className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto overflow-y-auto custom-scrollbar relative max-w-full isolate"
          >
            <div
              data-testid="desktop-gantt-canvas"
              style={{
                width: `${DETAIL_LEFT_WIDTH + timelineWidth}px`,
                minWidth: `${DETAIL_LEFT_WIDTH + timelineWidth}px`,
              }}
              role="table"
              className="flex flex-col text-left"
            >
              {/* 1. Header Container Grid (72px Total Height) */}
              <div
                role="row"
                data-testid="detail-gantt-header-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `${DETAIL_LEFT_WIDTH}px ${timelineWidth}px`,
                  gridTemplateRows: `${GANTT_MONTH_HEADER_HEIGHT_PX}px ${GANTT_DATE_HEADER_HEIGHT_PX}px`,
                  width: `${DETAIL_LEFT_WIDTH + timelineWidth}px`,
                  minWidth: `${DETAIL_LEFT_WIDTH + timelineWidth}px`,
                  height: `${GANTT_HEADER_TOTAL_HEIGHT_PX}px`,
                  minHeight: `${GANTT_HEADER_TOTAL_HEIGHT_PX}px`,
                  maxHeight: `${GANTT_HEADER_TOTAL_HEIGHT_PX}px`,
                  position: 'sticky',
                  top: 0,
                  zIndex: GANTT_Z.STICKY_TOP_HEADER,
                }}
                className="sticky top-0 bg-slate-100 text-xs uppercase tracking-wider text-slate-700 border-b border-slate-200"
              >
                {/* Left Header Corner (Spans 2 Header Rows, 72px Height) */}
                <div
                  role="columnheader"
                  data-testid="detail-sticky-corner"
                  style={{
                    gridColumn: '1',
                    gridRow: '1 / span 2',
                    height: `${GANTT_HEADER_TOTAL_HEIGHT_PX}px`,
                    minHeight: `${GANTT_HEADER_TOTAL_HEIGHT_PX}px`,
                    maxHeight: `${GANTT_HEADER_TOTAL_HEIGHT_PX}px`,
                    display: 'grid',
                    gridTemplateColumns: DETAIL_LEFT_WIDTH >= 564 ? '260px 240px 64px' : DETAIL_LEFT_WIDTH >= 504 ? '230px 210px 64px' : '210px 170px 64px',
                    alignItems: 'center',
                    alignSelf: 'stretch',
                    position: 'sticky',
                    left: 0,
                    top: 0,
                    zIndex: GANTT_Z.STICKY_TOP_LEFT_CORNER,
                    backgroundColor: '#f1f5f9',
                    backgroundClip: 'padding-box',
                    isolation: 'isolate',
                    opacity: 1,
                  }}
                  className="sticky left-0 top-0 bg-slate-100 font-bold text-slate-800 border-r border-slate-200 shrink-0 relative flex items-center"
                >
                  <span className="pl-[6px] pr-[4px] truncate">{lang === 'vi' ? 'Công việc chi tiết' : '세부 작업명'}</span>
                  <span className="pl-[4px] pr-[4px] truncate">{lang === 'vi' ? 'Người phụ trách' : '작업자'}</span>
                  <span className="pl-[2px] pr-[4px] text-right truncate">{lang === 'vi' ? 'Thao tác' : '액션'}</span>
                  <div
                    data-testid="gantt-sticky-occlusion-rail"
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: '-1px',
                      bottom: 0,
                      height: `${GANTT_HEADER_TOTAL_HEIGHT_PX}px`,
                      width: '2px',
                      backgroundColor: '#f1f5f9',
                      pointerEvents: 'none',
                      zIndex: GANTT_Z.STICKY_OCCLUSION_RAIL,
                      boxShadow: '4px 0 8px rgba(15, 23, 42, 0.08)',
                    }}
                  />
                </div>

                {/* Month Header Row (Row 1, 28px) */}
                <div
                  data-testid="detail-month-header"
                  style={{
                    gridColumn: '2',
                    gridRow: '1',
                    height: `${GANTT_MONTH_HEADER_HEIGHT_PX}px`,
                    minHeight: `${GANTT_MONTH_HEADER_HEIGHT_PX}px`,
                    maxHeight: `${GANTT_MONTH_HEADER_HEIGHT_PX}px`,
                    display: 'grid',
                    gridTemplateColumns: dateGridTemplate,
                  }}
                  className="w-full bg-slate-100 border-b border-slate-200 text-center font-bold text-blue-700 text-xs items-center"
                >
                  {monthGroups.map((mg, idx) => (
                    <div
                      key={idx}
                      data-month-group={mg.monthStr}
                      style={{
                        gridColumn: `${mg.startIndex + 1} / span ${mg.span}`,
                        boxSizing: 'border-box',
                        ...(idx > 0 ? GANTT_MONTH_BOUNDARY_STYLE : {}),
                      }}
                      className="border-r border-slate-200 truncate px-1 flex items-center justify-center h-full"
                    >
                      {mg.monthStr}
                    </div>
                  ))}
                </div>

                {/* Date Header Row (Row 2, 44px) */}
                <div
                  data-testid="detail-date-header"
                  style={{
                    gridColumn: '2',
                    gridRow: '2',
                    height: `${GANTT_DATE_HEADER_HEIGHT_PX}px`,
                    minHeight: `${GANTT_DATE_HEADER_HEIGHT_PX}px`,
                    maxHeight: `${GANTT_DATE_HEADER_HEIGHT_PX}px`,
                    display: 'grid',
                    gridTemplateColumns: dateGridTemplate,
                  }}
                  className="w-full h-[44px]"
                >
                    {dateColumns.map((col, idx) => {
                      const offInfo = getCountryOffState(col.dateStr, calendarOverrides, countryHolidays);
                      const token = getCalendarVisualStyle(offInfo.state === 'BOTH_WORK' ? 'WORKDAY' : (offInfo.state as CalendarVisualState));
                      const pattern = buildCalendarHatchPattern(token, 0.60);
                      const headerHatchStyle: React.CSSProperties = pattern ? { backgroundImage: pattern } : {};
                      const isMonthStart = isMonthStartColumn(dateColumns, idx);

                      const todayStyle = col.isToday ? 'shadow-[inset_0_2px_0_rgba(59,130,246,0.9)] text-blue-700 font-extrabold' : '';

                      let ariaText = `${col.dateStr} (${col.dayName})`;
                      if (offInfo.krHolidayName && offInfo.vnHolidayName) ariaText += `, 한국과 베트남 모두 공휴일 (${offInfo.krHolidayName})`;
                      else if (offInfo.krHolidayName) ariaText += `, 한국 공휴일 (${offInfo.krHolidayName}), 베트남 정상 근무`;
                      else if (offInfo.vnHolidayName) ariaText += `, 베트남 공휴일 (${offInfo.vnHolidayName}), 한국 정상 근무`;

                      const hasHoliday = !!offInfo.krHolidayName || !!offInfo.vnHolidayName;

                      return (
                        <div
                          key={idx}
                          role="columnheader"
                          data-testid={`gantt-date-header-${col.dateStr}`}
                          data-date={col.dateStr}
                          data-month-boundary={isMonthStart ? 'true' : undefined}
                          data-country-off-state={offInfo.state}
                          data-calendar-surface="HEADER"
                          data-calendar-visual-state={token.visualState}
                          data-calendar-hatch-type={token.hatch.type}
                          data-calendar-hatch-angle={token.hatch.angle}
                          aria-label={ariaText}
                          onClick={() => setHeaderInfoState({ isOpen: true, dateStr: col.dateStr, dayName: col.dayName })}
                          style={{ boxSizing: 'border-box', ...(isMonthStart ? GANTT_MONTH_BOUNDARY_STYLE : {}) }}
                          className={`relative text-center p-0 border-r text-[11px] font-medium cursor-pointer transition select-none flex flex-col items-center justify-center h-full overflow-hidden ${token.headerClass} ${todayStyle}`}
                        >
                          {pattern && (
                            <div className="absolute inset-0 pointer-events-none opacity-100" style={headerHatchStyle} />
                          )}
                          {hasHoliday && (
                            <div
                              className={`absolute top-0 left-0 right-0 h-[2px] z-10 ${
                                offInfo.krHolidayName && offInfo.vnHolidayName
                                  ? 'bg-rose-600'
                                  : offInfo.krHolidayName
                                  ? 'bg-orange-500'
                                  : 'bg-sky-500'
                              }`}
                            />
                          )}
                          <div>{col.dayNum}</div>
                          <div className="text-[10px] opacity-85">{col.dayName}</div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Global Country Background Overlay Layer (z-0) */}
              {project && project.start_date && project.end_date && (
                <div
                  style={{
                    position: 'absolute',
                    top: `${GANTT_HEADER_TOTAL_HEIGHT_PX}px`,
                    left: `${DETAIL_LEFT_WIDTH}px`,
                    width: `${timelineWidth}px`,
                    bottom: 0,
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                >
                  <GlobalCountryCalendarOverlay
                    projectId={project.id}
                    startDate={project.start_date}
                    endDate={project.end_date}
                    dateColumns={dateColumns}
                    calendarOverrides={calendarOverrides}
                    countryHolidays={countryHolidays}
                    dayWidthPx={timelineWidth / (dateColumns.length || 1)}
                  />
                </div>
              )}

              {/* 2. Body Container */}
              <div className="divide-y divide-slate-200 text-sm flex flex-col relative z-10">
                {loading ? (
                  <div className="py-12 text-center text-slate-500 font-medium w-full">
                    {t('loading')}
                  </div>
                ) : (
                  (() => {
                    const groupsToRender = taskGroups.length > 0 ? taskGroups : [
                      { id: 'default', project_id: projectId!, group_name: '기존 작업', group_name_ko: '기존 작업', group_name_vi: 'Công việc hiện có', color_key: 'BLUE' as TaskGroupColorKey, sort_order: 1 }
                    ];

                    const groupIds = groupsToRender.map((g) => g.id);

                    return (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
                          {groupsToRender.map((group, gIdx) => {
                            const groupNum = gIdx + 1;
                            const groupTasks = tasks.filter((tItem) => tItem.task_group_id === group.id || (!tItem.task_group_id && gIdx === 0));
                            const isCollapsed = !!collapsedGroupIds[group.id];
                            const taskIds = groupTasks.map((tItem) => tItem.id);

                            return (
                              <React.Fragment key={group.id}>
                                {/* Task Group Header Row */}
                                <DroppableTaskGroupRow
                                  group={group}
                                  groupNum={groupNum}
                                  groupTasks={groupTasks}
                                  isCollapsed={isCollapsed}
                                  dateColumnsCount={dateColumns.length}
                                  isViewer={isViewer}
                                  isCompleted={isCompleted}
                                  lang={lang}
                                  leftPanelWidth={DETAIL_LEFT_WIDTH}
                                  timelineWidth={timelineWidth}
                                  dateColumns={dateColumns}
                                  dateGridTemplate={dateGridTemplate}
                                  onToggleCollapse={toggleGroupCollapse}
                                  onOpenEditGroup={handleOpenEditGroup}
                                  onOpenDeleteGroup={(grp: TaskGroup, count: number) => setDeleteGroupModalState({ isOpen: true, group: grp, taskCount: count })}
                                  onOpenAddTaskInGroup={handleOpenAddTaskInGroup}
                                  isOver={overGroupId === group.id}
                                />

                                {/* Detail Tasks in Group */}
                                {!isCollapsed && (
                                  <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                                    {groupTasks.length > 0 ? (
                                      groupTasks.map((tItem, tIdx) => (
                                        <SortableTaskRow
                                          key={tItem.id}
                                          tItem={tItem}
                                          tIdx={tIdx}
                                          groupNum={groupNum}
                                          dateColumns={dateColumns}
                                          workers={workers}
                                          countryHolidays={countryHolidays}
                                          calendarOverrides={calendarOverrides}
                                          isViewer={isViewer}
                                          isCompleted={isCompleted}
                                          lang={lang}
                                          leftPanelWidth={DETAIL_LEFT_WIDTH}
                                          timelineWidth={timelineWidth}
                                          dateGridTemplate={dateGridTemplate}
                                          t={t}
                                          onEditTask={handleEditTask}
                                          onDeleteTask={handleDeleteTask}
                                          onMoveTask={(tObj: Task) => setMoveModalState({ isOpen: true, task: tObj })}
                                          onCellClick={handleCellClick}
                                          onOpenAssigneePopover={handleOpenAssigneePopover}
                                        />
                                      ))
                                    ) : (
                                      <EmptyGroupDropZoneCard
                                        groupId={group.id}
                                        leftPanelWidth={DETAIL_LEFT_WIDTH}
                                        timelineWidth={timelineWidth}
                                        lang={lang}
                                        isOver={overGroupId === group.id}
                                        dateColumns={dateColumns}
                                        dateGridTemplate={dateGridTemplate}
                                      />
                                    )}
                                  </SortableContext>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </SortableContext>

                        <DragOverlay>
                          <TaskDragOverlay activeDragItem={activeDragItem} lang={lang} />
                        </DragOverlay>
                      </DndContext>
                    );
                  })()
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Info Sheet */}
      <MobileScheduleInfoSheet
        isOpen={infoSheetState.isOpen}
        onClose={() => setInfoSheetState({ isOpen: false, task: null })}
        title={infoSheetState.task ? getTaskDisplayName(infoSheetState.task) : ''}
        subtitle={infoSheetState.task?.worker_name}
        startDate={infoSheetState.task?.start_date || undefined}
        endDate={infoSheetState.task?.end_date || undefined}
        progress={infoSheetState.task?.progress}
        workerName={infoSheetState.task?.worker_name}
        isReadOnly={isViewer || isCompleted}
        onEdit={infoSheetState.task ? () => handleEditTask(infoSheetState.task!) : undefined}
      />

      {/* Modals & Sheets */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
        task={selectedTask}
        projectId={projectId || ''}
        project={project}
        currentWorker={currentWorker}
        taskGroups={taskGroups}
        holidays={countryHolidays}
        overrides={calendarOverrides}
        workers={workers}
      />

      <ProjectWorkforceModal
        isOpen={isWorkforceModalOpen}
        project={project}
        workers={workers}
        tasks={tasks}
        onClose={() => setIsWorkforceModalOpen(false)}
        onSaved={fetchProjectDetail}
      />

      <TaskGroupModal
        isOpen={isGroupModalOpen}
        group={selectedGroup}
        currentWorker={currentWorker}
        onClose={() => setIsGroupModalOpen(false)}
        onSave={handleSaveGroup}
      />

      <TaskGroupDeleteModal
        isOpen={deleteGroupModalState.isOpen}
        group={deleteGroupModalState.group}
        otherGroups={taskGroups.filter((g) => g.id !== deleteGroupModalState.group?.id)}
        taskCount={deleteGroupModalState.taskCount}
        onClose={() => setDeleteGroupModalState({ isOpen: false, group: null, taskCount: 0 })}
        onConfirm={handleConfirmDeleteGroup}
      />

      <WorkerPromptModal
        isOpen={isWorkerPromptOpen}
        onClose={() => setIsWorkerPromptOpen(false)}
        onSelectWorker={handleSelectWorkerProfile}
      />

      <MobileWorkerSheet
        isOpen={isMobileWorkerSheetOpen}
        onClose={() => setIsMobileWorkerSheetOpen(false)}
        currentWorker={currentWorker}
        onSelectWorker={handleSelectWorkerProfile}
      />

      <MobileStatusSheet
        isOpen={mobileStatusSheetState.isOpen}
        onClose={() => setMobileStatusSheetState((prev) => ({ ...prev, isOpen: false }))}
        taskName={mobileStatusSheetState.taskName}
        dateStr={mobileStatusSheetState.dateStr}
        currentStatus={mobileStatusSheetState.currentStatus}
        workStatus={mobileStatusSheetState.workStatus}
        onSelect={handleMobileSheetStatusSelect}
      />

      <CalendarManagerModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        workers={workers}
        currentWorker={currentWorker}
        onRefreshCalendar={fetchCalendarData}
      />

      {/* Day Action Panel (Desktop & Mobile) */}
      {dayActionState.isOpen && dayActionState.task && (
        <DayActionPanel
          isOpen={dayActionState.isOpen}
          onClose={() => setDayActionState((prev) => ({ ...prev, isOpen: false }))}
          task={dayActionState.task}
          dateStr={dayActionState.dateStr}
          worker={dayActionState.workerObj}
          currentWorker={currentWorker}
          dayStatus={dayActionState.dayStatus || resolveWorkDayStatus(dayActionState.dateStr, (dayActionState.workerObj || { id: dayActionState.task.worker_name, name: dayActionState.task.worker_name }) as any, countryHolidays, calendarOverrides)}
          holidays={countryHolidays}
          overrides={calendarOverrides}
          onUpdateStatus={handleUpdateDailyStatus}
          onCreateOverride={handleCreateOverrideFromCell}
          onClearOverride={handleClearOverrideFromCell}
          isMobileView={isMobileView}
        />
      )}

      {/* Date Header Info Panel */}
      <DateHeaderInfoPanel
        isOpen={headerInfoState.isOpen}
        onClose={() => setHeaderInfoState((prev) => ({ ...prev, isOpen: false }))}
        dateStr={headerInfoState.dateStr}
        dayName={headerInfoState.dayName}
        holidays={countryHolidays}
        currentWorker={currentWorker}
        onRefreshHolidays={fetchCalendarData}
      />

      {/* Schedule Shift History Modal */}
      <ScheduleShiftHistoryModal
        isOpen={isShiftHistoryOpen}
        onClose={() => setIsShiftHistoryOpen(false)}
        projectId={projectId || ''}
      />

      {/* Task Move Modal */}
      <TaskMoveModal
        isOpen={moveModalState.isOpen}
        task={moveModalState.task}
        taskGroups={taskGroups}
        onClose={() => setMoveModalState({ isOpen: false, task: null })}
        onMove={handleMoveTaskToGroup}
      />

      {/* Structure Undo Toast */}
      {toastState.isOpen && (
        <div
          data-testid="structure-undo-toast"
          className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200 text-xs font-bold"
        >
          <span>{toastState.message}</span>
          {toastState.undoData && (
            <button
              type="button"
              data-testid="structure-undo-btn"
              onClick={handleUndoStructure}
              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-extrabold transition shadow-xs flex items-center gap-1"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>{lang === 'vi' ? 'Hoàn tác' : '실행 취소'}</span>
            </button>
          )}
        </div>
      )}

      {/* Task Assignee Popover */}
      {popoverTask && (
        <TaskAssigneePopover
          taskId={popoverTask.id}
          taskTitle={popoverTask.task_name}
          assignees={popoverTask.assignees || []}
          workers={workers}
          calendarOverrides={calendarOverrides}
          countryHolidays={countryHolidays}
          anchorRect={popoverAnchorRect}
          isOpen={!!popoverTask}
          onClose={() => setPopoverTask(null)}
        />
      )}

      {/* Build Version Indicator */}
      <BuildVersionIndicator />
    </div>
  );
};

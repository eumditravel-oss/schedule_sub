// src/components/gantt/TaskAssigneePopover.tsx
import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { TaskAssignee, Worker, CalendarOverride, CountryHoliday } from '../../types';
import { resolveWorkDayStatus } from '../../utils/workCalendar';

export interface TaskAssigneePopoverProps {
  taskId: string;
  taskTitle: string;
  assignees: TaskAssignee[];
  workers: Worker[];
  dateStr?: string;
  calendarOverrides?: CalendarOverride[];
  countryHolidays?: CountryHoliday[];
  anchorRect: DOMRect | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TaskAssigneePopover: React.FC<TaskAssigneePopoverProps> = ({
  taskId,
  taskTitle,
  assignees,
  workers,
  dateStr = new Date().toISOString().split('T')[0],
  calendarOverrides = [],
  countryHolidays = [],
  anchorRect,
  isOpen,
  onClose,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !anchorRect) return null;

  // Calculate Fixed Position (avoiding screen overflow)
  const popoverWidth = 300;
  const popoverHeight = 220 + assignees.length * 48;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = anchorRect.left;
  let top = anchorRect.bottom + 6;

  if (left + popoverWidth > viewportWidth - 12) {
    left = Math.max(12, viewportWidth - popoverWidth - 12);
  }
  if (top + popoverHeight > viewportHeight - 12) {
    top = Math.max(12, anchorRect.top - popoverHeight - 6);
  }

  // Sort assignees: Primary first, then by allocation descending
  const sortedAssignees = [...assignees].sort((a, b) => {
    if (a.assignment_role === 'PRIMARY') return -1;
    if (b.assignment_role === 'PRIMARY') return 1;
    return (b.allocation_percent || 0) - (a.allocation_percent || 0);
  });

  const content = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={`${taskTitle} 작업 담당자 목록`}
      data-testid={`task-assignee-popover-${taskId}`}
      style={{ left: `${left}px`, top: `${top}px`, width: `${popoverWidth}px` }}
      className="fixed z-100 bg-white border border-slate-200 rounded-xl shadow-xl p-3.5 text-xs text-slate-800 animate-in fade-in zoom-in-95 duration-150 select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-100">
        <div>
          <h4 className="font-bold text-sm text-slate-900 line-clamp-1">{taskTitle}</h4>
          <p className="text-[11px] text-slate-500 font-medium">
            작업 담당자 {assignees.length}명 (오늘 기준: {dateStr})
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition"
          title="닫기"
        >
          ✕
        </button>
      </div>

      {/* Assignees List */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {sortedAssignees.map((a, idx) => {
          const wObj = workers.find((w) => w.id === a.worker_id) || {
            name: a.name,
            country_code: a.country_code || 'KR',
          };
          const status = resolveWorkDayStatus(dateStr, wObj as any, countryHolidays, calendarOverrides);

          let statusBadge = (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              오늘 근무
            </span>
          );

          if (status?.day_type === 'MANUAL_OFF') {
            statusBadge = (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                휴가 / 개인휴무
              </span>
            );
          } else if (status?.day_type === 'PUBLIC_HOLIDAY') {
            statusBadge = (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                공휴일
              </span>
            );
          } else if (status?.day_type === 'WEEKLY_OFF') {
            statusBadge = (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                주말 휴무
              </span>
            );
          }

          const flag = (a.country_code || wObj.country_code) === 'VN' ? '🇻🇳 베트남' : '🇰🇷 한국';

          return (
            <div
              key={a.worker_id || idx}
              className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between hover:bg-slate-100/80 transition"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-900">{wObj.name || a.name}</span>
                  {a.assignment_role === 'PRIMARY' && (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700">
                      주 담당
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{flag}</span>
                  <span>·</span>
                  <span>비중 {a.allocation_percent ?? Math.round(100 / assignees.length)}%</span>
                </div>
              </div>
              <div className="shrink-0">{statusBadge}</div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
};

import { getActualProgress } from '../../utils/progressDisplay';
import React, { useState } from 'react';
import { Task, DailyStatusType, WorkDayStatus } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { MobileWeekStrip, MobileWeekDay } from './MobileWeekStrip';
import { MoreVertical, Edit2, Trash2 } from 'lucide-react';

interface MobileTaskCardProps {
  task: Task;
  weekDays: MobileWeekDay[];
  onCellClick: (taskId: string, dateStr: string, currentStatus: DailyStatusType, workStatus?: WorkDayStatus) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  isReadOnly?: boolean;
}

export const MobileTaskCard: React.FC<MobileTaskCardProps> = ({
  task,
  weekDays,
  onCellClick,
  onEdit,
  onDelete,
  isReadOnly = false,
}) => {
  const { t, lang } = useI18n();
  const [showMenu, setShowMenu] = useState(false);

  const displayName = lang === 'vi' ? (task.task_name_vi || task.task_name) : (task.task_name_ko || task.task_name);
  const actual = getActualProgress(task);

  return (
    <div
      data-testid={`task-card-${task.id}`}
      data-progress-source="actual_progress"
      data-actual-progress={actual}
      className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs text-slate-900 overflow-hidden space-y-2"
    >
      {/* Task Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              {task.worker_name}
            </span>
            <span className="text-xs font-bold text-blue-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
              {actual}%
            </span>
          </div>

          <h4 className="font-bold text-slate-900 text-xs tracking-tight leading-snug truncate" title={displayName}>
            {displayName}
          </h4>

          <p className="text-[10px] text-slate-400 mt-0.5">
            {task.start_date} ~ {task.end_date}
          </p>
        </div>

        {/* Action Menu button */}
        {!isReadOnly && (onEdit || onDelete) && (
          <div className="relative shrink-0">
            <button
              type="button"
              data-testid={`mobile-task-menu-btn-${task.id}`}
              onClick={() => setShowMenu(!showMenu)}
              aria-label={t('actions')}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-7 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-1 w-28 text-xs font-bold animate-in fade-in zoom-in-95 duration-100">
                {onEdit && (
                  <button
                    type="button"
                    data-testid={`mobile-task-edit-btn-${task.id}`}
                    onClick={() => {
                      setShowMenu(false);
                      onEdit(task);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>{t('save')}</span>
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    data-testid={`mobile-task-delete-btn-${task.id}`}
                    onClick={() => {
                      setShowMenu(false);
                      onDelete(task);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('cancel')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 7-Day Mobile Week Strip */}
      <MobileWeekStrip
        days={weekDays}
        dailyStatuses={task.daily_statuses || {}}
        onCellClick={(dateStr, currentStatus, workStatus) => onCellClick(task.id, dateStr, currentStatus, workStatus)}
        isReadOnly={isReadOnly}
      />
    </div>
  );
};

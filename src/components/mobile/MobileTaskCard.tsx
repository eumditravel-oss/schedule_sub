// src/components/mobile/MobileTaskCard.tsx
import React, { useState } from 'react';
import { Task, DailyStatusType } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { MobileWeekStrip, MobileWeekDay } from './MobileWeekStrip';
import { MoreVertical, Edit2, Trash2 } from 'lucide-react';

interface MobileTaskCardProps {
  task: Task;
  weekDays: MobileWeekDay[];
  onCellClick: (taskId: string, dateStr: string, currentStatus: DailyStatusType, taskName: string) => void;
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

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs text-slate-900 overflow-hidden space-y-2">
      {/* Task Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              {task.worker_name}
            </span>
            <span className="text-xs font-bold text-blue-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
              {task.progress}%
            </span>
          </div>
          <h4 className="font-bold text-slate-900 text-xs leading-snug line-clamp-2" title={displayName}>
            {displayName}
          </h4>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {task.start_date} ~ {task.end_date}
          </p>
        </div>

        {!isReadOnly && (onEdit || onDelete) && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-8 z-30 w-32 bg-white border border-slate-200 rounded-xl shadow-xl p-1 text-xs">
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onEdit(task);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg font-semibold"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>{t('editTask')}</span>
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onDelete(task);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('deleteTask')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interactive 7-Day Strip */}
      <MobileWeekStrip
        days={weekDays}
        dailyStatuses={task.daily_statuses || {}}
        onCellClick={(dateStr, status) => onCellClick(task.id, dateStr, status, displayName)}
        isReadOnly={isReadOnly}
      />
    </div>
  );
};

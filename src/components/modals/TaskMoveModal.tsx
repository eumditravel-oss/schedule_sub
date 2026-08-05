// src/components/modals/TaskMoveModal.tsx
import React, { useState, useEffect } from 'react';
import { Task, TaskGroup } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { X, ArrowRightLeft, Folder } from 'lucide-react';

interface TaskMoveModalProps {
  isOpen: boolean;
  task: Task | null;
  taskGroups: TaskGroup[];
  onClose: () => void;
  onMove: (taskId: string, targetGroupId: string) => Promise<void>;
}

export const TaskMoveModal: React.FC<TaskMoveModalProps> = ({
  isOpen,
  task,
  taskGroups,
  onClose,
  onMove,
}) => {
  const { lang } = useI18n();
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentGroup = taskGroups.find((g) => g.id === task?.task_group_id) || taskGroups[0];
  const availableGroups = taskGroups;

  useEffect(() => {
    if (task && task.task_group_id) {
      setSelectedGroupId(task.task_group_id);
    } else if (taskGroups.length > 0) {
      setSelectedGroupId(taskGroups[0].id);
    }
  }, [task, taskGroups]);

  if (!isOpen || !task) return null;

  const currentGroupName = lang === 'vi' ? (currentGroup?.group_name_vi || currentGroup?.group_name) : (currentGroup?.group_name_ko || currentGroup?.group_name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || selectedGroupId === task.task_group_id) {
      onClose();
      return;
    }
    try {
      setIsSubmitting(true);
      await onMove(task.id, selectedGroupId);
      onClose();
    } catch (err) {
      console.error('Failed to move task:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="task-move-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
            <ArrowRightLeft className="w-5 h-5 text-blue-600" />
            <span>{lang === 'vi' ? 'Chuyển sang nhóm khác' : '다른 공정으로 이동'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              {lang === 'vi' ? 'Tên công việc' : '작업명'}
            </label>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 truncate">
              {task.task_name_ko || task.task_name}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                {lang === 'vi' ? 'Nhóm hiện tại' : '현재 공정 대분류'}
              </label>
              <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 truncate">
                {currentGroupName || '기존 작업'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                {lang === 'vi' ? 'Nhóm đích' : '이동할 공정 대분류'}
              </label>
              <select
                data-testid="task-move-group-select"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full h-10 px-3 border border-blue-300 rounded-lg bg-blue-50/50 text-xs font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {availableGroups.map((g, idx) => (
                  <option key={g.id} value={g.id}>
                    {idx + 1}. {lang === 'vi' ? (g.group_name_vi || g.group_name) : (g.group_name_ko || g.group_name)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              data-testid="task-move-cancel-btn"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold transition"
            >
              {lang === 'vi' ? 'Hủy' : '취소'}
            </button>
            <button
              type="submit"
              data-testid="task-move-confirm-btn"
              disabled={isSubmitting || selectedGroupId === task.task_group_id}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm flex items-center gap-1.5"
            >
              <Folder className="w-4 h-4" />
              <span>{isSubmitting ? (lang === 'vi' ? 'Đang chuyển...' : '이동 중...') : (lang === 'vi' ? 'Chuyển nhóm' : '공정 이동')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

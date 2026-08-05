// src/components/modals/TaskGroupDeleteModal.tsx
import React, { useState } from 'react';
import { TaskGroup } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { X, AlertTriangle, ArrowRightLeft, Trash2 } from 'lucide-react';

interface TaskGroupDeleteModalProps {
  isOpen: boolean;
  group: TaskGroup | null;
  otherGroups: TaskGroup[];
  taskCount: number;
  onClose: () => void;
  onConfirm: (options: { move_to_group_id?: string; delete_tasks?: boolean }) => Promise<any>;
}

export const TaskGroupDeleteModal: React.FC<TaskGroupDeleteModalProps> = ({
  isOpen,
  group,
  otherGroups,
  taskCount,
  onClose,
  onConfirm,
}) => {
  const { lang } = useI18n();
  const [deleteOption, setDeleteOption] = useState<'MOVE' | 'DELETE_ALL'>('MOVE');
  const [targetGroupId, setTargetGroupId] = useState<string>(() => otherGroups[0]?.id || '');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !group) return null;

  const handleConfirm = async () => {
    try {
      setSubmitting(true);
      if (deleteOption === 'MOVE') {
        if (!targetGroupId) {
          alert(lang === 'vi' ? 'Vui lòng chọn nhóm công việc để chuyển' : '이동할 공정 대분류를 선택하세요.');
          return;
        }
        await onConfirm({ move_to_group_id: targetGroupId });
      } else {
        await onConfirm({ delete_tasks: true });
      }
      onClose();
    } catch (err: any) {
      alert(err.message || 'Error deleting group');
    } finally {
      setSubmitting(false);
    }
  };

  const groupName = lang === 'vi' ? (group.group_name_vi || group.group_name) : (group.group_name_ko || group.group_name);

  return (
    <div
      data-testid="task-group-delete-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-rose-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-rose-100 bg-rose-50/80">
          <div className="flex items-center gap-2 text-rose-900 font-extrabold text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{lang === 'vi' ? 'Xóa nhóm công việc' : '공정 대분류 삭제 안내'}</span>
          </div>
          <button
            type="button"
            data-testid="task-group-delete-modal-close-btn"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="bg-rose-50/50 p-3 rounded-xl border border-rose-100 font-semibold text-slate-800 leading-relaxed">
            {lang === 'vi'
              ? `Nhóm công việc [${groupName}] có ${taskCount} công việc chi tiết.`
              : `이 공정[${groupName}]에는 ${taskCount}개의 세부 작업이 있습니다.`}
          </div>

          <div className="space-y-3">
            {/* Option 1: Move to another group */}
            {otherGroups.length > 0 && (
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  deleteOption === 'MOVE' ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="delete_option"
                  value="MOVE"
                  checked={deleteOption === 'MOVE'}
                  onChange={() => setDeleteOption('MOVE')}
                  className="mt-0.5"
                />
                <div className="flex-1 space-y-2">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                    <span>{lang === 'vi' ? 'Chuyển sang nhóm công việc khác' : '다른 공정으로 이동'}</span>
                  </div>
                  {deleteOption === 'MOVE' && (
                    <select
                      data-testid="move-to-group-select"
                      value={targetGroupId}
                      onChange={(e) => setTargetGroupId(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 font-semibold text-slate-900 bg-white"
                    >
                      {otherGroups.map((og) => (
                        <option key={og.id} value={og.id}>
                          {lang === 'vi' ? (og.group_name_vi || og.group_name) : (og.group_name_ko || og.group_name)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
            )}

            {/* Option 2: Delete group and all tasks */}
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                deleteOption === 'DELETE_ALL' ? 'border-rose-500 bg-rose-50/40 ring-1 ring-rose-500' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="delete_option"
                value="DELETE_ALL"
                checked={deleteOption === 'DELETE_ALL'}
                onChange={() => setDeleteOption('DELETE_ALL')}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="font-bold text-rose-900 flex items-center gap-1.5">
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>{lang === 'vi' ? 'Xóa cả nhóm và tất cả công việc' : '공정과 세부 작업 모두 삭제'}</span>
                </div>
                <p className="text-[11px] text-rose-600/80 mt-1">
                  {lang === 'vi' ? 'Tất cả công việc trong nhóm sẽ bị xóa hoàn toàn.' : '해당 공정에 포함된 모든 세부 작업 및 상태 기록이 삭제됩니다.'}
                </p>
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              data-testid="task-group-delete-cancel-btn"
              onClick={onClose}
              className="px-4 h-9 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition"
            >
              {lang === 'vi' ? 'Hủy' : '취소'}
            </button>
            <button
              type="button"
              data-testid="task-group-delete-confirm-btn"
              onClick={handleConfirm}
              disabled={submitting}
              className="px-4 h-9 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition shadow-xs"
            >
              {submitting ? (lang === 'vi' ? 'Đang xóa...' : '삭제 중...') : (lang === 'vi' ? 'Xác nhận xóa' : '삭제 실행')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

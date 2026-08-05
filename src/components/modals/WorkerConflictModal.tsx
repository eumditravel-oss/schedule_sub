// src/components/modals/WorkerConflictModal.tsx
import React from 'react';
import { ScheduleConflictDetail } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { AlertTriangle, X, Calendar, User, ShieldAlert } from 'lucide-react';

interface WorkerConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSave: () => void;
  conflicts: ScheduleConflictDetail[];
  saving?: boolean;
}

export const WorkerConflictModal: React.FC<WorkerConflictModalProps> = ({
  isOpen,
  onClose,
  onConfirmSave,
  conflicts = [],
  saving = false,
}) => {
  const { t, lang } = useI18n();

  if (!isOpen || !conflicts || conflicts.length === 0) return null;

  const firstConflict = conflicts[0];

  return (
    <div
      data-testid="worker-conflict-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-rose-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-rose-100 bg-rose-50/80">
          <div className="flex items-center gap-2 text-rose-900 font-extrabold text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>
              {lang === 'vi'
                ? 'Lịch của nhân viên bị trùng với công việc khác.'
                : '같은 작업자의 일정이 다른 프로젝트와 겹칩니다.'}
            </span>
          </div>
          <button
            type="button"
            data-testid="conflict-close-btn"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* Worker Info */}
          <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <User className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="font-bold text-slate-800">
              {lang === 'vi' ? 'Nhân viên:' : '작업자:'} <strong className="text-blue-700">{firstConflict.worker_name}</strong>
            </span>
          </div>

          {/* Conflict List */}
          <div className="space-y-2">
            <span className="font-bold text-slate-800 block">
              {lang === 'vi' ? 'Chi tiết công việc bị trùng:' : '중복 일정 상세 목록:'}
            </span>

            <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar p-1">
              {conflicts.map((c, idx) => (
                <div
                  key={idx}
                  className="bg-rose-50/50 border border-rose-200 p-3 rounded-xl space-y-1.5"
                >
                  <div className="flex items-center justify-between font-bold text-rose-900 text-xs">
                    <span className="truncate max-w-[200px] text-slate-900">
                      {c.conflict_project_name}
                    </span>
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                      {c.overlapping_working_days}{lang === 'vi' ? ' ngày trùng' : '일 중복'}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-700 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span className="font-medium truncate">{c.conflict_task_name}</span>
                  </div>

                  <div className="text-[10px] text-slate-500 flex items-center gap-1 font-semibold">
                    <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{c.overlap_start_date} ~ {c.overlap_end_date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Warning Note */}
          <p className="text-[11px] text-slate-500 bg-amber-50 p-2.5 rounded-lg border border-amber-200 leading-relaxed font-medium">
            {lang === 'vi'
              ? 'Bạn có chắc chắn muốn tiếp tục lưu công việc với lịch trình bị trùng này không?'
              : '중복 일정을 허용하고 저장을 진행하시겠습니까? 저장을 완료하면 간트 화면에 충돌 경고 표시가 나타납니다.'}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              data-testid="conflict-cancel-btn"
              onClick={onClose}
              className="flex-1 h-9 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              data-testid="conflict-save-btn"
              onClick={onConfirmSave}
              disabled={saving}
              className="flex-1 h-9 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition shadow-xs flex items-center justify-center gap-1.5"
            >
              <span>{lang === 'vi' ? 'Lưu với lịch trùng' : '중복 일정으로 저장'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

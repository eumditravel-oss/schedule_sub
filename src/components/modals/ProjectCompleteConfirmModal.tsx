// src/components/modals/ProjectCompleteConfirmModal.tsx
import React from 'react';
import { Project, Task } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface ProjectCompleteConfirmModalProps {
  isOpen: boolean;
  project: Project;
  incompleteTasks: Task[];
  onClose: () => void;
  onConfirmBatchComplete: () => Promise<void>;
}

export const ProjectCompleteConfirmModal: React.FC<ProjectCompleteConfirmModalProps> = ({
  isOpen,
  project,
  incompleteTasks,
  onClose,
  onConfirmBatchComplete,
}) => {
  const { lang } = useI18n();
  const [submitting, setSubmitting] = React.useState(false);

  if (!isOpen) return null;

  const handleBatchComplete = async () => {
    try {
      setSubmitting(true);
      await onConfirmBatchComplete();
      onClose();
    } catch (e: any) {
      alert(e.message || (lang === 'vi' ? 'Lỗi xử lý hoàn thành.' : '완료 처리 중 오류가 발생했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs">
      <div
        data-testid="project-complete-confirm-modal"
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs"
      >
        <header className="px-5 py-4 bg-amber-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-sm">
              {lang === 'vi' ? 'Xác nhận hoàn thành dự án' : '프로젝트 완료 확정 안내'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-amber-300 hover:text-white rounded">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 space-y-3">
          <p className="font-bold text-slate-800 text-sm">
            {lang === 'vi'
              ? `Dự án '${project.name}' có ${incompleteTasks.length} công việc chưa hoàn thành.`
              : `프로젝트 '${project.name}'에 미완료 세부 작업 ${incompleteTasks.length}건이 있습니다.`}
          </p>
          <p className="text-slate-600 leading-relaxed">
            {lang === 'vi'
              ? 'Bạn có muốn đánh dấu tất cả công việc chưa hoàn thành là 100% và hoàn thành dự án không?'
              : '모든 미완료 세부 작업을 100% 완료 처리 후 프로젝트를 완료 상태로 전환하시겠습니까?'}
          </p>

          <div className="max-h-36 overflow-y-auto bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1">
            {incompleteTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-slate-700 font-medium">
                <span className="truncate">{t.task_name}</span>
                <span className="text-amber-700 font-bold shrink-0 ml-2">{t.actual_progress ?? t.progress ?? 0}%</span>
              </div>
            ))}
          </div>
        </div>

        <footer className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition"
          >
            {lang === 'vi' ? 'Quay lại' : '돌아가기'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleBatchComplete}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{submitting ? '...' : lang === 'vi' ? 'Hoàn thành tất cả & Lưu' : '모두 완료 처리 후 프로젝트 완료'}</span>
          </button>
        </footer>
      </div>
    </div>
  );
};

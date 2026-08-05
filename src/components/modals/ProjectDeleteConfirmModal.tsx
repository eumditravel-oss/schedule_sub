// src/components/modals/ProjectDeleteConfirmModal.tsx
import React, { useState, useEffect } from 'react';
import { Project } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { api } from '../../services/api';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface ProjectDeleteConfirmModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onConfirm: (project: Project) => Promise<void>;
}

export const ProjectDeleteConfirmModal: React.FC<ProjectDeleteConfirmModalProps> = ({
  isOpen,
  project,
  onClose,
  onConfirm,
}) => {
  const { lang } = useI18n();
  const [taskCount, setTaskCount] = useState<number>(0);
  const [dailyStatusCount, setDailyStatusCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (isOpen && project) {
      setErrorMessage('');
      api.getProjectDetail(project.id).then((detail) => {
        const tasks = detail.tasks || [];
        setTaskCount(tasks.length);
        let totalStatus = 0;
        tasks.forEach((tItem) => {
          if (tItem.daily_statuses) {
            totalStatus += Object.keys(tItem.daily_statuses).length;
          }
        });
        setDailyStatusCount(totalStatus);
      }).catch(() => {
        setTaskCount(0);
        setDailyStatusCount(0);
      });
    }
  }, [isOpen, project]);

  if (!isOpen || !project) return null;

  const projectName = lang === 'vi' ? (project.name_vi || project.name) : (project.name_ko || project.name);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      await onConfirm(project);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || (lang === 'vi' ? 'Lỗi khi xóa dự án.' : '프로젝트 삭제 중 오류가 발생했습니다.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div
        data-testid="project-delete-confirm-modal"
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-rose-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-rose-100 bg-rose-50/80">
          <div className="flex items-center gap-2 text-rose-900 font-extrabold text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{lang === 'vi' ? 'Xác nhận xóa dự án' : '프로젝트 삭제 확인'}</span>
          </div>
          <button
            type="button"
            data-testid="project-delete-modal-close-btn"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <p className="font-bold text-slate-800 text-sm">
            {lang === 'vi' ? 'Bạn có muốn xóa dự án này không?' : '프로젝트를 삭제하시겠습니까?'}
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-xs text-slate-700 font-medium">
            <div>
              <span className="text-slate-500">{lang === 'vi' ? 'Dự án:' : '프로젝트:'}</span>{' '}
              <strong className="text-slate-900 font-bold">{projectName}</strong>
            </div>
            <div>
              <span className="text-slate-500">{lang === 'vi' ? 'Công việc liên quan:' : '연결된 작업:'}</span>{' '}
              <strong className="text-blue-700 font-bold">{taskCount}</strong>
              {lang === 'vi' ? '' : '개'}
            </div>
            <div>
              <span className="text-slate-500">{lang === 'vi' ? 'Trạng thái hằng ngày:' : '일별 상태:'}</span>{' '}
              <strong className="text-emerald-700 font-bold">{dailyStatusCount}</strong>
              {lang === 'vi' ? '' : '건'}
            </div>
          </div>

          <p className="text-[11px] font-semibold text-rose-700 leading-relaxed bg-rose-50 p-2.5 rounded-lg border border-rose-100">
            {lang === 'vi'
              ? 'Dữ liệu đã xóa không thể khôi phục.'
              : '프로젝트와 연결된 작업 및 상태 기록이 함께 삭제됩니다. 삭제한 데이터는 복구할 수 없습니다.'}
          </p>

          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-100 border border-rose-300 text-rose-900 font-bold text-xs">
              {errorMessage}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              data-testid="project-delete-cancel-btn"
              onClick={onClose}
              className="flex-1 h-9 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition"
            >
              {lang === 'vi' ? 'Hủy' : '취소'}
            </button>
            <button
              type="button"
              data-testid="project-delete-confirm-btn"
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 h-9 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>{loading ? (lang === 'vi' ? 'Đang xóa...' : '삭제 중...') : (lang === 'vi' ? 'Xóa dự án' : '프로젝트 삭제')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Project, Task } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { getKoreaDateString } from '../../utils/dateUtils';
import { AlertTriangle, CheckCircle2, X, Eye, AlertCircle, RefreshCw, Calendar } from 'lucide-react';

interface ProjectCompleteConfirmModalProps {
  isOpen: boolean;
  project: Project;
  incompleteTasks: Task[];
  onClose: () => void;
  onViewIncompleteTasks?: () => void;
  onConfirmBatchComplete: (completedDate: string) => Promise<void>;
}

export const ProjectCompleteConfirmModal: React.FC<ProjectCompleteConfirmModalProps> = ({
  isOpen,
  project,
  incompleteTasks,
  onClose,
  onViewIncompleteTasks,
  onConfirmBatchComplete,
}) => {
  const { lang } = useI18n();
  const todayStr = getKoreaDateString();
  const [completedDate, setCompletedDate] = useState<string>(todayStr);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleBatchComplete = async () => {
    if (!completedDate) {
      setErrorMsg(lang === 'vi' ? 'Vui lòng chọn ngày hoàn thành.' : '완료일을 선택해주세요.');
      return;
    }
    if (project.start_date && completedDate < project.start_date) {
      setErrorMsg(
        lang === 'vi'
          ? `Ngày hoàn thành (${completedDate}) không thể trước ngày bắt đầu (${project.start_date}).`
          : `완료일(${completedDate})은 프로젝트 시작일(${project.start_date})보다 이전일 수 없습니다.`
      );
      return;
    }
    if (completedDate > todayStr) {
      setErrorMsg(
        lang === 'vi'
          ? `Ngày hoàn thành (${completedDate}) không thể ở tương lai.`
          : `완료일(${completedDate})은 미래 날짜일 수 없습니다.`
      );
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);
      await onConfirmBatchComplete(completedDate);
      onClose();
    } catch (e: any) {
      setErrorMsg(
        e.message || (lang === 'vi' ? 'Lỗi 처리 완료.' : '프로젝트 완료 처리에 실패했습니다.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const count = incompleteTasks.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs select-none">
      <div
        data-testid="project-complete-confirm-modal"
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs flex flex-col"
      >
        {/* Header */}
        <header className="px-5 py-4 bg-emerald-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm">
              {lang === 'vi' ? 'Xác nhận hoàn thành dự án' : '프로젝트 완료 확정 안내'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-emerald-300 hover:text-white rounded transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Body */}
        <div className="p-5 space-y-3.5 flex-1 overflow-y-auto">
          <div className="space-y-1">
            <p className="font-bold text-slate-900 text-sm">
              {count > 0
                ? lang === 'vi'
                  ? `Dự án '${project.name}' có ${count} công việc chưa hoàn thành.`
                  : `프로젝트 '${project.name}'에 미완료 세부 작업 ${count}건이 있습니다.`
                : lang === 'vi'
                ? `Tất cả công việc chi tiết của dự án '${project.name}' đã hoàn thành 100%.`
                : `프로젝트 '${project.name}'의 모든 세부 작업이 100% 완료되었습니다.`}
            </p>
            <p className="text-slate-600 text-xs leading-relaxed">
              {count > 0
                ? lang === 'vi'
                  ? 'Vui lòng chọn ngày hoàn thành để hoàn tất chuyển trạng thái dự án.'
                  : '모든 미완료 세부 작업을 100% 완료 처리한 후 지정한 완료일로 프로젝트를 완료 상태로 전환합니다.'
                : lang === 'vi'
                ? 'Vui lòng chọn ngày hoàn thành chính thức để lưu vĩnh viễn.'
                : '아래에서 정식 프로젝트 완료일을 확인/선택한 후 확정해주세요.'}
            </p>
          </div>

          {/* Completion Date Selector */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
            <label className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>{lang === 'vi' ? 'Ngày hoàn thành *' : '완료일 *'}</span>
            </label>
            <input
              type="date"
              data-testid="project-completion-date-input"
              value={completedDate}
              min={project.start_date || undefined}
              max={todayStr}
              onChange={(e) => setCompletedDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
            />
          </div>

          {/* Incomplete Task List Container */}
          {count > 0 && (
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 text-[11px] block">
                {lang === 'vi' ? `Danh sách ${count} công việc chưa xong:` : `미완료 작업 목록 (${count}건):`}
              </label>
              <div className="max-h-40 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
                {incompleteTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between text-slate-800 font-medium bg-white p-2 rounded-lg border border-slate-200/80"
                  >
                    <span className="truncate max-w-[280px] font-semibold">{t.task_name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-500 font-mono">{t.end_date || 'N/A'}</span>
                      <span className="text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded font-black text-[10px]">
                        {t.actual_progress ?? t.progress ?? 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modal Internal Error Banner */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-bold flex items-center gap-2 text-xs animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              {lang === 'vi' ? 'Hủy' : '취소'}
            </button>
            {onViewIncompleteTasks && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewIncompleteTasks();
                }}
                className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-blue-700 hover:bg-blue-50 transition flex items-center gap-1 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{lang === 'vi' ? 'Xem việc chưa xong' : '미완료 작업 보기'}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleBatchComplete}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {submitting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>
              {submitting
                ? lang === 'vi'
                  ? `Đang xử lý ${count} việc...`
                  : `${count}건 완료 처리 중...`
                : lang === 'vi'
                ? `Hoàn thành tất cả ${count} việc & Lưu`
                : `${count}건 모두 완료 처리 후 프로젝트 완료`}
            </span>
          </button>
        </footer>
      </div>
    </div>
  );
};

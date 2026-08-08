// src/components/modals/WorkerConflictSummaryModal.tsx
import React, { useState } from 'react';
import { X, AlertTriangle, ExternalLink, User, Calendar, Layers, CheckCircle2 } from 'lucide-react';
import { CrossProjectConflictGroup } from '../../utils/crossProjectConflictDetector';
import { useI18n } from '../../hooks/useI18n';

interface WorkerConflictSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName?: string;
  conflicts: CrossProjectConflictGroup[];
  onNavigateToTask?: (projectId: string, taskId: string) => void;
  onAcknowledgeGroup?: (group: CrossProjectConflictGroup) => Promise<void>;
}

export const WorkerConflictSummaryModal: React.FC<WorkerConflictSummaryModalProps> = ({
  isOpen,
  onClose,
  projectName,
  conflicts = [],
  onNavigateToTask,
  onAcknowledgeGroup,
}) => {
  const { lang } = useI18n();
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const isVi = lang === 'vi';
  const uniqueWorkers = Array.from(new Set(conflicts.map((c) => c.worker_name)));

  const handleConfirmAndDismiss = async () => {
    if (onAcknowledgeGroup && conflicts.length > 0) {
      try {
        setSubmitting(true);
        for (const group of conflicts) {
          if (!group.acknowledged) {
            await onAcknowledgeGroup(group);
          }
        }
      } catch (err) {
        console.error('Failed to acknowledge conflicts:', err);
      } finally {
        setSubmitting(false);
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-hidden">
      <div
        data-testid="worker-conflict-summary-modal"
        className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150 my-auto overflow-hidden"
      >
        {/* Modal Header */}
        <header className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-amber-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">
                {isVi ? 'Chi tiết xung đột lịch' : '일정 충돌 상세'}
              </h3>
              {projectName && <p className="text-xs text-slate-500 font-medium">{projectName}</p>}
            </div>
          </div>
          <button
            type="button"
            data-testid="conflict-modal-close-btn"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm">
            <div className="flex items-center gap-3">
              <User className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-slate-500 text-xs block">
                  {isVi ? 'Nhân viên xung đột' : '충돌 작업자'}
                </span>
                <span className="font-semibold text-slate-800">
                  {uniqueWorkers.length}{isVi ? ' người' : '명'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Layers className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-slate-500 text-xs block">
                  {isVi ? 'Khoảng thời gian trùng' : '충돌 구간'}
                </span>
                <span className="font-semibold text-slate-800">
                  {conflicts.length}{isVi ? ' trường hợp' : '건'}
                </span>
              </div>
            </div>
          </div>

          {/* Conflict Groups List */}
          {conflicts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              {isVi ? 'Không tìm thấy xung đột lịch nào.' : '확인된 일정 충돌이 없습니다.'}
            </div>
          ) : (
            <div className="space-y-4">
              {conflicts.map((group) => (
                <div
                  key={group.id}
                  data-testid={`conflict-group-card-${group.id}`}
                  className="p-5 rounded-xl border border-amber-200 bg-amber-50/30 hover:border-amber-300 transition space-y-3"
                >
                  {/* Card Title & Badges */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-base">{group.worker_name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-md font-semibold border bg-purple-50 text-purple-700 border-purple-200">
                          {isVi ? 'Xung đột giữa các dự án' : '다른 프로젝트와 충돌'}
                        </span>
                        {group.acknowledged && (
                          <span className="text-xs px-2 py-0.5 rounded-md font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {isVi ? 'Đã xác nhận' : '확인 완료'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {group.overlap_start_date} ~ {group.overlap_end_date} ({group.total_working_days}{isVi ? ' ngày làm việc' : '일 근무'})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Projects & Tasks Breakdown */}
                  <div className="mt-3 bg-white rounded-lg border border-slate-200 overflow-hidden text-xs">
                    <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex justify-between font-semibold text-slate-600">
                      <span>{isVi ? 'Các dự án trùng lịch' : '겹치는 프로젝트 및 세부 작업'}</span>
                      <span>{isVi ? 'Tỷ lệ phân công' : '참고 담당 비중'}</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.projects.map((pSummary) => (
                        <div key={pSummary.project_id} className="px-3 py-2.5 space-y-1.5 hover:bg-slate-50/50">
                          <div className="flex items-center justify-between font-bold text-slate-800">
                            <span>📁 {pSummary.project_name}</span>
                            <span className="text-slate-600">{pSummary.total_allocation}%</span>
                          </div>
                          <div className="pl-3 space-y-1">
                            {pSummary.tasks.map((t) => (
                              <div key={t.task_id} className="flex items-center justify-between text-slate-600">
                                <span className="truncate pr-2">• {t.task_name} ({t.start_date} ~ {t.end_date})</span>
                                {onNavigateToTask && (
                                  <button
                                    type="button"
                                    data-testid={`conflict-view-task-btn-${t.task_id}`}
                                    onClick={() => {
                                      onNavigateToTask(t.project_id, t.task_id);
                                      onClose();
                                    }}
                                    className="p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition shrink-0"
                                    title={isVi ? 'Xem công việc' : '작업 보기'}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <footer className="shrink-0 px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-xl transition"
          >
            {isVi ? 'Đóng' : '닫기'}
          </button>
          <button
            type="button"
            data-testid="conflict-modal-confirm-btn"
            disabled={submitting}
            onClick={handleConfirmAndDismiss}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {isVi ? 'Xác nhận và ẩn cảnh báo' : '확인 후 알림 지우기'}
            </span>
          </button>
        </footer>
      </div>
    </div>
  );
};

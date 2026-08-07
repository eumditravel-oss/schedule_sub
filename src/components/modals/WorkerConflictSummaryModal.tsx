// src/components/modals/WorkerConflictSummaryModal.tsx
import React from 'react';
import { X, AlertTriangle, ArrowRight, ExternalLink, User, Calendar, Layers } from 'lucide-react';
import { CapacityConflictGroup } from '../../utils/capacityConflictDetector';

interface WorkerConflictSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName?: string;
  conflicts: CapacityConflictGroup[];
  onNavigateToTask?: (projectId: string, taskId: string) => void;
}

export const WorkerConflictSummaryModal: React.FC<WorkerConflictSummaryModalProps> = ({
  isOpen,
  onClose,
  projectName,
  conflicts = [],
  onNavigateToTask,
}) => {
  if (!isOpen) return null;

  const uniqueWorkers = Array.from(new Set(conflicts.map((c) => c.worker_name)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-hidden">
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
              <h3 className="font-bold text-slate-900 text-lg">일정 충돌 상세</h3>
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
                <span className="text-slate-500 text-xs block">충돌 작업자</span>
                <span className="font-semibold text-slate-800">{uniqueWorkers.length}명</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Layers className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-slate-500 text-xs block">충돌 구간</span>
                <span className="font-semibold text-slate-800">{conflicts.length}건</span>
              </div>
            </div>
          </div>

          {/* Conflict Groups List */}
          {conflicts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">확인된 일정 충돌이 없습니다.</div>
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
                        <span
                          className={`text-xs px-2 py-0.5 rounded-md font-semibold border ${
                            group.scope === 'CROSS_PROJECT'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-amber-100 text-amber-800 border-amber-300'
                          }`}
                        >
                          {group.scope === 'CROSS_PROJECT' ? '다른 프로젝트와 충돌' : '같은 프로젝트 내 과배정'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {group.overlap_start_date} ~ {group.overlap_end_date}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs text-slate-500 block">최대 업무 비중</span>
                      <span className="font-extrabold text-rose-600 text-lg">{group.max_total_allocation}%</span>
                      <span className="text-[11px] text-rose-500 block font-medium">({group.excess_percent}% 초과)</span>
                    </div>
                  </div>

                  {/* Tasks Breakdown */}
                  <div className="mt-3 bg-white rounded-lg border border-slate-200 overflow-hidden text-xs">
                    <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex justify-between font-semibold text-slate-600">
                      <span>겹치는 작업 및 프로젝트</span>
                      <span>담당 비중</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.tasks.map((t) => (
                        <div key={t.task_id} className="px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/50">
                          <div className="min-w-0 flex-1">
                            <span className="text-[11px] text-slate-500 block font-medium">{t.project_name}</span>
                            <span className="font-semibold text-slate-800 truncate block">{t.task_name}</span>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">
                              {t.allocation_percent}%
                            </span>

                            {onNavigateToTask && (
                              <button
                                type="button"
                                data-testid={`conflict-view-task-btn-${t.task_id}`}
                                onClick={() => {
                                  onNavigateToTask(t.project_id, t.task_id);
                                  onClose();
                                }}
                                className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                                title="작업 보기"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                            )}
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
        <footer className="shrink-0 px-6 py-3 border-t border-slate-100 bg-slate-50 text-right">
          <button
            type="button"
            data-testid="conflict-modal-confirm-btn"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition shadow-xs"
          >
            확인
          </button>
        </footer>
      </div>
    </div>
  );
};

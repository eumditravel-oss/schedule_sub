// src/components/common/ProjectReadinessPopover.tsx
import React, { useState, useRef, useEffect } from 'react';
import { ProjectReadiness } from '../../utils/projectReadiness';
import { useI18n } from '../../hooks/useI18n';
import { CheckCircle2, AlertTriangle, HelpCircle, X, ChevronRight, ChevronDown, Wrench } from 'lucide-react';

interface ProjectReadinessPopoverProps {
  readiness: ProjectReadiness;
  projectName?: string;
  isExecutiveViewer?: boolean;
  hideIfReady?: boolean;
  onOpenWorkforceModal?: () => void;
  onOpenTaskModal?: (taskId?: string) => void;
  onOpenCompletionRepairModal?: () => void;
}

export const ProjectReadinessPopover: React.FC<ProjectReadinessPopoverProps> = ({
  readiness,
  projectName,
  isExecutiveViewer = false,
  hideIfReady = false,
  onOpenWorkforceModal,
  onOpenTaskModal,
  onOpenCompletionRepairModal,
}) => {
  const { lang } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const popoverRef = useRef<HTMLDivElement>(null);
  const shouldHide = hideIfReady && readiness.status === 'READY';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen && !shouldHide) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, shouldHide]);

  if (shouldHide) {
    return null;
  }

  const badgeColor = readiness.badge_color_class;
  const badgeIcon =
    readiness.status === 'RISK' ? (
      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
    ) : readiness.status === 'NEEDS_SETUP' ? (
      <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
    ) : (
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
    );

  const badgeLabel = lang === 'vi' ? readiness.badge_text_vi : readiness.badge_text_ko;

  const toggleCategory = (catKey: string) => {
    setExpandedCategories((prev) => ({ ...prev, [catKey]: !prev[catKey] }));
  };

  const groupKeys = Object.keys(readiness.issue_groups || {});

  const tooltipTitle =
    readiness.status === 'RISK' && groupKeys.includes('PROJECT_COMPLETION_INCONSISTENCY')
      ? lang === 'vi'
        ? `Dự án đã hoàn thành nhưng có ${readiness.total_issue_count} công việc chưa xác nhận.`
        : `프로젝트는 완료 상태지만 완료 확정되지 않은 세부 작업이 ${readiness.total_issue_count}건 있습니다.`
      : undefined;

  return (
    <div className="relative inline-block" ref={popoverRef} title={tooltipTitle}>
      <button
        type="button"
        data-testid="project-readiness-badge"
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition shadow-2xs hover:opacity-90 cursor-pointer ${badgeColor}`}
      >
        {badgeIcon}
        <span>{badgeLabel}</span>
      </button>

      {isOpen && (
        <div
          data-testid="project-readiness-popover"
          className="absolute left-0 mt-2 w-84 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-50 text-xs text-slate-800 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
            <div>
              <h4 className="font-extrabold text-slate-900 text-sm">{projectName || 'Project Readiness'}</h4>
              <p className="text-[11px] text-slate-500 font-medium">
                {lang === 'vi' ? 'Kiểm tra độ hoàn thiện dữ liệu dự án' : '프로젝트 데이터 완성도 점검'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {groupKeys.length === 0 ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{lang === 'vi' ? 'Tất cả cấu hình dự án đã hoàn tất.' : '모든 프로젝트 설정이 정상 완비되었습니다.'}</span>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {groupKeys.map((catKey) => {
                const grp = readiness.issue_groups[catKey];
                const isExpanded = Boolean(expandedCategories[catKey]);
                const isRisk = grp.severity === 'RISK';
                const isCompletionInconsistency = catKey === 'PROJECT_COMPLETION_INCONSISTENCY';

                return (
                  <div
                    key={catKey}
                    className={`rounded-lg border overflow-hidden ${
                      isRisk ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-50/50 border-amber-200'
                    }`}
                  >
                    {/* Category Header */}
                    <div
                      onClick={() => toggleCategory(catKey)}
                      className="p-2.5 flex items-center justify-between cursor-pointer hover:bg-black/5 transition"
                    >
                      <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
                        {isRisk ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        ) : (
                          <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        )}
                        <span>{lang === 'vi' ? grp.label_vi : grp.label_ko}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {catKey === 'ALLOCATION_UNSET' && onOpenWorkforceModal && !isExecutiveViewer && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsOpen(false);
                              onOpenWorkforceModal();
                            }}
                            className="text-[10px] font-extrabold text-blue-700 bg-blue-100 hover:bg-blue-200 px-2 py-0.5 rounded flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>{lang === 'vi' ? 'Phân bổ' : '투입 설정'}</span>
                          </button>
                        )}
                        {isCompletionInconsistency && onOpenCompletionRepairModal && !isExecutiveViewer && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsOpen(false);
                              onOpenCompletionRepairModal();
                            }}
                            className="text-[10px] font-extrabold text-amber-900 bg-amber-200 hover:bg-amber-300 border border-amber-400 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer shadow-2xs"
                          >
                            <Wrench className="w-3 h-3 text-amber-800" />
                            <span>{lang === 'vi' ? 'Xử lý hoàn thành' : '완료 상태 정리'}</span>
                          </button>
                        )}
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                        )}
                      </div>
                    </div>

                    {/* Collapsible Items List */}
                    {isExpanded && (
                      <div className="px-2.5 pb-2.5 pt-1.5 border-t border-amber-200/80 bg-white/80 space-y-1.5 text-[11px]">
                        {isCompletionInconsistency && (
                          <div className="p-2 bg-amber-50 rounded border border-amber-200 text-[10px] text-amber-900 font-medium leading-relaxed">
                            {lang === 'vi'
                              ? 'Dự án đã hoàn thành nhưng các công việc dưới đây chưa được xác nhận hoàn thành.'
                              : '프로젝트는 완료 처리되었지만 아래 세부 작업은 완료 확정되지 않았습니다.'}
                          </div>
                        )}

                        {grp.tasks &&
                          grp.tasks.map((tItem) => (
                            <div
                              key={tItem.id}
                              onClick={() => {
                                setIsOpen(false);
                                onOpenTaskModal?.(tItem.id);
                              }}
                              className="p-1.5 rounded hover:bg-slate-100 cursor-pointer flex items-center justify-between text-slate-700 border border-slate-100"
                            >
                              <div className="space-y-0.5 min-w-0">
                                <span className="font-semibold block text-slate-900 truncate">{tItem.task_name}</span>
                                {isCompletionInconsistency && (
                                  <span className="text-[10px] text-slate-500 block">
                                    자동 공정률: <strong className="text-slate-800">{tItem.actual_progress ?? tItem.progress ?? 0}%</strong> · 완료 확정: <strong className="text-amber-800 font-bold">미확정</strong>
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-1">
                                {tItem.end_date || 'N/A'}
                              </span>
                            </div>
                          ))}
                        {grp.workers &&
                          grp.workers.map((wItem) => (
                            <div key={wItem.id} className="p-1.5 rounded bg-slate-50 text-slate-800 font-semibold">
                              {wItem.name}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

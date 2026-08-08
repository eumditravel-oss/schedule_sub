// src/components/common/ProjectReadinessPopover.tsx
import React, { useState, useRef, useEffect } from 'react';
import { ProjectReadinessResult } from '../../utils/projectReadiness';
import { useI18n } from '../../hooks/useI18n';
import { CheckCircle2, AlertTriangle, HelpCircle, X, ChevronRight } from 'lucide-react';

interface ProjectReadinessPopoverProps {
  readiness: ProjectReadinessResult;
  projectName?: string;
  onOpenWorkforceModal?: () => void;
  onOpenTaskModal?: (taskId?: string) => void;
}

export const ProjectReadinessPopover: React.FC<ProjectReadinessPopoverProps> = ({
  readiness,
  projectName,
  onOpenWorkforceModal,
  onOpenTaskModal,
}) => {
  const { lang } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  let badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  let badgeIcon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
  let badgeLabel = lang === 'vi' ? 'Sẵn sàng' : '정상';

  if (readiness.status === 'RISK') {
    badgeColor = 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse';
    badgeIcon = <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />;
    badgeLabel = lang === 'vi' ? `Chú ý (${readiness.risk_count})` : `주의 ${readiness.risk_count}`;
  } else if (readiness.status === 'NEEDS_SETUP') {
    badgeColor = 'bg-amber-100 text-amber-900 border-amber-300';
    badgeIcon = <HelpCircle className="w-3.5 h-3.5 text-amber-600" />;
    badgeLabel = lang === 'vi' ? `Cần thiết lập (${readiness.setup_count})` : `설정 필요 ${readiness.setup_count}`;
  }

  return (
    <div className="relative inline-block" ref={popoverRef}>
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
          className="absolute left-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-50 text-xs text-slate-800 animate-in fade-in zoom-in-95 duration-150"
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
              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {readiness.issues.length === 0 ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{lang === 'vi' ? 'Tất cả cấu hình dự án đã hoàn tất.' : '모든 프로젝트 설정이 정상 완비되었습니다.'}</span>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {readiness.issues.map((issue, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-lg border text-[11px] font-medium flex items-start justify-between gap-2 ${
                    issue.severity === 'RISK' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="space-y-0.5 min-w-0">
                    <span className="font-bold block text-slate-900 truncate">
                      {lang === 'vi' ? issue.message_vi : issue.message_ko}
                    </span>
                  </div>

                  {issue.type === 'ALLOCATION_UNSET' && onOpenWorkforceModal && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onOpenWorkforceModal();
                      }}
                      className="text-[10px] font-extrabold text-blue-700 bg-blue-100 hover:bg-blue-200 px-2 py-1 rounded shrink-0 flex items-center gap-0.5"
                    >
                      <span>{lang === 'vi' ? 'Phân bổ' : '투입 설정'}</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

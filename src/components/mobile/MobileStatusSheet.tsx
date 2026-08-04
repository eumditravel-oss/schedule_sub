// src/components/mobile/MobileStatusSheet.tsx
import React from 'react';
import { DailyStatusType, WorkDayStatus } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { X, Check, Calendar, Info } from 'lucide-react';

interface MobileStatusSheetProps {
  isOpen: boolean;
  dateStr: string;
  taskName: string;
  currentStatus: DailyStatusType;
  workStatus?: WorkDayStatus;
  onSelect: (status: DailyStatusType) => void;
  onClose: () => void;
}

export const MobileStatusSheet: React.FC<MobileStatusSheetProps> = ({
  isOpen,
  dateStr,
  taskName,
  currentStatus,
  workStatus,
  onSelect,
  onClose,
}) => {
  const { t, lang } = useI18n();

  if (!isOpen) return null;

  const statusOptions: { type: DailyStatusType; label: string; colorClass: string }[] = [
    { type: 'NONE', label: t('statusNone'), colorClass: 'bg-slate-100 text-slate-700 border-slate-300' },
    { type: 'IN_PROGRESS', label: t('statusInProgress'), colorClass: 'bg-blue-50 text-blue-700 border-blue-300' },
    { type: 'COMPLETED', label: t('statusCompleted'), colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    { type: 'ISSUE', label: t('statusIssue'), colorClass: 'bg-amber-50 text-amber-800 border-amber-300' },
  ];

  const workLabel = workStatus
    ? lang === 'vi'
      ? workStatus.label_vi
      : workStatus.label_ko
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        data-testid="mobile-status-sheet"
        className="w-full max-w-md bg-white rounded-t-2xl shadow-2xl p-5 border-t border-slate-200 animate-in slide-in-from-bottom duration-200 space-y-4"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-1.5 text-xs text-blue-600 font-bold mb-0.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>{dateStr} {t('selectStatusTitle')}</span>
            </div>
            <h3 className="font-bold text-slate-900 text-sm truncate">
              {taskName}
            </h3>
          </div>
          <button
            type="button"
            data-testid="mobile-status-sheet-close"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Holiday / Work Status Information Banner */}
        {workStatus && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-900">{workLabel}</span>
                <span
                  className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${
                    workStatus.is_working_day
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {workStatus.is_working_day ? t('workday') : t('offDay')}
                </span>
              </div>
              {workStatus.worker_name && (
                <p className="text-[11px] text-slate-500">{t('worker')}: {workStatus.worker_name}</p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          {statusOptions.map((opt) => {
            const isSelected = currentStatus === opt.type;
            return (
              <button
                key={opt.type}
                type="button"
                data-testid={`status-option-${opt.type}`}
                onClick={() => {
                  onSelect(opt.type);
                  onClose();
                }}
                className={`py-3 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-between ${
                  opt.colorClass
                } ${isSelected ? 'ring-2 ring-blue-600 shadow-sm' : 'hover:brightness-95'}`}
              >
                <span>{opt.label}</span>
                {isSelected && <Check className="w-4 h-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

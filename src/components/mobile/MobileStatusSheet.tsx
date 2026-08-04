// src/components/mobile/MobileStatusSheet.tsx
import React from 'react';
import { DailyStatusType } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { X, Check, Calendar } from 'lucide-react';

interface MobileStatusSheetProps {
  isOpen: boolean;
  dateStr: string;
  taskName: string;
  currentStatus: DailyStatusType;
  onSelect: (status: DailyStatusType) => void;
  onClose: () => void;
}

export const MobileStatusSheet: React.FC<MobileStatusSheetProps> = ({
  isOpen,
  dateStr,
  taskName,
  currentStatus,
  onSelect,
  onClose,
}) => {
  const { t } = useI18n();

  if (!isOpen) return null;

  const statusOptions: { type: DailyStatusType; label: string; colorClass: string }[] = [
    { type: 'NONE', label: t('statusNone'), colorClass: 'bg-slate-100 text-slate-700 border-slate-300' },
    { type: 'IN_PROGRESS', label: t('statusInProgress'), colorClass: 'bg-blue-50 text-blue-700 border-blue-300' },
    { type: 'COMPLETED', label: t('statusCompleted'), colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    { type: 'ISSUE', label: t('statusIssue'), colorClass: 'bg-amber-50 text-amber-800 border-amber-300' },
  ];

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

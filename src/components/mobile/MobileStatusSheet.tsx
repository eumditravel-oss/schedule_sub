// src/components/mobile/MobileStatusSheet.tsx
import React from 'react';
import { DailyStatusType } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { Check, X, Clock, AlertTriangle, Circle } from 'lucide-react';

interface MobileStatusSheetProps {
  isOpen: boolean;
  dateStr: string;
  taskName?: string;
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

  const statuses: Array<{ type: DailyStatusType; label: string; icon: React.ReactNode; colorClass: string }> = [
    { type: 'NONE', label: t('statusNone'), icon: <Circle className="w-4 h-4 text-slate-400" />, colorClass: 'bg-slate-50 text-slate-700 border-slate-200' },
    { type: 'IN_PROGRESS', label: t('statusInProgress'), icon: <Clock className="w-4 h-4 text-blue-600" />, colorClass: 'bg-blue-50 text-blue-700 border-blue-200' },
    { type: 'COMPLETED', label: t('statusCompleted'), icon: <Check className="w-4 h-4 text-emerald-600" />, colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { type: 'ISSUE', label: t('statusIssue'), icon: <AlertTriangle className="w-4 h-4 text-amber-600" />, colorClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-xs">
      <div className="w-full bg-white rounded-t-2xl shadow-2xl p-4 animate-in slide-in-from-bottom duration-200 border-t border-slate-200 text-slate-900 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{t('selectStatusTitle')}</h3>
            <p className="text-xs text-slate-500">{dateStr} {taskName ? `• ${taskName}` : ''}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          {statuses.map((s) => {
            const isSelected = currentStatus === s.type;
            return (
              <button
                key={s.type}
                type="button"
                onClick={() => {
                  onSelect(s.type);
                  onClose();
                }}
                className={`w-full h-12 flex items-center justify-between px-4 rounded-xl text-sm font-bold border transition ${s.colorClass} ${
                  isSelected ? 'ring-2 ring-blue-500 shadow-sm' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  {s.icon}
                  <span>{s.label}</span>
                </div>
                {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

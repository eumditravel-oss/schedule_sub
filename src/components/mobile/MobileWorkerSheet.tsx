// src/components/mobile/MobileWorkerSheet.tsx
import React, { useEffect, useState } from 'react';
import { Worker, getWorkerColorGroup } from '../../types';
import { api, setCurrentWorker } from '../../services/api';
import { useI18n } from '../../hooks/useI18n';
import { X, Check, User } from 'lucide-react';

interface MobileWorkerSheetProps {
  isOpen: boolean;
  currentWorker: Worker | null;
  onClose: () => void;
  onSelectWorker: (worker: Worker) => void;
}

export const MobileWorkerSheet: React.FC<MobileWorkerSheetProps> = ({
  isOpen,
  currentWorker,
  onClose,
  onSelectWorker,
}) => {
  const { t, lang } = useI18n();
  const [workers, setWorkers] = useState<Worker[]>([]);

  useEffect(() => {
    if (isOpen) {
      api.getWorkers().then((data) => setWorkers(data || [])).catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelect = (w: Worker) => {
    setCurrentWorker(w);
    onSelectWorker(w);
    onClose();
  };

  const getBadgeInfo = (w: Worker) => {
    const group = getWorkerColorGroup(w);
    if (group === 'EXECUTIVE') {
      return { text: lang === 'vi' ? 'Chỉ xem' : '보기 전용', bg: 'bg-red-100 text-red-700 border-red-200' };
    }
    if (group === 'KOREAN_STAFF') {
      return { text: lang === 'vi' ? 'Hàn Quốc' : '한국', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    }
    return { text: 'Việt Nam', bg: 'bg-amber-100 text-amber-800 border-amber-200' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        data-testid="mobile-worker-sheet"
        className="w-full max-w-md bg-white rounded-t-2xl shadow-2xl p-5 border-t border-slate-200 animate-in slide-in-from-bottom duration-200 space-y-4 text-slate-900"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-slate-900 text-sm">
              {t('selectWorkerTitle')}
            </h3>
          </div>
          <button
            type="button"
            data-testid="mobile-worker-sheet-close"
            onClick={onClose}
            aria-label={t('close')}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
          {workers.map((w) => {
            const isSelected = currentWorker?.id === w.id;
            const group = getWorkerColorGroup(w);
            const badge = getBadgeInfo(w);

            const cardBg =
              group === 'EXECUTIVE'
                ? 'bg-red-50/70 border-red-200 text-red-900'
                : group === 'KOREAN_STAFF'
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : 'bg-amber-50/70 border-amber-200 text-amber-900';

            const testIdAttr =
              group === 'EXECUTIVE'
                ? 'worker-group-executive'
                : group === 'KOREAN_STAFF'
                ? 'worker-group-korean'
                : 'worker-group-vietnamese';

            return (
              <button
                key={w.id}
                type="button"
                data-testid={`mobile-worker-option-${w.name}`}
                onClick={() => handleSelect(w)}
                className={`w-full text-left px-3 py-3 rounded-xl text-xs font-semibold flex items-center justify-between border transition ${cardBg} ${
                  isSelected ? 'ring-2 ring-blue-500 font-bold' : ''
                }`}
              >
                <div className="flex items-center gap-3" data-testid={testIdAttr}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    group === 'EXECUTIVE'
                      ? 'bg-red-600 text-white'
                      : group === 'KOREAN_STAFF'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 text-white'
                  }`}>
                    {w.name[0]}
                  </div>
                  <span className="text-xs font-bold">{w.name}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${badge.bg}`}>
                    {badge.text}
                  </span>
                  {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

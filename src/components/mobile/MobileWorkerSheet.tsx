// src/components/mobile/MobileWorkerSheet.tsx
import React, { useEffect, useState } from 'react';
import { Worker } from '../../types';
import { api, setCurrentWorkerName, ACTUAL_WORKERS } from '../../services/api';
import { useI18n } from '../../hooks/useI18n';
import { Check, X, UserCheck } from 'lucide-react';

interface MobileWorkerSheetProps {
  isOpen: boolean;
  currentWorker: string;
  onClose: () => void;
  onSelectWorker: (name: string) => void;
}

export const MobileWorkerSheet: React.FC<MobileWorkerSheetProps> = ({
  isOpen,
  currentWorker,
  onClose,
  onSelectWorker,
}) => {
  const { t } = useI18n();
  const [workers, setWorkers] = useState<Worker[]>([]);

  useEffect(() => {
    if (isOpen) {
      api.getWorkers().then((data) => setWorkers(data || [])).catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelect = (name: string) => {
    setCurrentWorkerName(name);
    onSelectWorker(name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-xs">
      <div className="w-full bg-white rounded-t-2xl shadow-2xl p-4 animate-in slide-in-from-bottom duration-200 border-t border-slate-200 text-slate-900 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-2">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">{t('selectWorkerTitle')}</h3>
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

        <div className="space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {workers.map((w) => {
            const isSelected = currentWorker === w.name;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => handleSelect(w.name)}
                className={`w-full h-12 flex items-center justify-between px-3.5 rounded-xl text-sm font-semibold transition ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 font-bold'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/80'
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {w.name[0]}
                  </div>
                  <span className="truncate">{w.name}</span>
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

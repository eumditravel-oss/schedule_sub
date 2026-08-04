// src/components/mobile/MobileWorkerSheet.tsx
import React, { useEffect, useState } from 'react';
import { Worker } from '../../types';
import { api, setCurrentWorkerName } from '../../services/api';
import { useI18n } from '../../hooks/useI18n';
import { X, Check, User } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        data-testid="mobile-worker-sheet"
        className="w-full max-w-md bg-white rounded-t-2xl shadow-2xl p-5 border-t border-slate-200 animate-in slide-in-from-bottom duration-200 space-y-4"
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
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
          {workers.map((w) => {
            const isSelected = currentWorker === w.name;
            return (
              <button
                key={w.id}
                type="button"
                data-testid={`mobile-worker-option-${w.name}`}
                onClick={() => handleSelect(w.name)}
                className={`w-full text-left px-3 py-3 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 font-bold'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {w.name[0]}
                  </div>
                  <span className="text-xs">{w.name}</span>
                </div>
                {isSelected && <Check className="w-4 h-4 text-blue-600" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

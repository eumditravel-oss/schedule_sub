// src/components/modals/WorkerPromptModal.tsx
import React, { useState, useEffect } from 'react';
import { Worker } from '../../types';
import { api, setCurrentWorkerName } from '../../services/api';
import { useI18n } from '../../hooks/useI18n';
import { UserCheck } from 'lucide-react';

interface WorkerPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWorker: (name: string) => void;
}

export const WorkerPromptModal: React.FC<WorkerPromptModalProps> = ({
  isOpen,
  onClose,
  onSelectWorker,
}) => {
  const { t } = useI18n();
  const [workers, setWorkers] = useState<Worker[]>([]);

  const fetchWorkers = async () => {
    try {
      const data = await api.getWorkers();
      setWorkers(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchWorkers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelect = (name: string) => {
    setCurrentWorkerName(name);
    onSelectWorker(name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-slate-900 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{t('selectWorkerTitle')}</h2>
            <p className="text-xs text-slate-500">{t('selectWorkerPrompt')}</p>
          </div>
        </div>

        <div className="space-y-2 mb-6 max-h-72 overflow-y-auto custom-scrollbar">
          {workers.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => handleSelect(w.name)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl text-sm font-semibold text-slate-800 transition group"
            >
              <div className="flex items-center gap-3 truncate">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                  {w.name[0]}
                </div>
                <span className="truncate">{w.name}</span>
              </div>
              <span className="text-xs text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition shrink-0">선택 →</span>
            </button>
          ))}
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

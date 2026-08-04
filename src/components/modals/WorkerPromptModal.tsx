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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-slate-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">{t('selectWorkerTitle')}</h2>
            <p className="text-xs text-slate-400">{t('selectWorkerPrompt')}</p>
          </div>
        </div>

        <div className="space-y-2 mb-6 max-h-64 overflow-y-auto custom-scrollbar">
          {workers.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => handleSelect(w.name)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-900 hover:bg-blue-950/60 border border-slate-700 hover:border-blue-500/50 rounded-xl text-sm font-semibold text-white transition group"
            >
              <div className="flex items-center gap-3 truncate">
                <div className="w-7 h-7 rounded-full bg-blue-600/30 text-blue-300 font-bold flex items-center justify-center text-xs shrink-0">
                  {w.name[0]}
                </div>
                <span className="truncate">{w.name}</span>
              </div>
              <span className="text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition shrink-0">선택 →</span>
            </button>
          ))}
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 transition"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

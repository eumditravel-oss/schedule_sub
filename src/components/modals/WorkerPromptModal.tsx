// src/components/modals/WorkerPromptModal.tsx
import React, { useState, useEffect } from 'react';
import { Worker, getWorkerColorGroup } from '../../types';
import { api, setCurrentWorker } from '../../services/api';
import { UserCheck, Check } from 'lucide-react';

interface WorkerPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWorker: (worker: Worker) => void;
}

export const WorkerPromptModal: React.FC<WorkerPromptModalProps> = ({
  isOpen,
  onClose,
  onSelectWorker,
}) => {
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
      return { text: '보기 전용 / Chỉ xem', bg: 'bg-red-100 text-red-700 border-red-200' };
    }
    if (group === 'KOREAN_STAFF') {
      return { text: '한국 / Hàn Quốc', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    }
    return { text: 'Việt Nam', bg: 'bg-amber-100 text-amber-800 border-amber-200' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div data-testid="worker-prompt-modal" className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden p-6 space-y-5 text-slate-900">
        <div className="text-center space-y-1.5 border-b border-slate-100 pb-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
            <UserCheck className="w-6 h-6" />
          </div>
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
            현재 접속자를 선택하세요
          </h2>
          <p className="text-xs font-semibold text-slate-500">
            Vui lòng chọn người dùng hiện tại
          </p>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
          {workers.map((w) => {
            const group = getWorkerColorGroup(w);
            const badge = getBadgeInfo(w);

            const cardBg =
              group === 'EXECUTIVE'
                ? 'bg-red-50/80 border-red-200 text-red-900 hover:bg-red-100'
                : group === 'KOREAN_STAFF'
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900 hover:bg-emerald-100'
                : 'bg-amber-50/80 border-amber-200 text-amber-900 hover:bg-amber-100';

            return (
              <button
                key={w.id}
                type="button"
                data-testid={`worker-prompt-option-${w.name}`}
                onClick={() => handleSelect(w)}
                className={`w-full text-left px-3.5 py-3 rounded-xl text-xs font-bold flex items-center justify-between border transition shadow-2xs ${cardBg}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold ${
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

                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border shrink-0 ${badge.bg}`}>
                  {badge.text}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

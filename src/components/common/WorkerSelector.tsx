// src/components/common/WorkerSelector.tsx
import React, { useEffect, useState, useRef } from 'react';
import { Worker } from '../../types';
import { api, setCurrentWorkerName } from '../../services/api';
import { useI18n } from '../../hooks/useI18n';
import { User, ChevronDown, Check } from 'lucide-react';

interface WorkerSelectorProps {
  currentWorker: string;
  onWorkerChange: (name: string) => void;
}

export const WorkerSelector: React.FC<WorkerSelectorProps> = ({
  currentWorker,
  onWorkerChange,
}) => {
  const { t } = useI18n();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getWorkers().then((data) => setWorkers(data || [])).catch(console.error);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (name: string) => {
    setCurrentWorkerName(name);
    onWorkerChange(name);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        data-testid="worker-select-btn"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-9 px-3 rounded-lg border text-xs font-bold transition flex items-center gap-2 shadow-xs ${
          currentWorker
            ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
        }`}
      >
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
          currentWorker ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
        }`}>
          {currentWorker ? currentWorker[0] : <User className="w-3 h-3" />}
        </div>
        <span className="max-w-[130px] truncate">
          {currentWorker || t('selectWorker')}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-10 z-40 w-56 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-100 text-slate-900">
          <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
            {t('selectWorkerTitle')}
          </div>
          <div className="space-y-0.5 max-h-60 overflow-y-auto custom-scrollbar">
            {workers.map((w) => {
              const isSelected = currentWorker === w.name;
              return (
                <button
                  key={w.id}
                  type="button"
                  data-testid={`worker-option-${w.name}`}
                  onClick={() => handleSelect(w.name)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition ${
                    isSelected
                      ? 'bg-blue-50 text-blue-700 font-bold'
                      : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                      isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {w.name[0]}
                    </span>
                    <span className="truncate">{w.name}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// src/components/common/WorkerSelector.tsx
import React, { useEffect, useState, useRef } from 'react';
import { Worker, getWorkerColorGroup, isExecutiveViewer } from '../../types';
import { api, setCurrentWorker } from '../../services/api';
import { useI18n } from '../../hooks/useI18n';
import { User, ChevronDown, Check } from 'lucide-react';

interface WorkerSelectorProps {
  currentWorker: Worker | null;
  onWorkerChange: (worker: Worker) => void;
}

export const WorkerSelector: React.FC<WorkerSelectorProps> = ({
  currentWorker,
  onWorkerChange,
}) => {
  const { t, lang } = useI18n();
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

  const handleSelect = (w: Worker) => {
    setCurrentWorker(w);
    onWorkerChange(w);
    setIsOpen(false);
  };

  const getButtonStyles = (w: Worker | null) => {
    if (!w) return 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50';
    const group = getWorkerColorGroup(w);
    switch (group) {
      case 'EXECUTIVE':
        return 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100';
      case 'KOREAN_STAFF':
        return 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100';
      case 'VIETNAMESE_STAFF':
        return 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100';
    }
  };

  const getBadgeInfo = (w: Worker) => {
    const group = getWorkerColorGroup(w);
    if (group === 'EXECUTIVE') {
      return {
        text: lang === 'vi' ? 'Chỉ xem' : '보기 전용',
        bg: 'bg-red-100 text-red-700 border-red-200',
        testId: 'current-worker-role-badge',
      };
    }
    if (group === 'KOREAN_STAFF') {
      return {
        text: lang === 'vi' ? 'Hàn Quốc' : '한국',
        bg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        testId: 'worker-group-korean',
      };
    }
    return {
      text: 'Việt Nam',
      bg: 'bg-amber-100 text-amber-800 border-amber-200',
      testId: 'worker-group-vietnamese',
    };
  };

  const currentBadge = currentWorker ? getBadgeInfo(currentWorker) : null;

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        data-testid="worker-select-btn"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-9 px-3 rounded-lg border text-xs font-bold transition flex items-center gap-2 shadow-xs ${getButtonStyles(currentWorker)}`}
      >
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
          currentWorker && isExecutiveViewer(currentWorker)
            ? 'bg-red-600 text-white'
            : currentWorker && getWorkerColorGroup(currentWorker) === 'KOREAN_STAFF'
            ? 'bg-emerald-600 text-white'
            : currentWorker
            ? 'bg-amber-500 text-white'
            : 'bg-slate-200 text-slate-600'
        }`}>
          {currentWorker ? currentWorker.name[0] : <User className="w-3 h-3" />}
        </div>

        <span className="max-w-[120px] truncate">
          {currentWorker ? currentWorker.name : t('selectWorker')}
        </span>

        {currentBadge && (
          <span
            data-testid={currentBadge.testId}
            className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border shrink-0 ${currentBadge.bg}`}
          >
            {currentBadge.text}
          </span>
        )}

        <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-10 z-40 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-100 text-slate-900">
          <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
            {t('selectWorkerTitle')}
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
            {workers.map((w) => {
              const isSelected = currentWorker?.id === w.id || currentWorker?.name === w.name;
              const group = getWorkerColorGroup(w);
              const badge = getBadgeInfo(w);

              const rowStyle =
                group === 'EXECUTIVE'
                  ? 'hover:bg-red-50 text-red-900'
                  : group === 'KOREAN_STAFF'
                  ? 'hover:bg-emerald-50 text-emerald-900'
                  : 'hover:bg-amber-50 text-amber-900';

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
                  data-testid={`worker-option-${w.name}`}
                  onClick={() => handleSelect(w)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition ${rowStyle} ${
                    isSelected ? 'ring-1 ring-blue-500 font-bold bg-slate-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 truncate" data-testid={testIdAttr}>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                      group === 'EXECUTIVE'
                        ? 'bg-red-600 text-white'
                        : group === 'KOREAN_STAFF'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-500 text-white'
                    }`}>
                      {w.name[0]}
                    </span>
                    <span className="truncate">{w.name}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${badge.bg}`}>
                      {badge.text}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

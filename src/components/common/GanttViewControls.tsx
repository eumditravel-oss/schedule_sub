// src/components/common/GanttViewControls.tsx
import React from 'react';
import { GanttViewMode } from '../../utils/dateUtils';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface GanttViewControlsProps {
  viewMode: GanttViewMode;
  rangeTitle: string;
  onViewModeChange: (mode: GanttViewMode) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}

export const GanttViewControls: React.FC<GanttViewControlsProps> = ({
  viewMode,
  rangeTitle,
  onViewModeChange,
  onPrevious,
  onNext,
  onToday,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* 1. View Mode Toggle Buttons */}
      <div className="flex items-center p-1 bg-slate-900 border border-slate-700/80 rounded-xl shadow-inner text-xs font-semibold">
        <button
          type="button"
          onClick={() => onViewModeChange('THIRTY_DAYS')}
          className={`px-3 py-1.5 rounded-lg transition ${
            viewMode === 'THIRTY_DAYS'
              ? 'bg-blue-600 text-white font-bold shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          30일 보기
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('MONTH')}
          className={`px-3 py-1.5 rounded-lg transition ${
            viewMode === 'MONTH'
              ? 'bg-blue-600 text-white font-bold shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          월별 보기
        </button>
      </div>

      {/* 2. Range Title & Navigation */}
      <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1 shadow-sm">
        <button
          type="button"
          onClick={onPrevious}
          className="p-1 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs font-semibold"
          title={viewMode === 'THIRTY_DAYS' ? '30일 이전' : '이전 달'}
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">{viewMode === 'THIRTY_DAYS' ? '이전' : '이전 달'}</span>
        </button>

        <button
          type="button"
          onClick={onToday}
          className="flex items-center gap-1 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-blue-300 hover:text-white rounded text-xs font-bold transition"
        >
          <Calendar className="w-3.5 h-3.5 text-blue-400" />
          <span>오늘</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          className="p-1 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs font-semibold"
          title={viewMode === 'THIRTY_DAYS' ? '30일 이후' : '다음 달'}
        >
          <span className="hidden sm:inline">{viewMode === 'THIRTY_DAYS' ? '다음' : '다음 달'}</span>
          <ChevronRight className="w-4 h-4" />
        </button>

        <span className="ml-2 pl-3 border-l border-slate-700 text-xs font-bold text-slate-200 tracking-wide">
          {rangeTitle}
        </span>
      </div>
    </div>
  );
};

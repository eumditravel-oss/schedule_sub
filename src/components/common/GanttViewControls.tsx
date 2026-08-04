// src/components/common/GanttViewControls.tsx
import React from 'react';
import { GanttViewMode } from '../../utils/dateUtils';
import { useI18n } from '../../hooks/useI18n';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface GanttViewControlsProps {
  viewMode: GanttViewMode;
  rangeTitle: string;
  onViewModeChange: (mode: GanttViewMode) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  rightSlot?: React.ReactNode;
}

export const GanttViewControls: React.FC<GanttViewControlsProps> = ({
  viewMode,
  rangeTitle,
  onViewModeChange,
  onPrevious,
  onNext,
  onToday,
  rightSlot,
}) => {
  const { t } = useI18n();

  return (
    <div className="w-full bg-slate-850 border-b border-slate-800 px-5 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
      {/* Left: View mode toggles & Date navigation */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 1. View Mode Toggles */}
        <div className="flex items-center p-0.5 bg-slate-900 border border-slate-700/80 rounded-lg h-9 shadow-inner font-semibold">
          <button
            type="button"
            onClick={() => onViewModeChange('THIRTY_DAYS')}
            className={`h-8 px-3 rounded-md transition ${
              viewMode === 'THIRTY_DAYS'
                ? 'bg-blue-600 text-white font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('view30Days')}
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('MONTH')}
            className={`h-8 px-3 rounded-md transition ${
              viewMode === 'MONTH'
                ? 'bg-blue-600 text-white font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('viewMonth')}
          </button>
        </div>

        {/* 2. Range Navigation & Fixed Title Area */}
        <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg h-9 px-2 shadow-sm">
          <button
            type="button"
            onClick={onPrevious}
            className="h-7 px-2 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs font-semibold"
            title={viewMode === 'THIRTY_DAYS' ? t('prev') : t('prevMonth')}
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span>{viewMode === 'THIRTY_DAYS' ? t('prev') : t('prevMonth')}</span>
          </button>

          <button
            type="button"
            onClick={onToday}
            className="h-7 px-2.5 bg-slate-700 hover:bg-slate-600 text-blue-300 hover:text-white rounded text-xs font-bold transition flex items-center gap-1"
          >
            <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>{t('today')}</span>
          </button>

          <button
            type="button"
            onClick={onNext}
            className="h-7 px-2 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs font-semibold"
            title={viewMode === 'THIRTY_DAYS' ? t('next') : t('nextMonth')}
          >
            <span>{viewMode === 'THIRTY_DAYS' ? t('next') : t('nextMonth')}</span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>

          {/* Fixed min-width title to prevent UI shift */}
          <div className="ml-2 pl-3 border-l border-slate-700 min-w-[180px] text-center font-bold text-slate-200 tracking-wide text-xs">
            {rangeTitle}
          </div>
        </div>
      </div>

      {/* Right Slot: Optional Legend for Project Detail */}
      {rightSlot && <div className="flex items-center gap-3 shrink-0">{rightSlot}</div>}
    </div>
  );
};

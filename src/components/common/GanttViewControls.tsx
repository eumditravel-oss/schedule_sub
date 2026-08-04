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
    <div className="w-full bg-slate-50 border-b border-slate-200 px-5 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
      {/* Left: View mode toggles & Date navigation */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 1. View Mode Toggles */}
        <div className="flex items-center p-0.5 bg-slate-200/70 border border-slate-300 rounded-lg h-9 font-semibold">
          <button
            type="button"
            onClick={() => onViewModeChange('THIRTY_DAYS')}
            className={`h-8 px-3 rounded-md transition ${
              viewMode === 'THIRTY_DAYS'
                ? 'bg-white text-blue-700 font-bold shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('view30Days')}
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('MONTH')}
            className={`h-8 px-3 rounded-md transition ${
              viewMode === 'MONTH'
                ? 'bg-white text-blue-700 font-bold shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('viewMonth')}
          </button>
        </div>

        {/* 2. Range Navigation & Fixed Title Area */}
        <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg h-9 px-2 shadow-sm">
          <button
            type="button"
            onClick={onPrevious}
            className="h-7 px-2 rounded hover:bg-slate-100 text-slate-700 font-semibold transition flex items-center gap-1 text-xs"
            title={viewMode === 'THIRTY_DAYS' ? t('prev') : t('prevMonth')}
          >
            <ChevronLeft className="w-4 h-4 shrink-0 text-slate-500" />
            <span>{viewMode === 'THIRTY_DAYS' ? t('prev') : t('prevMonth')}</span>
          </button>

          <button
            type="button"
            onClick={onToday}
            className="h-7 px-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-bold transition flex items-center gap-1 border border-blue-200"
          >
            <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>{t('today')}</span>
          </button>

          <button
            type="button"
            onClick={onNext}
            className="h-7 px-2 rounded hover:bg-slate-100 text-slate-700 font-semibold transition flex items-center gap-1 text-xs"
            title={viewMode === 'THIRTY_DAYS' ? t('next') : t('nextMonth')}
          >
            <span>{viewMode === 'THIRTY_DAYS' ? t('next') : t('nextMonth')}</span>
            <ChevronRight className="w-4 h-4 shrink-0 text-slate-500" />
          </button>

          {/* Fixed min-width title to prevent UI shift */}
          <div className="ml-2 pl-3 border-l border-slate-200 min-w-[180px] text-center font-bold text-slate-800 tracking-wide text-xs">
            {rangeTitle}
          </div>
        </div>
      </div>

      {/* Right Slot: Optional Legend for Project Detail */}
      {rightSlot && <div className="flex items-center gap-3 shrink-0">{rightSlot}</div>}
    </div>
  );
};

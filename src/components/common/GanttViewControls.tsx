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
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 py-2 px-1 text-slate-900">
      {/* Left: View Mode Toggle [30일] [월별] */}
      <div className="flex items-center gap-2">
        <div className="flex items-center p-1 bg-slate-200/80 rounded-lg text-xs font-semibold">
          <button
            type="button"
            data-testid="view-30days-btn"
            onClick={() => onViewModeChange('THIRTY_DAYS')}
            className={`px-3 py-1.5 rounded-md transition font-bold ${
              viewMode === 'THIRTY_DAYS'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('gantt30View')}
          </button>
          <button
            type="button"
            data-testid="view-month-btn"
            onClick={() => onViewModeChange('MONTH')}
            className={`px-3 py-1.5 rounded-md transition font-bold ${
              viewMode === 'MONTH'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('viewMonth')}
          </button>
        </div>

        {/* Navigation Range Title */}
        <div className="hidden md:flex items-center gap-1.5 text-xs font-bold text-slate-700 ml-2">
          <Calendar className="w-3.5 h-3.5 text-blue-600" />
          <span>{rangeTitle}</span>
        </div>
      </div>

      {/* Center: Previous / Today / Next Navigation */}
      <div className="flex items-center justify-between sm:justify-start gap-1 bg-white border border-slate-300 p-1 rounded-lg shadow-2xs">
        <button
          type="button"
          data-testid="nav-prev-btn"
          onClick={onPrevious}
          className="h-7 px-2.5 rounded hover:bg-slate-100 text-slate-700 font-semibold text-xs transition flex items-center gap-1"
          aria-label={t('prev')}
        >
          <ChevronLeft className="w-4 h-4 text-slate-500" />
          <span>{t('prev')}</span>
        </button>

        <button
          type="button"
          data-testid="nav-today-btn"
          onClick={onToday}
          className="h-7 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded text-xs transition border border-blue-200"
        >
          {t('today')}
        </button>

        <button
          type="button"
          data-testid="nav-next-btn"
          onClick={onNext}
          className="h-7 px-2.5 rounded hover:bg-slate-100 text-slate-700 font-semibold text-xs transition flex items-center gap-1"
          aria-label={t('next')}
        >
          <span>{t('next')}</span>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* Right Optional Slot (e.g. status legend) */}
      {rightSlot && <div className="hidden lg:block shrink-0">{rightSlot}</div>}
    </div>
  );
};

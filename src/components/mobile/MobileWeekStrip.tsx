// src/components/mobile/MobileWeekStrip.tsx
import React from 'react';
import { DailyStatusType } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { Check, AlertTriangle, Clock } from 'lucide-react';

export interface MobileWeekDay {
  dateStr: string;
  dayNum: number;
  dayName: string;
  isToday: boolean;
  isWeekend: boolean;
  isInTaskSpan: boolean;
}

interface MobileWeekStripProps {
  days: MobileWeekDay[];
  dailyStatuses: Record<string, DailyStatusType>;
  onCellClick?: (dateStr: string, currentStatus: DailyStatusType) => void;
  isReadOnly?: boolean;
}

export const MobileWeekStrip: React.FC<MobileWeekStripProps> = ({
  days,
  dailyStatuses,
  onCellClick,
  isReadOnly = false,
}) => {
  const { t } = useI18n();

  const getStatusBgClass = (status: DailyStatusType) => {
    switch (status) {
      case 'IN_PROGRESS':
        return 'bg-blue-600 text-white font-bold border-blue-600';
      case 'COMPLETED':
        return 'bg-emerald-600 text-white font-bold border-emerald-600';
      case 'ISSUE':
        return 'bg-amber-500 text-white font-bold border-amber-500';
      default:
        return 'bg-slate-50 text-slate-400 border-slate-200';
    }
  };

  const getStatusIcon = (status: DailyStatusType) => {
    switch (status) {
      case 'IN_PROGRESS':
        return <Clock className="w-3 h-3 text-white" />;
      case 'COMPLETED':
        return <Check className="w-3 h-3 text-white" />;
      case 'ISSUE':
        return <AlertTriangle className="w-3 h-3 text-white" />;
      default:
        return <span className="text-[10px] text-slate-400">•</span>;
    }
  };

  return (
    <div className="grid grid-cols-7 gap-1 text-center py-1">
      {days.map((col) => {
        const status = dailyStatuses[col.dateStr] || 'NONE';
        const bgClass = getStatusBgClass(status);

        return (
          <button
            key={col.dateStr}
            type="button"
            data-testid={`mobile-week-cell-${col.dateStr}`}
            disabled={!col.isInTaskSpan || isReadOnly}
            onClick={() => col.isInTaskSpan && onCellClick && onCellClick(col.dateStr, status)}
            className={`flex flex-col items-center justify-center p-1.5 rounded-xl border transition min-h-[44px] ${
              col.isToday
                ? 'ring-2 ring-blue-500 bg-blue-50/70 border-blue-300'
                : col.isWeekend
                ? 'bg-slate-50/60 border-slate-200/80'
                : 'bg-white border-slate-200/80'
            } ${col.isInTaskSpan && !isReadOnly ? 'active:scale-95 cursor-pointer' : 'opacity-60'}`}
          >
            <span className={`text-[10px] font-semibold ${col.isToday ? 'text-blue-700 font-bold' : col.isWeekend ? 'text-slate-400' : 'text-slate-500'}`}>
              {col.dayName}
            </span>
            <span className={`text-xs font-bold ${col.isToday ? 'text-blue-800' : 'text-slate-800'}`}>
              {col.dayNum}
            </span>

            {col.isInTaskSpan ? (
              <div className={`mt-1 w-6 h-6 rounded-full flex items-center justify-center border shadow-xs ${bgClass}`}>
                {getStatusIcon(status)}
              </div>
            ) : (
              <div className="mt-1 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-300">
                -
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};

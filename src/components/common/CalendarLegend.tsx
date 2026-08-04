// src/components/common/CalendarLegend.tsx
import React, { useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import { ChevronDown, ChevronUp, Info, X } from 'lucide-react';

interface CalendarLegendProps {
  isMobileView?: boolean;
}

export const CalendarLegend: React.FC<CalendarLegendProps> = ({ isMobileView }) => {
  const { t, lang } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  const legendItems = [
    {
      key: 'workday',
      labelKo: '일반 근무',
      labelVi: 'Ngày làm việc',
      colorClass: 'bg-white border border-slate-300 text-slate-700',
      symbol: null,
    },
    {
      key: 'weekly_off',
      labelKo: '정기 휴무',
      labelVi: 'Nghỉ hàng tuần',
      colorClass: 'bg-slate-100 border border-slate-200 text-slate-600',
      symbol: lang === 'vi' ? 'Nghỉ' : '휴',
    },
    {
      key: 'kr_holiday',
      labelKo: 'KR 공휴일',
      labelVi: 'Lễ Hàn Quốc (KR)',
      colorClass: 'bg-rose-100 border-l-4 border-l-rose-500 border-slate-200 text-rose-800 font-bold',
      badge: 'KR',
    },
    {
      key: 'vn_holiday',
      labelKo: 'VN 공휴일',
      labelVi: 'Lễ Việt Nam (VN)',
      colorClass: 'bg-amber-100 border-l-4 border-l-amber-500 border-slate-200 text-amber-900 font-bold',
      badge: 'VN',
    },
    {
      key: 'leave',
      labelKo: '개인 휴가',
      labelVi: 'Nghỉ phép',
      colorClass: 'bg-violet-100 border border-violet-300 text-violet-800 font-bold',
      symbol: lang === 'vi' ? 'Phép' : '휴가',
    },
    {
      key: 'off',
      labelKo: '수동 휴무',
      labelVi: 'Ngày nghỉ thủ công',
      colorClass: 'bg-orange-100 border border-orange-300 text-orange-800 font-bold',
      symbol: lang === 'vi' ? 'Nghỉ' : '휴무',
    },
    {
      key: 'work_override',
      labelKo: '근무일 지정',
      labelVi: 'Chỉ định làm việc',
      colorClass: 'bg-cyan-100 border border-cyan-300 text-cyan-900 font-bold',
      symbol: lang === 'vi' ? 'Làm' : '근무',
    },
    {
      key: 'today',
      labelKo: '오늘',
      labelVi: 'Hôm nay',
      colorClass: 'bg-blue-50 border-2 border-blue-500 text-blue-900 font-bold',
      symbol: '•',
    },
    {
      key: 'issue',
      labelKo: '문제 발생',
      labelVi: 'Có sự cố',
      colorClass: 'bg-white border border-slate-200 text-slate-800',
      dotClass: 'bg-red-500',
    },
  ];

  if (isMobileView) {
    return (
      <>
        <button
          type="button"
          data-testid="calendar-legend-mobile-btn"
          onClick={() => setIsMobileSheetOpen(true)}
          className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 shadow-xs"
        >
          <Info className="w-3.5 h-3.5 text-blue-600" />
          <span>{lang === 'vi' ? 'Chú giải' : '범례'}</span>
        </button>

        {isMobileSheetOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
            <div
              data-testid="calendar-legend-sheet"
              className="w-full bg-white rounded-t-2xl p-4 border-t border-slate-200 shadow-2xl max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-blue-600" />
                  <span>{lang === 'vi' ? 'Chú giải lịch làm việc' : '근무 일정 표 범례'}</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setIsMobileSheetOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                {legendItems.map((item) => (
                  <div
                    key={item.key}
                    className={`p-2 rounded-lg flex items-center gap-2 ${item.colorClass}`}
                  >
                    {item.badge ? (
                      <span className="px-1 py-0.5 rounded text-[10px] font-extrabold bg-white/80 border border-slate-300 shrink-0">
                        {item.badge}
                      </span>
                    ) : item.symbol ? (
                      <span className="text-[10px] font-bold shrink-0 px-1 bg-white/50 rounded">
                        {item.symbol}
                      </span>
                    ) : item.dotClass ? (
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.dotClass}`} />
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-xs bg-slate-200 shrink-0" />
                    )}
                    <span className="truncate">{lang === 'vi' ? item.labelVi : item.labelKo}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div data-testid="calendar-legend-desktop" className="w-full bg-slate-50 border-b border-slate-200 px-3 md:px-5 py-1.5 text-xs">
      <div className="flex items-center justify-between">
        <button
          type="button"
          data-testid="calendar-legend-toggle-btn"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 font-bold text-slate-700 hover:text-blue-600 transition"
        >
          <Info className="w-3.5 h-3.5 text-blue-600" />
          <span>{lang === 'vi' ? 'Chú giải 색상 체계' : '일정표 범례'}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {!isExpanded && (
          <div className="flex items-center gap-3 overflow-x-auto text-[11px] text-slate-600">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs border border-slate-300 bg-white" />
              {lang === 'vi' ? 'Ngày làm' : '일반근무'}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-slate-200" />
              {lang === 'vi' ? 'Nghỉ' : '정기휴무'}
            </span>
            <span className="flex items-center gap-1 font-bold text-rose-700">
              <span className="w-2.5 h-2.5 rounded-xs bg-rose-200 border-l-2 border-l-rose-500" />
              KR Lễ
            </span>
            <span className="flex items-center gap-1 font-bold text-amber-800">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-200 border-l-2 border-l-amber-500" />
              VN Lễ
            </span>
            <span className="flex items-center gap-1 font-bold text-violet-700">
              <span className="w-2.5 h-2.5 rounded-xs bg-violet-200" />
              {lang === 'vi' ? 'Phép' : '휴가'}
            </span>
            <span className="flex items-center gap-1 font-bold text-orange-700">
              <span className="w-2.5 h-2.5 rounded-xs bg-orange-200" />
              {lang === 'vi' ? 'Nghỉ' : '휴무'}
            </span>
            <span className="flex items-center gap-1 font-bold text-cyan-800">
              <span className="w-2.5 h-2.5 rounded-xs bg-cyan-200" />
              {lang === 'vi' ? 'Làm' : '근무'}
            </span>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="grid grid-cols-3 md:grid-cols-9 gap-2 mt-2 pt-2 border-t border-slate-200 text-[11px] animate-in fade-in duration-150">
          {legendItems.map((item) => (
            <div key={item.key} className={`p-1.5 rounded-md flex items-center gap-1.5 ${item.colorClass}`}>
              {item.badge ? (
                <span className="px-1 py-0.2 rounded text-[9px] font-extrabold bg-white/80 border border-slate-300 shrink-0">
                  {item.badge}
                </span>
              ) : item.symbol ? (
                <span className="text-[9px] font-bold shrink-0 px-0.5 bg-white/50 rounded">
                  {item.symbol}
                </span>
              ) : item.dotClass ? (
                <span className={`w-2 h-2 rounded-full shrink-0 ${item.dotClass}`} />
              ) : (
                <span className="w-2 h-2 rounded-xs bg-slate-300 shrink-0" />
              )}
              <span className="truncate">{lang === 'vi' ? item.labelVi : item.labelKo}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

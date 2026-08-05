// src/components/common/CalendarLegend.tsx
import React, { useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import { Info, X } from 'lucide-react';

interface CalendarLegendProps {
  isMobileView?: boolean;
}

export const CalendarLegend: React.FC<CalendarLegendProps> = ({ isMobileView }) => {
  const { lang } = useI18n();
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  const legendItems = [
    {
      key: 'workday',
      labelKo: '일반 근무',
      labelVi: 'Làm việc bình thường',
      colorClass: 'bg-emerald-50 border border-emerald-200 text-emerald-800',
      symbol: null,
    },
    {
      key: 'both_off',
      labelKo: '양국 휴무',
      labelVi: 'Nghỉ cả hai nước',
      colorClass: 'bg-rose-100 border border-rose-300 text-rose-900 font-bold',
      symbol: lang === 'vi' ? 'Nghỉ' : '휴',
    },
    {
      key: 'kr_only_off',
      labelKo: '한국만 휴무',
      labelVi: 'Chỉ Hàn Quốc nghỉ',
      colorClass: 'bg-orange-50 border border-orange-200 text-orange-900 font-bold',
      badge: 'KR',
    },
    {
      key: 'vn_only_off',
      labelKo: '베트남만 휴무',
      labelVi: 'Chỉ Việt Nam nghỉ',
      colorClass: 'bg-amber-50 border border-amber-200 text-amber-900 font-bold',
      badge: 'VN',
    },
    {
      key: 'leave',
      labelKo: '개인 휴가',
      labelVi: 'Nghỉ phép cá nhân',
      colorClass: 'bg-purple-100 border border-purple-200 text-purple-800 font-bold',
      symbol: lang === 'vi' ? 'Phép' : '휴가',
    },
    {
      key: 'off',
      labelKo: '수동 휴무',
      labelVi: 'Nghỉ bổ sung',
      colorClass: 'bg-slate-200 border border-slate-400 text-slate-800 font-bold',
      symbol: lang === 'vi' ? 'Nghỉ' : '휴무',
    },
    {
      key: 'work_override',
      labelKo: '근무일 지정',
      labelVi: 'Đi làm bổ sung',
      colorClass: 'bg-blue-100 border border-blue-200 text-blue-800 font-bold',
      symbol: lang === 'vi' ? 'Làm' : '근무',
    },
    {
      key: 'today',
      labelKo: '오늘',
      labelVi: 'Hôm nay',
      colorClass: 'ring-2 ring-blue-500 ring-inset bg-blue-50 text-blue-900 font-extrabold',
      symbol: '•',
    },
    {
      key: 'issue',
      labelKo: '문제 발생',
      labelVi: 'Có vấn đề',
      colorClass: 'bg-red-100 border border-red-300 text-red-800 font-bold',
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
                  <span>{lang === 'vi' ? 'Chú giải lịch biểu' : '일정표 범례'}</span>
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
                    data-testid={`legend-item-${item.key}`}
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
    <div
      data-testid="calendar-legend-desktop"
      className="w-full flex items-center gap-2 overflow-x-auto text-[11px] py-1 shrink-0 scrollbar-none"
    >
      <span className="font-extrabold text-slate-800 shrink-0 flex items-center gap-1 text-xs">
        <Info className="w-3.5 h-3.5 text-blue-600" />
        <span>{lang === 'vi' ? 'Chú giải lịch biểu' : '일정표 범례'}</span>
        <span className="text-slate-300 ml-1">|</span>
      </span>

      <div className="flex items-center gap-1.5 flex-wrap">
        {legendItems.map((item) => (
          <div
            key={item.key}
            data-testid={`legend-item-${item.key}`}
            className={`h-7 px-2 py-0.5 rounded-lg flex items-center gap-1.5 shrink-0 text-[10.5px] font-bold leading-none shadow-2xs ${item.colorClass}`}
          >
            {item.badge ? (
              <span className="px-1 py-0.2 rounded text-[9px] font-black bg-white/90 border border-slate-300 shrink-0">
                {item.badge}
              </span>
            ) : item.symbol ? (
              <span className="text-[9px] font-bold shrink-0 px-0.5 bg-white/60 rounded">
                {item.symbol}
              </span>
            ) : item.dotClass ? (
              <span className={`w-2 h-2 rounded-full shrink-0 ${item.dotClass}`} />
            ) : (
              <span className="w-2 h-2 rounded-xs bg-slate-300 shrink-0" />
            )}
            <span className="whitespace-nowrap">{lang === 'vi' ? item.labelVi : item.labelKo}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

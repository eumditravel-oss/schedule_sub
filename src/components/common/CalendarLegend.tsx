// src/components/common/CalendarLegend.tsx
import React, { useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import { Info, X } from 'lucide-react';
import { CALENDAR_VISUAL_TOKENS } from '../../utils/calendarVisualTokens';

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
      colorClass: 'bg-white border border-slate-200 text-slate-700 font-medium',
      hatchStyle: undefined,
    },
    {
      key: 'both_off',
      labelKo: '양국 휴무',
      labelVi: 'Nghỉ cả hai nước',
      colorClass: `${CALENDAR_VISUAL_TOKENS.BOTH_OFF.baseClass} border ${CALENDAR_VISUAL_TOKENS.BOTH_OFF.borderClass} ${CALENDAR_VISUAL_TOKENS.BOTH_OFF.textClass} font-bold`,
      hatchStyle: {
        backgroundImage: `repeating-linear-gradient(135deg, ${CALENDAR_VISUAL_TOKENS.BOTH_OFF.hatchColor} 0px, ${CALENDAR_VISUAL_TOKENS.BOTH_OFF.hatchColor} 4px, transparent 4px, transparent 8px)`,
      },
    },
    {
      key: 'kr_only_off',
      labelKo: '한국만 휴무',
      labelVi: 'Chỉ Hàn Quốc nghỉ',
      colorClass: `${CALENDAR_VISUAL_TOKENS.KR_ONLY_OFF.baseClass} border ${CALENDAR_VISUAL_TOKENS.KR_ONLY_OFF.borderClass} ${CALENDAR_VISUAL_TOKENS.KR_ONLY_OFF.textClass} font-bold`,
      badge: 'KR',
      hatchStyle: {
        backgroundImage: `repeating-linear-gradient(135deg, ${CALENDAR_VISUAL_TOKENS.KR_ONLY_OFF.hatchColor} 0px, ${CALENDAR_VISUAL_TOKENS.KR_ONLY_OFF.hatchColor} 4px, transparent 4px, transparent 8px)`,
      },
    },
    {
      key: 'vn_only_off',
      labelKo: '베트남만 휴무',
      labelVi: 'Chỉ Việt Nam nghỉ',
      colorClass: `${CALENDAR_VISUAL_TOKENS.VN_ONLY_OFF.baseClass} border ${CALENDAR_VISUAL_TOKENS.VN_ONLY_OFF.borderClass} ${CALENDAR_VISUAL_TOKENS.VN_ONLY_OFF.textClass} font-bold`,
      badge: 'VN',
      hatchStyle: {
        backgroundImage: `repeating-linear-gradient(135deg, ${CALENDAR_VISUAL_TOKENS.VN_ONLY_OFF.hatchColor} 0px, ${CALENDAR_VISUAL_TOKENS.VN_ONLY_OFF.hatchColor} 4px, transparent 4px, transparent 8px)`,
      },
    },
    {
      key: 'leave',
      labelKo: '개인 휴가',
      labelVi: 'Nghỉ phép cá nhân',
      colorClass: `${CALENDAR_VISUAL_TOKENS.PERSONAL_LEAVE.baseClass} border ${CALENDAR_VISUAL_TOKENS.PERSONAL_LEAVE.borderClass} ${CALENDAR_VISUAL_TOKENS.PERSONAL_LEAVE.textClass} font-bold`,
      hatchStyle: {
        backgroundImage: `repeating-linear-gradient(135deg, ${CALENDAR_VISUAL_TOKENS.PERSONAL_LEAVE.hatchColor} 0px, ${CALENDAR_VISUAL_TOKENS.PERSONAL_LEAVE.hatchColor} 4px, transparent 4px, transparent 8px)`,
      },
    },
    {
      key: 'off',
      labelKo: '수동 휴무',
      labelVi: 'Nghỉ bổ sung',
      colorClass: `${CALENDAR_VISUAL_TOKENS.MANUAL_OFF.baseClass} border ${CALENDAR_VISUAL_TOKENS.MANUAL_OFF.borderClass} ${CALENDAR_VISUAL_TOKENS.MANUAL_OFF.textClass} font-bold`,
      hatchStyle: {
        backgroundImage: `repeating-linear-gradient(135deg, ${CALENDAR_VISUAL_TOKENS.MANUAL_OFF.hatchColor} 0px, ${CALENDAR_VISUAL_TOKENS.MANUAL_OFF.hatchColor} 4px, transparent 4px, transparent 8px)`,
      },
    },
    {
      key: 'work_override',
      labelKo: '근무일 지정',
      labelVi: 'Đi làm bổ sung',
      colorClass: `${CALENDAR_VISUAL_TOKENS.WORK_OVERRIDE.baseClass} border ${CALENDAR_VISUAL_TOKENS.WORK_OVERRIDE.borderClass} ${CALENDAR_VISUAL_TOKENS.WORK_OVERRIDE.textClass} font-bold`,
      hatchStyle: undefined,
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
                    className={`p-2 rounded-lg flex items-center gap-2 relative overflow-hidden ${item.colorClass}`}
                  >
                    {item.hatchStyle && (
                      <div className="absolute inset-0 pointer-events-none opacity-40" style={item.hatchStyle} />
                    )}
                    {item.badge ? (
                      <span className="px-1 py-0.5 rounded text-[10px] font-extrabold bg-white/80 border border-slate-300 shrink-0 z-10">
                        {item.badge}
                      </span>
                    ) : item.symbol ? (
                      <span className="text-[10px] font-bold shrink-0 px-1 bg-white/50 rounded z-10">
                        {item.symbol}
                      </span>
                    ) : item.dotClass ? (
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 z-10 ${item.dotClass}`} />
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-xs bg-slate-400 shrink-0 z-10" />
                    )}
                    <span className="truncate z-10">{lang === 'vi' ? item.labelVi : item.labelKo}</span>
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
        <span>{lang === 'vi' ? 'Chú giải' : '범례'}:</span>
      </span>

      <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto">
        {legendItems.map((item) => (
          <div
            key={item.key}
            data-testid={`legend-item-${item.key}`}
            className={`px-2 py-0.5 rounded-md flex items-center gap-1 text-[11px] relative overflow-hidden select-none ${item.colorClass}`}
          >
            {item.hatchStyle && (
              <div className="absolute inset-0 pointer-events-none opacity-40" style={item.hatchStyle} />
            )}
            {item.badge ? (
              <span className="px-1 py-0.2 rounded text-[9px] font-extrabold bg-white/80 border border-slate-300 shrink-0 z-10">
                {item.badge}
              </span>
            ) : item.symbol ? (
              <span className="text-[10px] font-bold shrink-0 z-10">{item.symbol}</span>
            ) : item.dotClass ? (
              <span className={`w-2 h-2 rounded-full shrink-0 z-10 ${item.dotClass}`} />
            ) : null}
            <span className="shrink-0 z-10">{lang === 'vi' ? item.labelVi : item.labelKo}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

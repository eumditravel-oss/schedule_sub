// src/components/common/CalendarLegend.tsx
import React, { useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import { Info, X } from 'lucide-react';
import { CALENDAR_VISUAL_TOKENS, CalendarVisualState } from '../../utils/calendarVisualTokens';

interface CalendarLegendProps {
  isMobileView?: boolean;
}

export const CalendarLegend: React.FC<CalendarLegendProps> = ({ isMobileView }) => {
  const { lang } = useI18n();
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  const legendKeys: { key: string; tokenState?: CalendarVisualState; labelKo: string; labelVi: string; badge?: string; symbol?: string; dotClass?: string; colorClass?: string }[] = [
    {
      key: 'workday',
      tokenState: 'WORKDAY',
      labelKo: '일반 근무',
      labelVi: 'Làm việc bình thường',
      colorClass: 'bg-white border border-slate-200 text-slate-700 font-medium',
    },
    {
      key: 'both_off',
      tokenState: 'BOTH_OFF',
      labelKo: '양국 휴무',
      labelVi: 'Nghỉ cả hai nước',
      colorClass: `${CALENDAR_VISUAL_TOKENS.BOTH_OFF.baseClass} border ${CALENDAR_VISUAL_TOKENS.BOTH_OFF.borderClass} ${CALENDAR_VISUAL_TOKENS.BOTH_OFF.textClass} font-bold`,
    },
    {
      key: 'kr_only_off',
      tokenState: 'KR_ONLY_OFF',
      labelKo: '한국만 휴무',
      labelVi: 'Chỉ Hàn Quốc nghỉ',
      colorClass: `${CALENDAR_VISUAL_TOKENS.KR_ONLY_OFF.baseClass} border ${CALENDAR_VISUAL_TOKENS.KR_ONLY_OFF.borderClass} ${CALENDAR_VISUAL_TOKENS.KR_ONLY_OFF.textClass} font-bold`,
      badge: 'KR',
    },
    {
      key: 'vn_only_off',
      tokenState: 'VN_ONLY_OFF',
      labelKo: '베트남만 휴무',
      labelVi: 'Chỉ Việt Nam nghỉ',
      colorClass: `${CALENDAR_VISUAL_TOKENS.VN_ONLY_OFF.baseClass} border ${CALENDAR_VISUAL_TOKENS.VN_ONLY_OFF.borderClass} ${CALENDAR_VISUAL_TOKENS.VN_ONLY_OFF.textClass} font-bold`,
      badge: 'VN',
    },
    {
      key: 'leave',
      tokenState: 'PERSONAL_LEAVE',
      labelKo: '개인 휴가',
      labelVi: 'Nghỉ phép cá nhân',
      colorClass: `${CALENDAR_VISUAL_TOKENS.PERSONAL_LEAVE.baseClass} border ${CALENDAR_VISUAL_TOKENS.PERSONAL_LEAVE.borderClass} ${CALENDAR_VISUAL_TOKENS.PERSONAL_LEAVE.textClass} font-bold`,
    },
    {
      key: 'work_override',
      tokenState: 'WORK_OVERRIDE',
      labelKo: '근무일 지정',
      labelVi: 'Đi làm bổ sung',
      colorClass: `${CALENDAR_VISUAL_TOKENS.WORK_OVERRIDE.baseClass} border ${CALENDAR_VISUAL_TOKENS.WORK_OVERRIDE.borderClass} ${CALENDAR_VISUAL_TOKENS.WORK_OVERRIDE.textClass} font-bold`,
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
                {legendKeys.map((item) => {
                  const token = item.tokenState ? CALENDAR_VISUAL_TOKENS[item.tokenState] : null;
                  const hatchStyle = token?.hatch.enabled ? { backgroundImage: token.hatch.pattern } : undefined;

                  return (
                    <div
                      key={item.key}
                      data-testid={`legend-item-${item.key}`}
                      data-calendar-surface="LEGEND"
                      data-calendar-visual-state={token?.visualState || 'WORKDAY'}
                      data-calendar-hatch-type={token?.hatch.type || 'none'}
                      data-calendar-hatch-angle={token?.hatch.angle || 0}
                      className={`p-2 rounded-lg flex items-center gap-2 relative overflow-hidden ${item.colorClass}`}
                    >
                      {hatchStyle && (
                        <div className="absolute inset-0 pointer-events-none opacity-100" style={hatchStyle} />
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
                  );
                })}
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
        {legendKeys.map((item) => {
          const token = item.tokenState ? CALENDAR_VISUAL_TOKENS[item.tokenState] : null;
          const hatchStyle = token?.hatch.enabled ? { backgroundImage: token.hatch.pattern } : undefined;

          return (
            <div
              key={item.key}
              data-testid={`legend-item-${item.key}`}
              data-calendar-surface="LEGEND"
              data-calendar-visual-state={token?.visualState || 'WORKDAY'}
              data-calendar-hatch-type={token?.hatch.type || 'none'}
              data-calendar-hatch-angle={token?.hatch.angle || 0}
              className={`px-2 py-0.5 rounded-md flex items-center gap-1 text-[11px] relative overflow-hidden select-none ${item.colorClass}`}
            >
              {hatchStyle && (
                <div className="absolute inset-0 pointer-events-none opacity-100" style={hatchStyle} />
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
          );
        })}
      </div>
    </div>
  );
};

// src/components/print/PrintLegend.tsx
import React from 'react';
import { PrintColorMode, getPrintCalendarVisualStyle, getPrintGanttBarStyle } from '../../utils/printVisualTokens';
import { CalendarVisualState } from '../../utils/calendarVisualTokens';

export interface PrintLegendProps {
  colorMode?: PrintColorMode;
  lang?: 'ko' | 'vi';
  showGanttStatuses?: boolean;
  showCalendarStates?: boolean;
  showComparisonLayers?: boolean;
}

export const PrintLegend: React.FC<PrintLegendProps> = ({
  colorMode = 'color',
  lang = 'ko',
  showGanttStatuses = true,
  showCalendarStates = true,
  showComparisonLayers = true,
}) => {
  const isKo = lang === 'ko';

  const states: CalendarVisualState[] = [
    'BOTH_OFF',
    'KR_ONLY_OFF',
    'VN_ONLY_OFF',
    'PERSONAL_LEAVE',
    'WORK_OVERRIDE',
    'WORKDAY',
  ];

  const ganttStatuses = [
    { key: 'COMPLETED', labelKo: '완료', labelVi: 'Hoàn thành' },
    { key: 'IN_PROGRESS', labelKo: '진행중', labelVi: 'Đang thực hiện' },
    { key: 'BLOCKED', labelKo: '막힘 (!)', labelVi: 'Bị tắc nghẽn' },
    { key: 'DELAYED', labelKo: '지연', labelVi: 'Trễ hạn' },
    { key: 'NOT_STARTED', labelKo: '미시작', labelVi: 'Chưa bắt đầu' },
  ];

  return (
    <div className="print-legend w-full bg-slate-50 border border-slate-200 rounded p-2 text-[10px] text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-y-1.5 gap-x-4">
        {showComparisonLayers && <div data-testid="print-comparison-layer-legend" className="flex flex-wrap items-center gap-x-3 gap-y-1 basis-full border-b border-slate-200 pb-1.5"><span className="font-bold text-slate-900 pr-1 border-r border-slate-300">{isKo ? '비교 레이어:' : 'Layers:'}</span><span><i className="mr-1 inline-block h-2.5 w-3.5 rounded border border-dashed border-slate-500 bg-slate-200" />Baseline</span><span><i className="mr-1 inline-block h-2.5 w-3.5 rounded border border-blue-600 bg-blue-500" />Official</span><span><i className="mr-1 inline-block h-2.5 w-3.5 rounded border border-emerald-700 bg-emerald-500" />Actual evidence</span><span><i className="mr-1 inline-block h-2.5 w-3.5 rounded border-2 border-dashed border-violet-600 bg-violet-200" />Shadow fresh only</span></div>}
        {/* Calendar Off/Leave Tokens */}
        {showCalendarStates && <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-bold text-slate-900 pr-1 border-r border-slate-300">
            {isKo ? '달력 범례:' : 'Chú giải:'}
          </span>
          {states.map((stateKey) => {
            const token = getPrintCalendarVisualStyle(stateKey, colorMode);
            const label = isKo ? token.labelKo : token.labelVi;
            return (
              <div key={stateKey} className="flex items-center gap-1">
                <span
                  className="w-3.5 h-3.5 border rounded-sm inline-block shadow-xs"
                  style={{
                    backgroundColor: token.baseColor,
                    borderColor: token.accentColor,
                    backgroundImage: token.hatch.pattern || 'none',
                  }}
                />
                <span className="text-slate-800 font-medium">{label}</span>
              </div>
            );
          })}
        </div>}

        {/* Gantt Bar Statuses */}
        {showGanttStatuses && (
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${showCalendarStates ? 'pl-2 border-l border-slate-300' : ''}`}>
            <span className="font-bold text-slate-900 pr-1">
              {isKo ? '일정 상태:' : 'Trạng thái:'}
            </span>
            {ganttStatuses.map((st) => {
              const barStyle = getPrintGanttBarStyle(st.key, colorMode);
              const label = isKo ? st.labelKo : st.labelVi;
              return (
                <div key={st.key} className="flex items-center gap-1">
                  <span
                    className="w-3.5 h-2.5 rounded-xs inline-block border"
                    style={{
                      backgroundColor: barStyle.backgroundColor,
                      borderColor: barStyle.borderColor,
                      backgroundImage: barStyle.pattern || 'none',
                      borderStyle: barStyle.borderStyle || 'solid',
                    }}
                  />
                  <span className="text-slate-800 font-medium">{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

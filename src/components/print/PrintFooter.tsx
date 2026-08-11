// src/components/print/PrintFooter.tsx
import React from 'react';
import { PrintLegend } from './PrintLegend';
import { PrintColorMode } from '../../utils/printVisualTokens';

export interface PrintFooterProps {
  colorMode?: PrintColorMode;
  lang?: 'ko' | 'vi';
  printedAt?: string;
  viewerName?: string;
  showLegend?: boolean;
  showCalendarLegend?: boolean;
}

export const PrintFooter: React.FC<PrintFooterProps> = ({
  colorMode = 'color',
  lang = 'ko',
  printedAt = new Date().toLocaleString(),
  viewerName,
  showLegend = true,
  showCalendarLegend = true,
}) => {
  const isKo = lang === 'ko';

  return (
    <footer className="print-footer w-full mt-auto pt-3 border-t border-slate-300 space-y-2 text-[10px] text-slate-500 select-none">
      {showLegend && <PrintLegend colorMode={colorMode} lang={lang} showCalendarStates={showCalendarLegend} />}

      <div className="flex items-center justify-between font-mono text-[9.5px]">
        <div>
          <span>
            {isKo
              ? '본 문서는 Scheduler V2.5 데이터 기준으로 자동 생성되었습니다.'
              : 'Tài liệu này được tự động tạo từ dữ liệu Scheduler V2.5.'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {viewerName && (
            <span>
              {isKo ? '접속자: ' : 'Người in: '}
              <strong className="text-slate-700">{viewerName}</strong>
            </span>
          )}
          <span>
            {isKo ? '출력시각: ' : 'Thời gian: '}
            <strong className="text-slate-700">{printedAt}</strong>
          </span>
          <span className="font-semibold text-slate-400">CON-COST × VIETQS</span>
        </div>
      </div>
    </footer>
  );
};

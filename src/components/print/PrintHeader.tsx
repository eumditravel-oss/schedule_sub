// src/components/print/PrintHeader.tsx
import React from 'react';
import { PrintColorMode } from '../../utils/printVisualTokens';

export interface PrintHeaderProps {
  title: string;
  subtitle?: string;
  referenceDate?: string;
  printDate?: string;
  authorName?: string;
  pageNumber?: number;
  totalPages?: number;
  colorMode?: PrintColorMode;
  lang?: 'ko' | 'vi';
}

export const PrintHeader: React.FC<PrintHeaderProps> = ({
  title,
  subtitle,
  referenceDate = new Date().toISOString().substring(0, 10),
  printDate = new Date().toISOString().substring(0, 10),
  authorName,
  pageNumber = 1,
  totalPages = 1,
  colorMode = 'color',
  lang = 'ko',
}) => {
  const isKo = lang === 'ko';

  const isNavy = colorMode === 'color';
  const headerBgClass = isNavy ? 'bg-slate-900 text-white' : 'bg-slate-800 text-white border-b-2 border-slate-900';

  return (
    <header className={`print-header w-full rounded-t px-4 py-3 mb-3 ${headerBgClass} select-none`}>
      <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
        {/* Left: Brand & Logo */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-bold tracking-tight text-base text-white">
            <span className="bg-emerald-500 text-slate-900 px-1.5 py-0.5 rounded text-xs font-black">
              CON-COST
            </span>
            <span className="text-emerald-400 font-bold text-xs">×</span>
            <span className="bg-sky-500 text-slate-900 px-1.5 py-0.5 rounded text-xs font-black">
              VIETQS
            </span>
          </div>
          <span className="text-slate-400 text-xs pl-2 border-l border-slate-700">
            {isKo ? '개발팀 프로젝트 스케줄러' : 'Hệ thống Lịch trình Dự án'}
          </span>
        </div>

        {/* Right: Page Indicator */}
        <div className="text-xs font-semibold text-slate-300 bg-slate-800 px-2.5 py-1 rounded border border-slate-700">
          {isKo ? `페이지 ${pageNumber} / ${totalPages}` : `Trang ${pageNumber} / ${totalPages}`}
        </div>
      </div>

      {/* Main Title & Document Meta */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-bold text-white tracking-wide">{title}</h1>
          {subtitle && <p className="text-xs text-emerald-300 font-medium mt-0.5">{subtitle}</p>}
        </div>

        <div className="text-right text-[11px] text-slate-300 space-y-0.5">
          <div>
            <span className="text-slate-400">{isKo ? '출력일: ' : 'Ngày in: '}</span>
            <span className="font-semibold text-white">{printDate}</span>
          </div>
          <div>
            <span className="text-slate-400">{isKo ? '출력 기준일: ' : 'Ngày chuẩn: '}</span>
            <span className="font-semibold text-emerald-300">{referenceDate}</span>
          </div>
          {authorName && (
            <div>
              <span className="text-slate-400">{isKo ? '작성/접속자: ' : 'Người xem: '}</span>
              <span className="font-semibold text-white">{authorName}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

// src/components/print/PrintToolbar.tsx
import React, { useState } from 'react';
import { Printer, Download, X, Globe, Palette, FileText, Layout } from 'lucide-react';
import { PrintColorMode } from '../../utils/printVisualTokens';

export interface PrintToolbarProps {
  paper: 'a4' | 'a3';
  orientation: 'portrait' | 'landscape';
  colorMode: PrintColorMode;
  lang: 'ko' | 'vi';
  onPaperChange: (paper: 'a4' | 'a3') => void;
  onColorModeChange: (mode: PrintColorMode) => void;
  onLangChange: (lang: 'ko' | 'vi') => void;
  onPrint: () => void;
  onClose: () => void;
  documentTitle?: string;
}

export const PrintToolbar: React.FC<PrintToolbarProps> = ({
  paper,
  orientation,
  colorMode,
  lang,
  onPaperChange,
  onColorModeChange,
  onLangChange,
  onPrint,
  onClose,
  documentTitle = '보고용 출력 양식 미리보기',
}) => {
  const [showPdfGuide, setShowPdfGuide] = useState(false);

  const isKo = lang === 'ko';

  const handlePdfSave = () => {
    setShowPdfGuide(true);
    setTimeout(() => {
      onPrint();
    }, 400);
  };

  return (
    <>
      <div className="print-toolbar fixed top-0 left-0 right-0 z-50 bg-slate-900 text-white border-b border-slate-700 shadow-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-sm select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-bold text-white pr-2 border-r border-slate-700">
            <Printer className="w-5 h-5 text-emerald-400" />
            <span>{documentTitle}</span>
          </div>

          {/* Controls Group */}
          <div className="flex items-center gap-4 bg-slate-800/80 px-3 py-1 rounded-lg border border-slate-700">
            {/* Paper Size */}
            <div className="flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-slate-400" />
              <span className="text-slate-300 text-xs font-medium">{isKo ? '용지:' : 'Khổ giấy:'}</span>
              <div className="flex bg-slate-900 rounded p-0.5 border border-slate-700 text-xs">
                <button
                  onClick={() => onPaperChange('a4')}
                  className={`px-2 py-0.5 rounded font-semibold transition ${
                    paper === 'a4' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  A4
                </button>
                <button
                  onClick={() => onPaperChange('a3')}
                  className={`px-2 py-0.5 rounded font-semibold transition ${
                    paper === 'a3' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  A3
                </button>
              </div>
            </div>

            {/* Orientation */}
            <div className="flex items-center gap-1.5">
              <Layout className="w-4 h-4 text-slate-400" />
              <span className="text-slate-300 text-xs font-medium">{isKo ? '방향:' : 'Hướng:'}</span>
              <span
                data-testid="print-orientation-fixed"
                className="px-2 py-0.5 rounded bg-emerald-600 text-white font-semibold text-xs"
              >
                {isKo ? '가로 고정' : 'Ngang cố định'}
              </span>
            </div>

            {/* Color Mode */}
            <div className="flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-slate-400" />
              <span className="text-slate-300 text-xs font-medium">{isKo ? '색상:' : 'Màu sắc:'}</span>
              <div className="flex bg-slate-900 rounded p-0.5 border border-slate-700 text-xs">
                <button
                  onClick={() => onColorModeChange('color')}
                  className={`px-2 py-0.5 rounded transition ${
                    colorMode === 'color' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isKo ? '컬러' : 'Màu'}
                </button>
                <button
                  onClick={() => onColorModeChange('mono')}
                  className={`px-2 py-0.5 rounded transition ${
                    colorMode === 'mono' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isKo ? '흑백 (Mono)' : 'Đơn sắc'}
                </button>
              </div>
            </div>

            {/* Language */}
            <div className="flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-slate-400" />
              <span className="text-slate-300 text-xs font-medium">{isKo ? '언어:' : 'Ngôn ngữ:'}</span>
              <div className="flex bg-slate-900 rounded p-0.5 border border-slate-700 text-xs">
                <button
                  onClick={() => onLangChange('ko')}
                  className={`px-2 py-0.5 rounded transition ${
                    lang === 'ko' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  KR
                </button>
                <button
                  onClick={() => onLangChange('vi')}
                  className={`px-2 py-0.5 rounded transition ${
                    lang === 'vi' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  VN
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onPrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition shadow"
          >
            <Printer className="w-4 h-4" />
            <span>{isKo ? '인쇄하기' : 'In ngay'}</span>
          </button>

          <button
            onClick={handlePdfSave}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg transition shadow"
          >
            <Download className="w-4 h-4" />
            <span>{isKo ? 'PDF 저장' : 'Lưu PDF'}</span>
          </button>

          <button
            onClick={onClose}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg border border-slate-700 transition"
          >
            <X className="w-4 h-4" />
            <span>{isKo ? '닫기' : 'Đóng'}</span>
          </button>
        </div>
      </div>

      {/* PDF Guidance Toast Notice */}
      {showPdfGuide && (
        <div className="print-toolbar fixed top-16 right-4 z-50 bg-sky-900 border border-sky-500 text-white p-3 rounded-lg shadow-xl max-w-sm text-xs animate-fade-in flex items-start gap-2">
          <Download className="w-5 h-5 text-sky-300 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold mb-1">
              {isKo ? 'PDF 저장 안내' : 'Hướng dẫn lưu PDF'}
            </p>
            <p className="text-sky-100 leading-snug">
              {isKo
                ? '열리는 인쇄 창에서 대상 프린터를 [PDF로 저장]으로 선택하세요.'
                : 'Trong cửa sổ in mở ra, hãy chọn máy in là [Lưu dưới dạng PDF].'}
            </p>
          </div>
          <button onClick={() => setShowPdfGuide(false)} className="text-sky-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
};

// src/components/print/PrintDropdownMenu.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Printer, FileText, Calendar, Layers, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface PrintDropdownMenuProps {
  projectId?: string; // If provided, shows single project print options
  selectedProjectIds?: string[]; // Selected project IDs for combined A3 print
  lang?: 'ko' | 'vi';
  className?: string;
}

export const PrintDropdownMenu: React.FC<PrintDropdownMenuProps> = ({
  projectId,
  selectedProjectIds = [],
  lang = 'ko',
  className = '',
}) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().substring(0, 10));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isKo = lang === 'ko';

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowDatePicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNavigate = (path: string) => {
    setIsOpen(false);
    setShowDatePicker(false);
    navigate(path);
  };

  const currentYearStr = new Date().getFullYear().toString();
  const currentMonthStr = new Date().toISOString().substring(0, 7);

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        type="button"
        data-testid="print-menu-trigger-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 px-2.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1.5 transition shadow-2xs"
        title={isKo ? '보고용 인쇄 및 PDF 저장 양식 출력' : 'In và xuất PDF'}
      >
        <Printer className="w-3.5 h-3.5 text-emerald-700" />
        <span>{isKo ? '출력' : 'In'}</span>
        <ChevronDown className={`w-3 h-3 text-emerald-700 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          data-testid="print-dropdown-panel"
          className="absolute right-0 mt-1 w-64 rounded-lg bg-white border border-slate-200 shadow-xl z-50 p-1.5 text-xs text-slate-800 animate-fade-in"
        >
          {projectId ? (
            /* Project Detail Print Options */
            <div className="space-y-0.5">
              <div className="px-2 py-1 font-bold text-slate-500 text-[10px] uppercase border-b border-slate-100 mb-1">
                {isKo ? '단일 프로젝트 보고서' : 'Báo cáo dự án này'}
              </div>

              <button
                type="button"
                data-testid="print-a4-summary-btn"
                onClick={() => handleNavigate(`/print/project/${projectId}/summary-a4?lang=${lang}&colorMode=color`)}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-emerald-50 text-slate-800 font-medium flex items-center gap-2 transition"
              >
                <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">{isKo ? 'A4 프로젝트 요약' : 'A4 Tóm tắt dự án'}</div>
                  <div className="text-[10px] text-slate-500">{isKo ? '1페이지 요약 및 주 단위 타임라인' : 'Báo cáo tóm tắt A4'}</div>
                </div>
              </button>

              <button
                type="button"
                data-testid="print-a3-full-btn"
                onClick={() => handleNavigate(`/print/project/${projectId}/full-a3?lang=${lang}&colorMode=color`)}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-emerald-50 text-slate-800 font-medium flex items-center gap-2 transition"
              >
                <Layers className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">{isKo ? 'A3 프로젝트 전체 일정표' : 'A3 Lịch trình chi tiết'}</div>
                  <div className="text-[10px] text-slate-500">{isKo ? '30일 구간 분할 상세 Gantt' : 'Biểu đồ Gantt A3'}</div>
                </div>
              </button>
            </div>
          ) : (
            /* Project Overview Print Options */
            <div className="space-y-1">
              <div className="px-2 py-1 font-bold text-slate-500 text-[10px] uppercase border-b border-slate-100">
                {isKo ? 'A4 보고용 요약 양식' : 'Báo cáo tóm tắt A4'}
              </div>

              <button
                type="button"
                data-testid="print-a4-month-btn"
                onClick={() => handleNavigate(`/print/projects/month-a4?month=${currentMonthStr}&lang=${lang}&colorMode=color`)}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 text-slate-800 font-medium flex items-center gap-2 transition"
              >
                <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{isKo ? 'A4 월간 전체 보고서' : 'A4 Báo cáo hàng tháng'}</span>
              </button>

              <button
                type="button"
                data-testid="print-a4-halfyear-btn"
                onClick={() => handleNavigate(`/print/projects/half-year-a4?start=${currentMonthStr}&lang=${lang}&colorMode=color`)}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 text-slate-800 font-medium flex items-center gap-2 transition"
              >
                <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{isKo ? 'A4 반기(6개월) 보고서' : 'A4 Báo cáo 6 tháng'}</span>
              </button>

              <button
                type="button"
                data-testid="print-a4-year-btn"
                onClick={() => handleNavigate(`/print/projects/year-a4?year=${currentYearStr}&lang=${lang}&colorMode=color`)}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 text-slate-800 font-medium flex items-center gap-2 transition"
              >
                <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                <span>{isKo ? 'A4 연간 로드맵 보고서' : 'A4 Lộ trình hàng năm'}</span>
              </button>

              <div className="px-2 py-1 font-bold text-slate-500 text-[10px] uppercase border-b border-slate-100 pt-1">
                {isKo ? 'A3 일정표 / Gantt 양식' : 'Lịch trình Gantt A3'}
              </div>

              <button
                type="button"
                data-testid="print-a3-today30-btn"
                onClick={() => handleNavigate(`/print/projects/rolling-30-a3?mode=today&lang=${lang}&colorMode=color`)}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 text-slate-800 font-medium flex items-center gap-2 transition"
              >
                <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{isKo ? 'A3 오늘 기준 30일 일정표' : 'A3 Lịch 30 ngày từ hôm nay'}</span>
              </button>

              <div className="relative">
                <button
                  type="button"
                  data-testid="print-a3-custom30-btn"
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 text-slate-800 font-medium flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>{isKo ? 'A3 지정일 30일 일정표' : 'A3 Lịch 30 ngày tự chọn'}</span>
                  </div>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                {showDatePicker && (
                  <div className="p-2 mt-1 bg-slate-50 border border-slate-200 rounded text-xs space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-600">{isKo ? '시작 날짜 선택:' : 'Chọn ngày bắt đầu:'}</label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleNavigate(`/print/projects/rolling-30-a3?mode=custom&start=${customStartDate}&lang=${lang}&colorMode=color`)}
                      className="w-full py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-xs transition"
                    >
                      {isKo ? '이 날짜로 출력' : 'In theo ngày này'}
                    </button>
                  </div>
                )}
              </div>

              {/* Combined Projects A3 Option */}
              <button
                type="button"
                data-testid="print-a3-combined-btn"
                onClick={() => {
                  const queryIds = selectedProjectIds.length > 0 ? selectedProjectIds.join(',') : '';
                  handleNavigate(`/print/projects/combined-a3?projectIds=${queryIds}&lang=${lang}&colorMode=color`);
                }}
                className={`w-full text-left px-2 py-1.5 rounded text-slate-800 font-medium flex items-center justify-between transition ${
                  selectedProjectIds.length >= 2 && selectedProjectIds.length <= 3
                    ? 'hover:bg-emerald-50 border border-emerald-300 bg-emerald-50/50'
                    : 'hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>{isKo ? 'A3 선택 프로젝트 통합 일정표' : 'A3 Lịch tổng hợp đã chọn'}</span>
                </div>
                {selectedProjectIds.length > 0 && (
                  <span className="bg-emerald-600 text-white px-1.5 py-0.5 rounded-full text-[9.5px] font-bold">
                    {selectedProjectIds.length}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

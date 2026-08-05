// src/components/gantt/CalendarDateHeaderCell.tsx
import React, { useState } from 'react';
import { CalendarOverride, CountryHoliday } from '../../types';
import { getCountryOffState, CountryOffInfo } from '../../utils/workCalendar';
import { Info, X } from 'lucide-react';

interface CalendarDateHeaderCellProps {
  dateStr: string;
  isToday?: boolean;
  overrides?: CalendarOverride[];
  countryHolidays?: CountryHoliday[];
  lang?: 'ko' | 'vi';
  customClass?: string;
}

export const CalendarDateHeaderCell: React.FC<CalendarDateHeaderCellProps> = ({
  dateStr,
  isToday = false,
  overrides = [],
  countryHolidays = [],
  lang = 'ko',
  customClass = '',
}) => {
  const [showInfo, setShowInfo] = useState(false);
  const offInfo: CountryOffInfo = getCountryOffState(dateStr, overrides, countryHolidays);

  const d = new Date(`${dateStr}T00:00:00`);
  const dayNum = d.getDate();
  const dayOfWeekNamesKo = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeekNamesVi = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const dayOfWeekStr = lang === 'vi' ? dayOfWeekNamesVi[d.getDay()] : dayOfWeekNamesKo[d.getDay()];

  // Style classes based on state
  let bgBorderClass = 'bg-white border-slate-200 text-slate-700';
  if (offInfo.state === 'BOTH_OFF') {
    bgBorderClass = 'bg-rose-100 border-rose-300 text-rose-900';
  } else if (offInfo.state === 'KR_ONLY_OFF') {
    bgBorderClass = 'bg-orange-50 border-orange-200 text-orange-900';
  } else if (offInfo.state === 'VN_ONLY_OFF') {
    bgBorderClass = 'bg-amber-50 border-amber-200 text-amber-900';
  }

  const todayClass = isToday ? 'ring-2 ring-blue-500 ring-inset font-bold' : '';

  // Aria label construction
  let ariaText = `${dateStr} ${dayOfWeekStr}`;
  if (offInfo.krHolidayName && offInfo.vnHolidayName) {
    ariaText += `, 한국과 베트남 모두 공휴일 (${offInfo.krHolidayName})`;
  } else if (offInfo.krHolidayName) {
    ariaText += `, 한국 공휴일 (${offInfo.krHolidayName}), 베트남 정상 근무`;
  } else if (offInfo.vnHolidayName) {
    ariaText += `, 베트남 공휴일 (${offInfo.vnHolidayName}), 한국 정상 근무`;
  } else if (offInfo.state === 'BOTH_OFF') {
    ariaText += `, 한국과 베트남 모두 휴무`;
  } else if (offInfo.state === 'KR_ONLY_OFF') {
    ariaText += `, 한국 휴무, 베트남 근무`;
  } else if (offInfo.state === 'VN_ONLY_OFF') {
    ariaText += `, 베트남 휴무, 한국 근무`;
  }

  const hasHoliday = !!offInfo.krHolidayName || !!offInfo.vnHolidayName;

  return (
    <div
      data-date={dateStr}
      data-country-off-state={offInfo.state}
      aria-label={ariaText}
      onClick={() => hasHoliday && setShowInfo(!showInfo)}
      className={`relative flex flex-col items-center justify-center p-1 border-r border-b text-center cursor-pointer transition-colors duration-150 select-none ${bgBorderClass} ${todayClass} ${customClass}`}
      style={{ height: '48px', minWidth: '40px' }}
    >
      {/* 2px accent stripe for manual public holidays */}
      {hasHoliday && (
        <div
          className={`absolute top-0 left-0 right-0 h-[3px] ${
            offInfo.krHolidayName && offInfo.vnHolidayName
              ? 'bg-rose-600'
              : offInfo.krHolidayName
              ? 'bg-orange-500'
              : 'bg-amber-500'
          }`}
        />
      )}

      {/* Line 1: Day Number */}
      <span className="text-xs font-semibold leading-tight">{dayNum}</span>

      {/* Line 2: Day of Week */}
      <span className="text-[11px] font-medium opacity-80 leading-tight">{dayOfWeekStr}</span>

      {/* Detail Popover on Click */}
      {showInfo && hasHoliday && (
        <div
          className="absolute z-50 bottom-full mb-1 left-1/2 -translate-x-1/2 w-48 bg-slate-900 text-white text-xs rounded-lg p-2.5 shadow-xl border border-slate-700 text-left cursor-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between font-bold border-b border-slate-700 pb-1 mb-1.5">
            <span className="flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-blue-400" />
              {dateStr}
            </span>
            <button
              onClick={() => setShowInfo(false)}
              className="text-slate-400 hover:text-white p-0.5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {offInfo.krHolidayName && (
            <div className="mb-1">
              <span className="text-orange-300 font-semibold">🇰🇷 한국 공휴일:</span> {offInfo.krHolidayName}
              {offInfo.krHolidayCreator && (
                <div className="text-[10px] text-slate-400">등록자: {offInfo.krHolidayCreator}</div>
              )}
            </div>
          )}
          {offInfo.vnHolidayName && (
            <div>
              <span className="text-amber-300 font-semibold">🇻🇳 베트남 공휴일:</span> {offInfo.vnHolidayName}
              {offInfo.vnHolidayCreator && (
                <div className="text-[10px] text-slate-400">등록자: {offInfo.vnHolidayCreator}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

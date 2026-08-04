// src/components/mobile/MobileScheduleInfoSheet.tsx
import React from 'react';
import { Project, Task, Worker } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { X, Calendar, User, CheckCircle, Edit2, AlertCircle } from 'lucide-react';

interface MobileScheduleInfoSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  startDate?: string;
  endDate?: string;
  progress?: number;
  workerName?: string;
  workerGroup?: string;
  dailyStatus?: string;
  dateStr?: string;
  isReadOnly?: boolean;
  onEdit?: () => void;
}

export const MobileScheduleInfoSheet: React.FC<MobileScheduleInfoSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  startDate,
  endDate,
  progress = 0,
  workerName,
  workerGroup,
  dailyStatus,
  dateStr,
  isReadOnly = false,
  onEdit,
}) => {
  const { t, lang } = useI18n();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        data-testid="mobile-schedule-info-sheet"
        className="w-full max-w-lg bg-white rounded-t-2xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-300 border-t border-slate-200 text-slate-900"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
              {subtitle || (lang === 'vi' ? 'Chi tiết' : '상세 정보')}
            </span>
            <h3 className="font-extrabold text-base text-slate-900 mt-1 leading-snug">
              {title}
            </h3>
          </div>
          <button
            type="button"
            data-testid="mobile-info-sheet-close-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-3 text-xs">
          {dateStr && (
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="font-bold text-slate-500">{lang === 'vi' ? 'Ngày' : '날짜'}</span>
              <span className="font-extrabold text-slate-900">{dateStr}</span>
            </div>
          )}

          {startDate && endDate && (
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="font-bold text-slate-500">{t('period')}</span>
              <span className="font-semibold text-slate-800">{startDate} ~ {endDate}</span>
            </div>
          )}

          {workerName && (
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="font-bold text-slate-500">{t('worker')}</span>
              <div className="flex items-center gap-1.5 font-bold text-slate-900">
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span>{workerName}</span>
                {workerGroup && (
                  <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-700">
                    {workerGroup}
                  </span>
                )}
              </div>
            </div>
          )}

          {progress !== undefined && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between font-bold">
                <span className="text-slate-500">{t('progress')}</span>
                <span className="text-blue-700 text-sm font-extrabold">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  style={{ width: `${progress}%` }}
                  className="h-full bg-blue-600 transition-all"
                />
              </div>
            </div>
          )}

          {dailyStatus && (
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="font-bold text-slate-500">{lang === 'vi' ? 'Trạng thái' : '일별 상태'}</span>
              <span className="font-extrabold text-blue-700">{dailyStatus}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!isReadOnly && onEdit && (
          <div className="pt-2">
            <button
              type="button"
              data-testid="mobile-info-sheet-edit-btn"
              onClick={() => {
                onClose();
                onEdit();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition"
            >
              <Edit2 className="w-4 h-4" />
              <span>{t('edit')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

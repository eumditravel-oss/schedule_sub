import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { WorklogLanguage } from './worklogUi';
import { worklogText } from './worklogUi';

interface WorklogSubmitReviewProps {
  language: WorklogLanguage;
  mode: 'MORNING' | 'EOD';
  count: number;
  minutes: number;
  capacity: number;
  gap: number;
  overtime: number;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
}

export function WorklogSubmitReview({ language, mode, count, minutes, capacity, gap, overtime, onClose, onConfirm, submitting }: WorklogSubmitReviewProps) {
  const t = (key: string) => worklogText(language, key);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="worklog-review-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="worklog-review-title" className="text-lg font-extrabold text-slate-900">{t('reviewTitle')}</h2>
            <p className="mt-1 text-sm text-slate-600">{mode === 'MORNING' ? t('submitMorning') : t('submitEod')}</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={t('edit')}><X className="h-5 w-5" /></button>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
          <div><dt className="text-xs font-bold text-slate-500">{t('taskCount')}</dt><dd className="mt-1 font-extrabold text-slate-900">{count}</dd></div>
          <div><dt className="text-xs font-bold text-slate-500">{mode === 'MORNING' ? t('plannedTotal') : t('actualTotal')}</dt><dd className="mt-1 font-extrabold text-slate-900">{minutes}{t('minutes')}</dd></div>
          <div><dt className="text-xs font-bold text-slate-500">{t('capacity')}</dt><dd className="mt-1 font-extrabold text-slate-900">{capacity}{t('minutes')}</dd></div>
          <div><dt className="text-xs font-bold text-slate-500">{t('difference')}</dt><dd className="mt-1 font-extrabold text-slate-900">{minutes - capacity}{t('minutes')}</dd></div>
        </dl>
        {(gap > 30 || overtime > 0) && (
          <p className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{gap > 30 ? `${t('gap')}: ${gap}${t('minutes')}` : `${t('overtime')}: ${overtime}${t('minutes')}`}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">{t('edit')}</button>
          <button type="button" onClick={onConfirm} disabled={submitting} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60">{submitting ? t('submitting') : t('confirm')}</button>
        </div>
      </div>
    </div>
  );
}

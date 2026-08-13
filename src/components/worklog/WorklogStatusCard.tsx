import React from 'react';
import { AlertCircle, CheckCircle2, Clock3, Lock } from 'lucide-react';
import type { WorklogLanguage } from './worklogUi';
import { worklogText } from './worklogUi';

interface WorklogStatusCardProps {
  context: any;
  language: WorklogLanguage;
  readOnly: boolean;
}

function stateInfo(context: any, t: (key: string) => string) {
  const worklog = context?.worklog || {};
  if (worklog.status === 'CORRECTION_REQUESTED') return { text: t('correctionRequested'), tone: 'amber', icon: Clock3 };
  if (worklog.status === 'EOD_SUBMITTED' || worklog.status === 'SELF_REVISED' || worklog.status === 'MANAGER_CORRECTED') return { text: t('eodSubmitted'), tone: 'emerald', icon: CheckCircle2 };
  if (worklog.status === 'RETROACTIVE_PENDING_REVIEW' || worklog.requires_manager_review) return { text: t('managerReview'), tone: 'amber', icon: AlertCircle };
  if (worklog.status === 'MORNING_SUBMITTED') return { text: t('eodRequired'), tone: 'blue', icon: Clock3 };
  return { text: t('notCreated'), tone: 'slate', icon: Clock3 };
}

export function WorklogStatusCard({ context, language, readOnly }: WorklogStatusCardProps) {
  const t = (key: string) => worklogText(language, key);
  const capacity = context?.capacity || {};
  const worklog = context?.worklog || {};
  const status = stateInfo(context, t);
  const Icon = status.icon;
  const badgeClass = status.tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : status.tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : status.tone === 'blue' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-slate-50 text-slate-700';

  const cells = [
    [t('employee'), context?.subject?.name || context?.subject_employee_id || '-'],
    [t('date'), context?.local_work_date || '-'],
    [t('office'), capacity.office_code || '-'],
    [t('workHours'), `${capacity.work_start_local || '-'} ~ ${capacity.work_end_local || '-'}`],
    [t('lunch'), `${capacity.lunch_start_local || '-'} ~ ${capacity.lunch_end_local || '-'}`],
    [t('capacity'), `${Number(capacity.effective_capacity_minutes || 0)}${t('minutes')}`],
    [t('morningStatus'), worklog.current_morning_revision_id ? t('morningSubmitted') : t('notCreated')],
    [t('eodStatus'), worklog.current_eod_revision_id ? t('eodSubmitted') : t('eodRequired')],
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs" aria-label={t('status')}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-extrabold ${badgeClass}`} data-testid="worklog-status-badge">
            <Icon className="h-3.5 w-3.5" />{status.text}
          </span>
          {Number(worklog.morning_late) === 1 && <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700" title={t('late')}>{t('late')}</span>}
          {readOnly && <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700"><Lock className="h-3 w-3" />{t('readOnly')}</span>}
        </div>
        {worklog.current_eod_revision_id && <span className="text-xs font-semibold text-slate-500">{t('revision')} {worklog.current_revision_number || 0}</span>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {cells.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[11px] font-bold text-slate-500">{label}</dt>
            <dd className="mt-0.5 truncate text-sm font-extrabold text-slate-800" title={String(value)}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

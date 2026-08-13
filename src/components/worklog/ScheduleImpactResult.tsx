import React from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';
import type { WorklogLanguage } from './worklogUi';
import { worklogText } from './worklogUi';

interface ScheduleImpactResultProps {
  language: WorklogLanguage;
  result: any;
  loading: boolean;
}

export function ScheduleImpactResult({ language, result, loading }: ScheduleImpactResultProps) {
  const t = (key: string) => worklogText(language, key);
  if (!result && !loading) return null;
  const status = result?.status || result?.request_status || 'PENDING';
  const failed = ['FAILED', 'FAILED_RETRYABLE', 'BLOCKED'].includes(status);
  const done = ['COMPLETED', 'CURRENT', 'AUTO_APPLY_ELIGIBLE', 'APPROVAL_REQUIRED'].includes(status);
  const Icon = loading || status === 'PENDING' || status === 'RUNNING' ? LoaderCircle : failed ? AlertCircle : CheckCircle2;
  const tone = failed ? 'border-rose-200 bg-rose-50 text-rose-800' : done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-blue-200 bg-blue-50 text-blue-800';
  const label = failed ? (status === 'BLOCKED' ? t('blocked') : t('shadowFailed')) : done ? t('shadowDone') : t('calculating');
  const version = result?.versions?.[0];
  const impacted = result?.impacts?.[0];

  return (
    <section className={`rounded-xl border p-4 ${tone}`} aria-live="polite" data-testid="schedule-impact-result">
      <div className="flex gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${loading || !done && !failed ? 'animate-spin' : ''}`} />
        <div className="min-w-0">
          <h2 className="font-extrabold">{t('shadowImpact')}</h2>
          <p className="mt-1 text-sm leading-5">{label}</p>
          {version?.approval_classification === 'APPROVAL_REQUIRED' && <p className="mt-2 text-xs font-bold">{t('approvalRequired')}</p>}
          {impacted && <p className="mt-2 text-xs">{Number(impacted.affected_task_count || 0)} {t('taskCount')}</p>}
          <p className="mt-3 border-t border-current/15 pt-3 text-xs leading-5">{t('officialUnchanged')}</p>
        </div>
      </div>
    </section>
  );
}

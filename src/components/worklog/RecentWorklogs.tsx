import React from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import type { WorklogLanguage } from './worklogUi';
import { categoryLabel, worklogChangeTypeLabel, worklogStatusLabel, worklogText } from './worklogUi';

interface RecentWorklogsProps {
  language: WorklogLanguage;
  worklogs: any[];
  onOpen: (worklog: any) => void;
  loading?: boolean;
}

export function RecentWorklogs({ language, worklogs, onOpen, loading }: RecentWorklogsProps) {
  const t = (key: string) => worklogText(language, key);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs" aria-label={t('history')}>
      <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-blue-600" /><h2 className="font-extrabold text-slate-900">{t('history')}</h2></div>
      {loading ? <p className="py-6 text-sm text-slate-500">{t('loading')}</p> : worklogs.length === 0 ? <p className="py-6 text-sm text-slate-500">{t('noHistory')}</p> : (
        <ul className="mt-3 divide-y divide-slate-100">
          {worklogs.slice(0, 10).map((worklog) => (
            <li key={worklog.id}>
              <button type="button" onClick={() => onOpen(worklog)} className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-slate-50">
                <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900">{worklog.local_work_date}</p><p className="mt-0.5 text-xs text-slate-500">{worklogStatusLabel(language, worklog.status)} · {t('revision')} {worklog.current_revision_number || 0}</p></div>
                <span className="text-xs font-bold text-slate-600">{Number(worklog.actual_recorded_minutes || 0)}{t('minutes')}</span><ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface WorklogRevisionHistoryProps {
  language: WorklogLanguage;
  worklog: any | null;
  onClose: () => void;
}

export function WorklogRevisionHistory({ language, worklog, onClose }: WorklogRevisionHistoryProps) {
  const t = (key: string) => worklogText(language, key);
  if (!worklog) return null;
  const formatTime = (value: string | null | undefined) => {
    if (!value) return '-';
    try { return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'ko-KR', { dateStyle: 'short', timeStyle: 'short', timeZone: worklog.timezone || 'Asia/Seoul' }).format(new Date(value)); } catch { return '-'; }
  };
  const eodEntries = (worklog.entries || []).filter((entry: any) => entry.phase === 'EOD');
  const entriesForRevision = (revisionId: string) => eodEntries.filter((entry: any) => entry.revision_id === revisionId);
  const revisionDiff = (revision: any, index: number) => {
    const current = entriesForRevision(revision.id);
    const earlierRevisions = (worklog.revisions || []).slice(0, index).reverse();
    const prior = earlierRevisions.flatMap((item: any) => entriesForRevision(item.id));
    return current.map((entry: any) => {
      const before = prior.find((item: any) => item.task_id === entry.task_id && item.work_category === entry.work_category);
      return <p key={entry.id} className="mt-1 text-xs text-slate-600">{categoryLabel(language, entry.work_category)}: {before ? Number(before.actual_minutes || 0) : 0}{t('minutes')} → {Number(entry.actual_minutes || 0)}{t('minutes')}</p>;
    });
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="worklog-history-title">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><h2 id="worklog-history-title" className="text-lg font-extrabold text-slate-900">{worklog.local_work_date}</h2><p className="text-sm text-slate-500">{worklogStatusLabel(language, worklog.status)}</p></div><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">{t('back')}</button></div>
        <section className="mt-5"><h3 className="font-extrabold text-slate-900">{t('revisionHistory')}</h3><ol className="mt-3 space-y-2">{(worklog.revisions || []).map((revision: any, index: number) => <li key={revision.id} className="rounded-lg border border-slate-200 p-3 text-sm"><p className="font-bold text-slate-900">{t('revision')} {revision.revision_number} · {revision.phase === 'MORNING' ? t('morning') : t('eod')}</p><dl className="mt-2 grid gap-1 text-xs text-slate-600"><div><dt className="inline font-bold">{t('changedAt')}: </dt><dd className="inline">{formatTime(revision.created_at)}</dd></div><div><dt className="inline font-bold">{t('changeType')}: </dt><dd className="inline">{worklogChangeTypeLabel(language, revision.change_type)}</dd></div>{revision.reason && <div><dt className="inline font-bold">{t('reason')}: </dt><dd className="inline">{revision.reason}</dd></div>}</dl>{revision.phase === 'EOD' && <div className="mt-2 border-t border-slate-100 pt-1">{revisionDiff(revision, index)}</div>}</li>)}</ol></section>
        <section className="mt-5"><h3 className="font-extrabold text-slate-900">{t('actual')}</h3><ul className="mt-3 space-y-2">{eodEntries.map((entry: any) => <li key={entry.id} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-bold text-slate-800">{categoryLabel(language, entry.work_category)}</p><p className="mt-1 text-xs text-slate-600">{Number(entry.actual_minutes || 0)}{t('minutes')} {entry.work_result ? `· ${entry.work_result}` : ''}</p></li>)}</ul></section>
      </div>
    </div>
  );
}

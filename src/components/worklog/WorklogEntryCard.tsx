import React from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  categoryLabel,
  isPrimary,
  needsMeetingRecord,
  WORKLOG_CATEGORIES,
  type WorklogEntryDraft,
  type WorklogLanguage,
  type WorklogMode,
  type WorklogTask,
  worklogText,
} from './worklogUi';

interface WorklogEntryCardProps {
  entry: WorklogEntryDraft;
  mode: WorklogMode;
  language: WorklogLanguage;
  readOnly: boolean;
  currentProgress?: number;
  onChange: (entry: WorklogEntryDraft) => void;
  onRemove: () => void;
  canRemove: boolean;
  taskOptions?: WorklogTask[];
  fullDayMinutes: number;
}

const CHIP_MINUTES = [30, 60, 120, 240];

export function WorklogEntryCard({
  entry, mode, language, readOnly, currentProgress = 0, onChange, onRemove, canRemove, taskOptions = [], fullDayMinutes,
}: WorklogEntryCardProps) {
  const t = (key: string) => worklogText(language, key);
  const primary = isPrimary(entry);
  const minutesKey = mode === 'MORNING' ? 'plannedMinutes' : 'actualMinutes';
  const minutes = Number(entry[minutesKey] || 0);
  const update = (patch: Partial<WorklogEntryDraft>) => onChange({ ...entry, ...patch });
  const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 shadow-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs" data-testid={`worklog-entry-${entry.id}`}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{entry.projectName || t('project')}</p>
          <h3 className="mt-0.5 text-sm font-extrabold text-slate-900 break-words">{entry.taskName || categoryLabel(language, entry.category)}</h3>
          {entry.taskId && (
            <p className="mt-1 text-xs text-slate-500">
              {t('role')}: <span className="font-bold text-slate-700">{primary ? t('primary') : t('support')}</span>
            </p>
          )}
        </div>
        {canRemove && !readOnly && (
          <button type="button" onClick={onRemove} className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 px-2 text-xs font-bold text-rose-700 hover:bg-rose-50" aria-label={t('remove')}>
            <Minus className="h-3.5 w-3.5" />{t('remove')}
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">
          {t('category')}
          <select value={entry.category} disabled={readOnly} onChange={(event) => update({ category: event.target.value })} className={inputClass}>
            {WORKLOG_CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabel(language, category)}</option>)}
          </select>
        </label>

        {!entry.taskId && taskOptions.length > 0 && (
          <label className="text-xs font-bold text-slate-700">
            {t('task')}
            <select
              value=""
              disabled={readOnly}
              onChange={(event) => {
                const task = taskOptions.find((item) => item.task_id === event.target.value);
                if (task) {
                  const otherProject = ['OTHER_PROJECT_TASK', 'OUTSIDE_WORK_OTHER_PROJECT'].includes(entry.category);
                  update({ taskId: task.task_id, projectId: task.project_id, assignmentId: task.assignment_id, assignmentRole: task.assignment_role, projectName: task.project_name, taskName: task.task_name, relatedProjectId: otherProject ? task.project_id : undefined, relatedTaskId: otherProject ? task.task_id : undefined, category: entry.category === 'ADMINISTRATION' ? 'NORMAL_ASSIGNED_TASK' : entry.category });
                }
              }}
              className={inputClass}
            >
              <option value="">{t('addWork')}</option>
              {taskOptions.map((task) => <option key={task.task_id} value={task.task_id}>{task.project_name} · {task.task_name}</option>)}
            </select>
          </label>
        )}

        <label className="text-xs font-bold text-slate-700">
          {mode === 'MORNING' ? t('plan') : t('actual')} ({t('minutes')})
          <input
            type="number" min="0" step="30" inputMode="numeric" disabled={readOnly}
            data-testid={`worklog-${mode.toLowerCase()}-minutes`}
            value={minutes || ''}
            onChange={(event) => update({ [minutesKey]: Math.max(0, Number(event.target.value || 0)) } as Partial<WorklogEntryDraft>)}
            className={inputClass}
          />
          <span className="mt-2 flex flex-wrap gap-1" aria-label={mode === 'MORNING' ? t('plan') : t('actual')}>
            {[...CHIP_MINUTES, fullDayMinutes].filter((amount, index, values) => values.indexOf(amount) === index).map((amount) => (
              <button key={amount} type="button" disabled={readOnly} onClick={() => update({ [minutesKey]: amount } as Partial<WorklogEntryDraft>)} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50">
                {amount === fullDayMinutes ? t('fullDay') : `${amount}${t('minutes')}`}
              </button>
            ))}
          </span>
        </label>

        {mode === 'MORNING' && primary && entry.taskId && (
          <label className="text-xs font-bold text-slate-700">
            {t('targetProgress')} (%)
            <input type="number" min={currentProgress} max="100" step="1" disabled={readOnly} value={entry.targetProgress} onChange={(event) => update({ targetProgress: event.target.value })} className={inputClass} />
          </label>
        )}

        {mode === 'MORNING' && (
          <label className="text-xs font-bold text-slate-700 sm:col-span-2">
            {t('expectedDeliverable')}
            <input type="text" maxLength={500} disabled={readOnly} value={entry.expectedDeliverable} onChange={(event) => update({ expectedDeliverable: event.target.value })} className={inputClass} />
          </label>
        )}

        {mode === 'EOD' && primary && entry.taskId && (
          <>
            <label className="text-xs font-bold text-slate-700">
              {t('currentProgress')} (%)
              <input type="number" min={currentProgress} max="100" step="1" disabled={readOnly} data-testid="worklog-progress-after" value={entry.progressAfter} onChange={(event) => update({ progressAfter: event.target.value })} className={inputClass} />
            </label>
            <label className="text-xs font-bold text-slate-700">
              {t('remaining')} ({t('minutes')})
              <input type="number" min="0" step="30" disabled={readOnly} data-testid="worklog-remaining-minutes" value={entry.remainingMinutes} onChange={(event) => update({ remainingMinutes: event.target.value })} className={inputClass} />
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 sm:col-span-2">
              <input type="checkbox" checked={entry.completionReported} disabled={readOnly} onChange={(event) => update({ completionReported: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
              {t('completion')}
            </label>
          </>
        )}

        {!primary && entry.taskId && (
          <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 sm:col-span-2">{t('supportNoProgress')}</p>
        )}

        {mode === 'EOD' && (
          <>
            <label className="text-xs font-bold text-slate-700 sm:col-span-2">
              {t('workResult')}
              <textarea rows={3} maxLength={2000} disabled={readOnly} data-testid="worklog-work-result" value={entry.workResult} onChange={(event) => update({ workResult: event.target.value })} className={inputClass} />
            </label>
            <label className="text-xs font-bold text-slate-700">
              {t('deliverable')}
              <input type="text" maxLength={500} disabled={readOnly} value={entry.deliverable} onChange={(event) => update({ deliverable: event.target.value })} className={inputClass} />
            </label>
            <label className="text-xs font-bold text-slate-700">
              {t('blocker')}
              <input type="text" maxLength={500} disabled={readOnly} value={entry.knownBlocker} onChange={(event) => update({ knownBlocker: event.target.value })} className={inputClass} />
            </label>
          </>
        )}

        {needsMeetingRecord(entry.category) && mode === 'EOD' && (
          <fieldset className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 sm:col-span-2">
            <legend className="px-1 text-xs font-extrabold text-violet-800">{t('meeting')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">{t('purpose')}<input type="text" disabled={readOnly} value={entry.meetingPurpose} onChange={(event) => update({ meetingPurpose: event.target.value })} className={inputClass} /></label>
              <label className="text-xs font-bold text-slate-700">{t('location')}<input type="text" disabled={readOnly} value={entry.meetingLocation} onChange={(event) => update({ meetingLocation: event.target.value })} className={inputClass} /></label>
              <label className="text-xs font-bold text-slate-700">{t('participants')}<input type="text" disabled={readOnly} value={entry.meetingParticipants} onChange={(event) => update({ meetingParticipants: event.target.value })} className={inputClass} /></label>
              <div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold text-slate-700">{t('start')}<input type="time" disabled={readOnly} value={entry.meetingStart} onChange={(event) => update({ meetingStart: event.target.value })} className={inputClass} /></label><label className="text-xs font-bold text-slate-700">{t('end')}<input type="time" disabled={readOnly} value={entry.meetingEnd} onChange={(event) => update({ meetingEnd: event.target.value })} className={inputClass} /></label></div>
              <label className="text-xs font-bold text-slate-700 sm:col-span-2">{t('agenda')}<input type="text" disabled={readOnly} value={entry.meetingAgenda} onChange={(event) => update({ meetingAgenda: event.target.value })} className={inputClass} /></label>
              <label className="text-xs font-bold text-slate-700">{t('decision')}<input type="text" disabled={readOnly} value={entry.meetingDecision} onChange={(event) => update({ meetingDecision: event.target.value })} className={inputClass} /></label>
              <label className="text-xs font-bold text-slate-700">{t('followUp')}<input type="text" disabled={readOnly} value={entry.meetingFollowUp} onChange={(event) => update({ meetingFollowUp: event.target.value })} className={inputClass} /></label>
            </div>
          </fieldset>
        )}

        {['OTHER_PROJECT_TASK', 'OUTSIDE_WORK_OTHER_PROJECT'].includes(entry.category) && mode === 'EOD' && (
          <label className="text-xs font-bold text-slate-700 sm:col-span-2">
            {t('reason')}
            <select value={entry.reasonSource} disabled={readOnly} onChange={(event) => update({ reasonSource: event.target.value })} className={inputClass}>
              <option value="">-</option><option value="MANAGER_REQUEST">Manager request</option><option value="EMERGENCY_SUPPORT">Emergency support</option><option value="CUSTOMER_REQUEST">Customer request</option><option value="SELF_DECISION">Self decision</option><option value="OTHER">Other</option>
            </select>
          </label>
        )}

        {entry.category === 'APPROVED_LEAVE' && mode === 'EOD' && (
          <label className="text-xs font-bold text-slate-700 sm:col-span-2">
            Leave record ID
            <input type="text" disabled={readOnly} value={entry.leaveLinkId} onChange={(event) => update({ leaveLinkId: event.target.value })} className={inputClass} />
          </label>
        )}
      </div>
    </article>
  );
}

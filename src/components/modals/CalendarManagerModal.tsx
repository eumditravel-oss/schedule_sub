// src/components/modals/CalendarManagerModal.tsx
import React, { useState, useEffect } from 'react';
import { useI18n } from '../../hooks/useI18n';
import { Worker, CalendarOverride } from '../../types';
import { X, Calendar, Plus, Trash2, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

interface CalendarManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  workers: Worker[];
  currentWorker: string;
  onRefreshCalendar: () => void;
}

export const CalendarManagerModal: React.FC<CalendarManagerModalProps> = ({
  isOpen,
  onClose,
  workers,
  currentWorker,
  onRefreshCalendar,
}) => {
  const { t, lang } = useI18n();

  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [overrideType, setOverrideType] = useState<'LEAVE' | 'OFF' | 'WORK'>('LEAVE');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [labelKo, setLabelKo] = useState<string>('');
  const [labelVi, setLabelVi] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const [overrides, setOverrides] = useState<CalendarOverride[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const activeW = workers.find((w) => w.name === currentWorker);
      if (activeW) {
        setSelectedWorkerId(activeW.id);
      } else if (workers.length > 0) {
        setSelectedWorkerId(workers[0].id);
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      setStartDate(todayStr);
      setEndDate(todayStr);
      loadOverrides();
    }
  }, [isOpen, currentWorker, workers]);

  const loadOverrides = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/calendar/overrides');
      const json: any = await res.json();
      if (json.success) {
        setOverrides(json.data || []);
      }
    } catch (e) {
      console.error('Failed to load calendar overrides', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkerId || !startDate) return;

    const editorName = currentWorker || 'CEO';

    const defaultLabelKo =
      overrideType === 'LEAVE' ? '개인 휴가' : overrideType === 'OFF' ? '수동 휴무' : '근무일 지정';
    const defaultLabelVi =
      overrideType === 'LEAVE' ? 'Nghỉ phép' : overrideType === 'OFF' ? 'Ngày nghỉ thủ công' : 'Chỉ định ngày làm việc';

    try {
      const res = await fetch('/api/calendar/overrides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-editor-name': encodeURIComponent(editorName),
        },
        body: JSON.stringify({
          scope_type: 'WORKER',
          scope_key: selectedWorkerId,
          start_date: startDate,
          end_date: endDate || startDate,
          override_type: overrideType,
          label_ko: labelKo.trim() || defaultLabelKo,
          label_vi: labelVi.trim() || defaultLabelVi,
          note: note.trim(),
          editor_name: editorName,
        }),
      });

      const json: any = await res.json();
      if (json.success) {
        setMsg({ text: t('save'), type: 'success' });
        setLabelKo('');
        setLabelVi('');
        setNote('');
        await loadOverrides();
        onRefreshCalendar();
      } else {
        setMsg({ text: json.error?.message || t('taskSaveFailed'), type: 'error' });
      }
    } catch (e: any) {
      setMsg({ text: e.message || 'Error', type: 'error' });
    }
  };

  const handleDeleteOverride = async (id: string) => {
    const editorName = currentWorker || 'CEO';
    try {
      const res = await fetch(`/api/calendar/overrides/${id}`, {
        method: 'DELETE',
        headers: { 'x-editor-name': encodeURIComponent(editorName) },
      });
      const json: any = await res.json();
      if (json.success) {
        await loadOverrides();
        onRefreshCalendar();
      }
    } catch (e) {
      console.error('Failed to delete override', e);
    }
  };

  const handleSyncHolidays = async (countryCode: 'KR' | 'VN') => {
    setSyncing(true);
    setMsg(null);
    const editorName = currentWorker || 'CEO';
    try {
      const year = new Date().getFullYear();
      const res = await fetch('/api/calendar/holidays/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-editor-name': encodeURIComponent(editorName),
        },
        body: JSON.stringify({
          country_code: countryCode,
          year,
          editor_name: editorName,
        }),
      });

      const json: any = await res.json();
      if (json.success) {
        setMsg({
          text: `${countryCode} ${t('syncSuccess')} (${json.data.synced_count} items, source: ${json.data.source})`,
          type: 'success',
        });
        onRefreshCalendar();
      } else {
        setMsg({ text: t('holidaySyncFailedNotice'), type: 'error' });
      }
    } catch (e) {
      setMsg({ text: t('holidaySyncFailedNotice'), type: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="calendar-manager-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">{t('manageHolidays')}</h2>
          </div>
          <button
            type="button"
            data-testid="calendar-modal-close-btn"
            onClick={onClose}
            aria-label={t('close')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 text-slate-900">
          {msg && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                msg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {msg.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{msg.text}</span>
            </div>
          )}

          {/* Sync Public Holidays Toolbar */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-900">{t('syncHolidays')}</h3>
              <p className="text-[11px] text-slate-500">{t('publicHoliday')} (KR & VN)</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="sync-kr-holidays-btn"
                disabled={syncing}
                onClick={() => handleSyncHolidays('KR')}
                className="h-8 px-3 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${syncing ? 'animate-spin' : ''}`} />
                <span>KR 동기화</span>
              </button>

              <button
                type="button"
                data-testid="sync-vn-holidays-btn"
                disabled={syncing}
                onClick={() => handleSyncHolidays('VN')}
                className="h-8 px-3 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-rose-600 ${syncing ? 'animate-spin' : ''}`} />
                <span>VN Đồng bộ</span>
              </button>
            </div>
          </div>

          {/* Form: Add Personal Leave / Override */}
          <form onSubmit={handleCreateOverride} className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-blue-600" />
              <span>{t('leaveSchedule')}</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Target Worker */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">{t('worker')}</label>
                <select
                  data-testid="override-worker-select"
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                >
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.country_code || 'KR'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Type */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">{t('scopeType')}</label>
                <select
                  data-testid="override-type-select"
                  value={overrideType}
                  onChange={(e) => setOverrideType(e.target.value as any)}
                  className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                >
                  <option value="LEAVE">{t('leaveTypePersonal')}</option>
                  <option value="OFF">{t('leaveTypeManualOff')}</option>
                  <option value="WORK">{t('leaveTypeWorkOverride')}</option>
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">{t('startDate')}</label>
                <input
                  type="date"
                  data-testid="override-start-date-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">{t('endDate')}</label>
                <input
                  type="date"
                  data-testid="override-end-date-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                />
              </div>
            </div>

            {/* Label KO / VI Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">명칭 (한국어)</label>
                <input
                  type="text"
                  data-testid="override-label-ko-input"
                  placeholder={overrideType === 'LEAVE' ? '개인 휴가' : '수동 휴무'}
                  value={labelKo}
                  onChange={(e) => setLabelKo(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">명칭 (Tiếng Việt)</label>
                <input
                  type="text"
                  data-testid="override-label-vi-input"
                  placeholder={overrideType === 'LEAVE' ? 'Nghỉ phép' : 'Ngày nghỉ thủ công'}
                  value={labelVi}
                  onChange={(e) => setLabelVi(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                data-testid="override-save-btn"
                className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('save')}</span>
              </button>
            </div>
          </form>

          {/* List of Registered Overrides */}
          <div>
            <h3 className="text-xs font-bold text-slate-900 mb-2">{t('leaveSchedule')} 목록</h3>

            {loading ? (
              <p className="text-xs text-slate-400 py-4 text-center">{t('loading')}</p>
            ) : overrides.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">{t('noData')}</p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-52 overflow-y-auto">
                {overrides.map((ovr) => {
                  const targetWorker = workers.find((w) => w.id === ovr.scope_key);
                  const displayWorker = targetWorker ? targetWorker.name : ovr.scope_key;
                  const displayLabel = lang === 'vi' ? ovr.label_vi || ovr.label_ko : ovr.label_ko || ovr.label_vi;

                  return (
                    <div key={ovr.id} className="px-3 py-2.5 flex items-center justify-between text-xs hover:bg-slate-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                            ovr.override_type === 'LEAVE'
                              ? 'bg-violet-100 text-violet-700'
                              : ovr.override_type === 'OFF'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-cyan-100 text-cyan-700'
                          }`}
                        >
                          {ovr.override_type}
                        </span>
                        <span className="font-bold text-slate-900 shrink-0">{displayWorker}</span>
                        <span className="text-slate-500 font-medium">{ovr.work_date}</span>
                        <span className="text-slate-700 truncate font-semibold">({displayLabel})</span>
                      </div>

                      <button
                        type="button"
                        data-testid={`delete-override-btn-${ovr.id}`}
                        onClick={() => handleDeleteOverride(ovr.id)}
                        className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
};

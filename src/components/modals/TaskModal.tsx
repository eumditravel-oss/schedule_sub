// src/components/modals/TaskModal.tsx
import React, { useState, useEffect } from 'react';
import { Task } from '../../types';
import { getCurrentWorkerName, api } from '../../services/api';
import { useI18n } from '../../hooks/useI18n';
import { getKoreaDateString } from '../../utils/dateUtils';
import { X, Lock, Languages, RefreshCw } from 'lucide-react';

interface TaskModalProps {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  onSave: (data: Partial<Task>) => Promise<void>;
  task?: Task | null;
  currentWorkerName: string;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  projectId,
  onClose,
  onSave,
  task,
  currentWorkerName,
}) => {
  const { t, lang } = useI18n();

  const [workerName, setWorkerName] = useState('');
  const [inputLang, setInputLang] = useState<'ko' | 'vi'>(lang);
  const [taskName, setTaskName] = useState('');
  const [taskNameKo, setTaskNameKo] = useState('');
  const [taskNameVi, setTaskNameVi] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [transStatus, setTransStatus] = useState<'PENDING' | 'COMPLETED' | 'FAILED' | 'MANUAL'>('PENDING');

  useEffect(() => {
    const todayStr = getKoreaDateString();

    if (task) {
      setWorkerName(task.worker_name || currentWorkerName || getCurrentWorkerName());
      setTaskName(task.task_name || '');
      setTaskNameKo(task.task_name_ko || task.task_name || '');
      setTaskNameVi(task.task_name_vi || task.task_name || '');
      setStartDate(task.start_date || todayStr);
      setEndDate(task.end_date || todayStr);
      setProgress(task.progress ?? 0);
      setInputLang((task.source_language as any) || lang);
      setTransStatus(task.translation_status || 'COMPLETED');
    } else {
      const activeWorker = currentWorkerName || getCurrentWorkerName();
      setWorkerName(activeWorker);
      setTaskName('');
      setTaskNameKo('');
      setTaskNameVi('');
      setStartDate(todayStr);
      setEndDate(todayStr);
      setProgress(0);
      setInputLang(lang);
      setTransStatus('PENDING');
    }
  }, [task, isOpen, currentWorkerName, lang]);

  if (!isOpen) return null;

  const handleTranslateManual = async () => {
    const activeText = inputLang === 'ko' ? (taskNameKo || taskName) : (taskNameVi || taskName);
    if (!activeText.trim()) return;

    setTranslating(true);
    try {
      const targetLang = inputLang === 'ko' ? 'vi' : 'ko';
      const res = await api.translate(activeText, inputLang, targetLang);
      if (inputLang === 'ko') {
        setTaskNameKo(activeText);
        setTaskNameVi(res.translated_text);
      } else {
        setTaskNameVi(activeText);
        setTaskNameKo(res.translated_text);
      }
      setTransStatus('COMPLETED');
    } catch (err: any) {
      alert(err.message || t('translationFailed'));
      setTransStatus('FAILED');
    } finally {
      setTranslating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) return;

    if (!currentWorkerName && !getCurrentWorkerName()) {
      alert(t('selectWorkerPrompt'));
      return;
    }

    const primaryName = inputLang === 'ko' ? (taskNameKo || taskName) : (taskNameVi || taskName);
    if (!primaryName.trim()) return;

    setLoading(true);
    try {
      await onSave({
        project_id: projectId,
        worker_name: workerName,
        task_name: primaryName.trim(),
        task_name_ko: taskNameKo.trim() || (inputLang === 'ko' ? primaryName.trim() : undefined),
        task_name_vi: taskNameVi.trim() || (inputLang === 'vi' ? primaryName.trim() : undefined),
        source_language: inputLang,
        start_date: startDate,
        end_date: endDate,
        progress: Number(progress),
        translation_status: transStatus,
      });
      onClose();
    } catch (err: any) {
      alert(err.message || t('taskSaveFailed'));
    } finally {
      setLoading(false);
    }
  };

  const secondaryLabel = inputLang === 'ko' ? `${t('viText')} ${t('translatedTextLabel')}` : `${t('koText')} ${t('translatedTextLabel')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden text-slate-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-850">
          <h2 className="text-lg font-bold text-white">
            {task ? t('editTask') : t('addTask')}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
              <span>{t('worker')}</span>
              <Lock className="w-3 h-3 text-slate-500" />
            </label>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-slate-300 font-bold">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>{workerName || t('selectWorker')}</span>
            </div>
          </div>

          {/* Input Language Selector */}
          <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-lg border border-slate-700">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Languages className="w-4 h-4 text-blue-400" />
              <span>{t('inputLanguage')}</span>
            </span>
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-md text-xs font-bold">
              <button
                type="button"
                onClick={() => setInputLang('ko')}
                className={`px-3 py-1 rounded transition ${inputLang === 'ko' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {t('koText')}
              </button>
              <button
                type="button"
                onClick={() => setInputLang('vi')}
                className={`px-3 py-1 rounded transition ${inputLang === 'vi' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {t('viText')}
              </button>
            </div>
          </div>

          {/* Primary Task Name Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              {t('taskContent')} ({inputLang === 'ko' ? t('koText') : t('viText')}) *
            </label>
            <input
              type="text"
              required
              value={inputLang === 'ko' ? taskNameKo : taskNameVi}
              onChange={(e) => {
                if (inputLang === 'ko') setTaskNameKo(e.target.value);
                else setTaskNameVi(e.target.value);
                setTaskName(e.target.value);
              }}
              placeholder="Task detail"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 text-white"
            />
          </div>

          {/* Secondary Task Name / Manual Translation */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-slate-400">
                {secondaryLabel}
              </label>
              <button
                type="button"
                onClick={handleTranslateManual}
                disabled={translating}
                className="text-[11px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${translating ? 'animate-spin' : ''}`} />
                <span>{translating ? t('translating') : t('retryTranslation')}</span>
              </button>
            </div>
            <input
              type="text"
              value={inputLang === 'ko' ? taskNameVi : taskNameKo}
              onChange={(e) => {
                if (inputLang === 'ko') setTaskNameVi(e.target.value);
                else setTaskNameKo(e.target.value);
                setTransStatus('MANUAL');
              }}
              placeholder={t('automaticTranslationPlaceholder')}
              className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700/80 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">{t('startDate')} *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">{t('endDate')} *</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 text-white"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-slate-400">{t('progress')} (%)</label>
              <span className="text-xs font-bold text-blue-400">{progress}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-lg transition"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow transition disabled:opacity-50"
            >
              {loading ? t('saving') : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

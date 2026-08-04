// src/components/modals/ProjectModal.tsx
import React, { useState, useEffect } from 'react';
import { Project } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { useAutoTranslation } from '../../hooks/useAutoTranslation';
import { getLocalizedErrorMessage } from '../../i18n';
import { getKoreaDateString } from '../../utils/dateUtils';
import { X, Languages, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

interface ProjectModalProps {
  isOpen: boolean;
  project?: Project | null;
  onClose: () => void;
  onSave: (data: Partial<Project>) => Promise<void>;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  project,
  onClose,
  onSave,
}) => {
  const { t, lang } = useI18n();

  const [inputLang, setInputLang] = useState<'ko' | 'vi'>(lang);
  const [sourceText, setSourceText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  const initialTargetText = project
    ? (inputLang === 'ko' ? project.name_vi : project.name_ko) || ''
    : '';

  const {
    translatedText,
    status,
    isSourceChanged,
    setManualText,
    translateNow,
    cancelTranslation,
  } = useAutoTranslation({
    sourceText,
    sourceLanguage: inputLang,
    initialTargetText,
    initialStatus: project?.translation_status || 'COMPLETED',
    debounceMs: 700,
  });

  useEffect(() => {
    if (project) {
      const srcL = (project.source_language as 'ko' | 'vi') || lang;
      setInputLang(srcL);
      const srcT = srcL === 'ko' ? (project.name_ko || project.name || '') : (project.name_vi || project.name || '');
      setSourceText(srcT);
      setStartDate(project.start_date || '');
      setEndDate(project.end_date || '');
      setProgress(project.progress || 0);
    } else {
      const today = getKoreaDateString();
      setInputLang(lang);
      setSourceText('');
      setStartDate(today);
      setEndDate(today);
      setProgress(0);
    }
  }, [project, isOpen, lang]);

  if (!isOpen) return null;

  const handleClose = () => {
    cancelTranslation();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) return;
    if (!sourceText.trim()) return;

    setLoading(true);
    try {
      let finalTargetText = translatedText;
      if (status === 'PENDING' || status === 'TRANSLATING') {
        finalTargetText = await translateNow();
      }

      const nameKo = inputLang === 'ko' ? sourceText.trim() : finalTargetText.trim();
      const nameVi = inputLang === 'vi' ? sourceText.trim() : finalTargetText.trim();

      await onSave({
        name: sourceText.trim(),
        name_ko: nameKo || sourceText.trim(),
        name_vi: nameVi || sourceText.trim(),
        source_language: inputLang,
        start_date: startDate,
        end_date: endDate,
        progress: Number(progress),
        translation_status: status === 'MANUAL' ? 'MANUAL' : 'COMPLETED',
        force_translation: isSourceChanged,
      } as any);

      handleClose();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'PENDING':
        return <span className="text-[11px] font-medium text-amber-600">{t('translationPending')}</span>;
      case 'TRANSLATING':
        return (
          <span className="text-[11px] font-medium text-blue-600 flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>{t('translating')}</span>
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>{t('translationCompleted')}</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="text-[11px] font-medium text-red-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-red-600" />
            <span>{t('translationFailed')}</span>
          </span>
        );
      case 'MANUAL':
        return <span className="text-[11px] font-medium text-purple-600">{t('manualTranslation')}</span>;
      default:
        return null;
    }
  };

  const secondaryLabel = inputLang === 'ko' ? `${t('viText')} ${t('translatedTextLabel')}` : `${t('koText')} ${t('translatedTextLabel')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden text-slate-900">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-base font-bold text-slate-900">
            {project ? t('editProject') : t('addProject')}
          </h2>
          <button onClick={handleClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Input Language Selector */}
          <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Languages className="w-4 h-4 text-blue-600" />
              <span>{t('inputLanguage')}</span>
            </span>
            <div className="flex items-center gap-1 bg-white p-1 rounded-md text-xs font-bold border border-slate-200">
              <button
                type="button"
                onClick={() => setInputLang('ko')}
                className={`px-3 py-1 rounded transition ${inputLang === 'ko' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {t('koText')}
              </button>
              <button
                type="button"
                onClick={() => setInputLang('vi')}
                className={`px-3 py-1 rounded transition ${inputLang === 'vi' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {t('viText')}
              </button>
            </div>
          </div>

          {/* Primary Source Title Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('projectInfo')} ({inputLang === 'ko' ? t('koText') : t('viText')}) *
            </label>
            <input
              type="text"
              required
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="BIM Data System"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Secondary Translated Title Input & Realtime Status */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-slate-600">
                {secondaryLabel}
              </label>
              <div className="flex items-center gap-2">
                {getStatusBadge()}
                <button
                  type="button"
                  onClick={() => translateNow()}
                  disabled={status === 'TRANSLATING'}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${status === 'TRANSLATING' ? 'animate-spin' : ''}`} />
                  <span>{t('retryTranslation')}</span>
                </button>
              </div>
            </div>
            <input
              type="text"
              value={translatedText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder={t('automaticTranslationPlaceholder')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t('startDate')} *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t('endDate')} *</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-slate-600">{t('progress')} (%)</label>
              <span className="text-xs font-bold text-blue-600">{progress}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition disabled:opacity-50"
            >
              {loading ? t('saving') : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

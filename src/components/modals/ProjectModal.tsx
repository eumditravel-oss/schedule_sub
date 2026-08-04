// src/components/modals/ProjectModal.tsx
import React, { useState, useEffect } from 'react';
import { Project, Worker } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { useAutoTranslation } from '../../hooks/useAutoTranslation';
import { X, Sparkles, RefreshCw } from 'lucide-react';

interface ProjectModalProps {
  isOpen: boolean;
  project: Project | null;
  currentWorker: Worker | null;
  onClose: () => void;
  onSave: (data: Partial<Project>) => Promise<void>;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  project,
  currentWorker,
  onClose,
  onSave,
}) => {
  const { t, lang } = useI18n();

  const workerLang: 'ko' | 'vi' = currentWorker?.ui_language || (lang === 'vi' ? 'vi' : 'ko');
  const [inputLang, setInputLang] = useState<'ko' | 'vi'>(workerLang);
  const [nameInput, setNameInput] = useState('');
  const [targetText, setTargetText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  const targetLang = inputLang === 'ko' ? 'vi' : 'ko';

  const {
    translatedText: autoTranslatedText,
    status: autoStatus,
    setManualText,
  } = useAutoTranslation({
    sourceText: nameInput,
    sourceLanguage: inputLang,
    initialTargetText: targetText,
    debounceMs: 700,
  });

  useEffect(() => {
    if (autoStatus === 'TRANSLATING') {
      setTargetText('');
    } else if (autoTranslatedText) {
      setTargetText(autoTranslatedText);
    }
  }, [autoTranslatedText, autoStatus]);

  useEffect(() => {
    const src = currentWorker?.ui_language || (project?.source_language as 'ko' | 'vi') || workerLang;
    setInputLang(src);

    if (project) {
      const initialSourceText = src === 'vi' ? (project.name_vi || project.name) : (project.name_ko || project.name);
      const initialTransText = src === 'vi' ? (project.name_ko || '') : (project.name_vi || '');

      setNameInput(initialSourceText || '');
      setTargetText(initialTransText || '');
      setStartDate(project.start_date || '');
      setEndDate(project.end_date || '');
      setProgress(project.progress || 0);
    } else {
      const todayStr = new Date().toISOString().slice(0, 10);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const futureStr = futureDate.toISOString().slice(0, 10);

      setNameInput('');
      setTargetText('');
      setStartDate(todayStr);
      setEndDate(futureStr);
      setProgress(0);
    }
  }, [project, isOpen, currentWorker]);

  if (!isOpen) return null;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNameInput(e.target.value);
  };

  const handleTargetTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTargetText(val);
    setManualText(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) {
      alert(t('projectSaveFailed'));
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      alert('종료일은 시작일 이후여야 합니다.');
      return;
    }

    try {
      setSaving(true);

      const payload: Partial<Project> = {
        name: nameInput.trim(),
        start_date: startDate,
        end_date: endDate,
        progress: Number(progress),
        source_language: inputLang,
        translation_status: autoStatus === 'MANUAL' ? 'MANUAL' : 'COMPLETED',
      };

      if (inputLang === 'ko') {
        payload.name_ko = nameInput.trim();
        payload.name_vi = targetText.trim();
      } else {
        payload.name_vi = nameInput.trim();
        payload.name_ko = targetText.trim();
      }

      await onSave(payload);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div
        data-testid="project-modal"
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-900 text-sm">
            {project ? t('editProject') : t('addProject')}
          </h3>
          <button
            type="button"
            data-testid="project-close-btn"
            onClick={onClose}
            aria-label={t('cancel')}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Read-only Input Language Label */}
          <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-slate-700 font-bold text-xs flex items-center justify-between">
            <span>{inputLang === 'ko' ? '입력 언어: 한국어' : 'Ngôn ngữ nhập: Tiếng Việt'}</span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">
              {inputLang}
            </span>
          </div>

          {/* Source Text Input */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {t('projectInfo')} ({t('originalTag')}) *
            </label>
            <input
              type="text"
              data-testid="project-name-input"
              value={nameInput}
              onChange={handleNameChange}
              required
              placeholder={inputLang === 'ko' ? '프로젝트명을 입력하세요' : 'Nhập tên dự án'}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500 font-medium text-slate-900 bg-white"
            />
          </div>

          {/* Auto Translated Text Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>{t('translatedTextLabel')} ({targetLang.toUpperCase()})</span>
              </label>
              {autoStatus === 'TRANSLATING' && (
                <span className="text-[10px] text-blue-600 font-semibold flex items-center gap-1 animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  {t('translating')}
                </span>
              )}
            </div>
            <input
              type="text"
              data-testid="project-translated-input"
              value={targetText}
              onChange={handleTargetTextChange}
              placeholder={t('automaticTranslationPlaceholder')}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 font-medium text-slate-800 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {t('startDate')} *
              </label>
              <input
                type="date"
                data-testid="project-start-date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full h-9 px-3 rounded-lg border border-slate-300 font-medium text-slate-900"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {t('endDate')} *
              </label>
              <input
                type="date"
                data-testid="project-end-date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full h-9 px-3 rounded-lg border border-slate-300 font-medium text-slate-900"
              />
            </div>
          </div>

          {/* Progress */}
          <div>
            <div className="flex justify-between font-bold text-slate-700 mb-1">
              <span>{t('progress')}</span>
              <span className="text-blue-600">{progress}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              data-testid="project-cancel-btn"
              onClick={onClose}
              className="h-9 px-4 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-100"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              data-testid="project-save-btn"
              disabled={saving}
              className="h-9 px-4 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-sm disabled:opacity-50"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

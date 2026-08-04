// src/components/modals/ProjectModal.tsx
import React, { useState, useEffect } from 'react';
import { Project } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { api } from '../../services/api';
import { X, Languages, RefreshCw } from 'lucide-react';

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
  const [name, setName] = useState('');
  const [nameKo, setNameKo] = useState('');
  const [nameVi, setNameVi] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [transStatus, setTransStatus] = useState<'PENDING' | 'COMPLETED' | 'FAILED' | 'MANUAL'>('PENDING');

  useEffect(() => {
    if (project) {
      setName(project.name || '');
      setNameKo(project.name_ko || project.name || '');
      setNameVi(project.name_vi || project.name || '');
      setStartDate(project.start_date || '');
      setEndDate(project.end_date || '');
      setProgress(project.progress || 0);
      setInputLang((project.source_language as any) || lang);
      setTransStatus(project.translation_status || 'COMPLETED');
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setName('');
      setNameKo('');
      setNameVi('');
      setStartDate(today);
      setEndDate(today);
      setProgress(0);
      setInputLang(lang);
      setTransStatus('PENDING');
    }
  }, [project, isOpen, lang]);

  if (!isOpen) return null;

  const handleTranslateManual = async () => {
    const activeText = inputLang === 'ko' ? (nameKo || name) : (nameVi || name);
    if (!activeText.trim()) return;

    setTranslating(true);
    try {
      const targetLang = inputLang === 'ko' ? 'vi' : 'ko';
      const res = await api.translate(activeText, inputLang, targetLang);
      if (inputLang === 'ko') {
        setNameKo(activeText);
        setNameVi(res.translated_text);
      } else {
        setNameVi(activeText);
        setNameKo(res.translated_text);
      }
      setTransStatus('COMPLETED');
    } catch (err: any) {
      alert(err.message || '번역 실패');
      setTransStatus('FAILED');
    } finally {
      setTranslating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) return;

    const primaryName = inputLang === 'ko' ? (nameKo || name) : (nameVi || name);
    if (!primaryName.trim()) return;

    setLoading(true);
    try {
      await onSave({
        name: primaryName.trim(),
        name_ko: nameKo.trim() || (inputLang === 'ko' ? primaryName.trim() : undefined),
        name_vi: nameVi.trim() || (inputLang === 'vi' ? primaryName.trim() : undefined),
        source_language: inputLang,
        start_date: startDate,
        end_date: endDate,
        progress: Number(progress),
        translation_status: transStatus,
      });
      onClose();
    } catch (err: any) {
      alert(err.message || '프로젝트 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden text-slate-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-850">
          <h2 className="text-base font-bold text-white">
            {project ? t('editProject') : t('addProject')}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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

          {/* Primary Name Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              {t('projectInfo')} ({inputLang === 'ko' ? t('koText') : t('viText')}) *
            </label>
            <input
              type="text"
              required
              value={inputLang === 'ko' ? nameKo : nameVi}
              onChange={(e) => {
                if (inputLang === 'ko') setNameKo(e.target.value);
                else setNameVi(e.target.value);
                setName(e.target.value);
              }}
              placeholder="예: BIM 데이터 연동 시스템 개발"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Secondary Name / Manual Translation */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-slate-400">
                {inputLang === 'ko' ? `${t('viText')} 번역문` : `${t('koText')} 번역문`}
              </label>
              <button
                type="button"
                onClick={handleTranslateManual}
                disabled={translating}
                className="text-[11px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${translating ? 'animate-spin' : ''}`} />
                <span>{t('retryTranslation')}</span>
              </button>
            </div>
            <input
              type="text"
              value={inputLang === 'ko' ? nameVi : nameKo}
              onChange={(e) => {
                if (inputLang === 'ko') setNameVi(e.target.value);
                else setNameKo(e.target.value);
                setTransStatus('MANUAL');
              }}
              placeholder="자동 번역문 (필요시 직접 수정 가능)"
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
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">{t('endDate')} *</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
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
              {loading ? '저장 중...' : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

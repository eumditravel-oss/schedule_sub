// src/components/common/LanguageSelector.tsx
import React from 'react';
import { useI18n } from '../../hooks/useI18n';
import { Globe } from 'lucide-react';

export const LanguageSelector: React.FC = () => {
  const { lang, setLanguage } = useI18n();

  return (
    <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-0.5 shadow-sm text-xs shrink-0">
      <Globe className="w-3.5 h-3.5 text-blue-400 ml-1.5 shrink-0" />
      <button
        type="button"
        onClick={() => setLanguage('ko')}
        className={`px-2 py-1 rounded font-bold transition ${
          lang === 'ko'
            ? 'bg-blue-600 text-white shadow'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        한국어
      </button>
      <button
        type="button"
        onClick={() => setLanguage('vi')}
        className={`px-2 py-1 rounded font-bold transition ${
          lang === 'vi'
            ? 'bg-blue-600 text-white shadow'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        Tiếng Việt
      </button>
    </div>
  );
};

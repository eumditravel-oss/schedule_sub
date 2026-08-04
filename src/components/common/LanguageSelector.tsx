// src/components/common/LanguageSelector.tsx
import React from 'react';
import { useI18n } from '../../hooks/useI18n';
import { Globe } from 'lucide-react';

export const LanguageSelector: React.FC = () => {
  const { lang, setLanguage } = useI18n();

  return (
    <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5 text-xs shrink-0">
      <Globe className="w-3.5 h-3.5 text-blue-600 ml-1.5 shrink-0" />
      <button
        type="button"
        onClick={() => setLanguage('ko')}
        className={`px-2.5 py-1 rounded font-bold transition ${
          lang === 'ko'
            ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        한국어
      </button>
      <button
        type="button"
        onClick={() => setLanguage('vi')}
        className={`px-2.5 py-1 rounded font-bold transition ${
          lang === 'vi'
            ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        Tiếng Việt
      </button>
    </div>
  );
};

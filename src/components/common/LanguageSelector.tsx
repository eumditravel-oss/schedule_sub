// src/components/common/LanguageSelector.tsx
import React from 'react';
import { useI18n } from '../../hooks/useI18n';
import { Globe } from 'lucide-react';

export const LanguageSelector: React.FC = () => {
  const { lang, setLanguage, t } = useI18n();

  return (
    <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 p-1 rounded-lg">
      <Globe className="w-3.5 h-3.5 text-blue-600 ml-1 shrink-0" />
      <button
        type="button"
        data-testid="lang-ko-btn"
        onClick={() => setLanguage('ko')}
        className={`h-7 px-2.5 rounded text-xs font-bold transition ${
          lang === 'ko'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
        }`}
      >
        KO
      </button>
      <button
        type="button"
        data-testid="lang-vi-btn"
        onClick={() => setLanguage('vi')}
        className={`h-7 px-2.5 rounded text-xs font-bold transition ${
          lang === 'vi'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
        }`}
      >
        VI
      </button>
    </div>
  );
};

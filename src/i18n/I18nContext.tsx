// src/i18n/I18nContext.tsx
import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { ko, TranslationKeys } from './ko';
import { vi } from './vi';

export type Language = 'ko' | 'vi';

export interface I18nContextType {
  lang: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
}

export const I18nContext = createContext<I18nContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'schedule_ui_language';

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === 'vi' || saved === 'ko') return saved;
    } catch {}
    return 'ko';
  });

  const setLanguage = (newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, newLang);
    } catch {}
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      if (lang === 'vi') {
        document.title = 'Lịch dự án nhóm phát triển | CON-COST × VIETQS';
      } else {
        document.title = '개발팀 프로젝트 스케쥴러 | CON-COST × VIETQS';
      }
    }
  }, [lang]);

  const t = (key: TranslationKeys, params?: Record<string, string | number>): string => {
    const dictionary = lang === 'vi' ? vi : ko;
    let template = dictionary[key] || ko[key] || String(key);

    if (params) {
      Object.entries(params).forEach(([pKey, pValue]) => {
        template = template.replace(new RegExp(`\\{${pKey}\\}`, 'g'), String(pValue));
      });
    }

    return template;
  };

  return (
    <I18nContext.Provider value={{ lang, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

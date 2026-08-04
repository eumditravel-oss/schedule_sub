// src/i18n/I18nContext.tsx
import React, { createContext, useState, useEffect } from 'react';
import { Language, translations, getStoredLanguage, setStoredLanguage } from './index';
import { TranslationKeys } from './ko';
import { ko as dateLocaleKo } from 'date-fns/locale/ko';
import { vi as dateLocaleVi } from 'date-fns/locale/vi';

export interface I18nContextType {
  lang: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKeys, params?: Record<string, string>) => string;
  dateLocale: any;
}

export const I18nContext = createContext<I18nContextType | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => getStoredLanguage());

  const setLanguage = (newLang: Language) => {
    setLangState(newLang);
    setStoredLanguage(newLang);
  };

  const t = (key: TranslationKeys, params?: Record<string, string>): string => {
    let template = translations[lang]?.[key] || translations['ko']?.[key] || key;
    if (params) {
      for (const [pKey, pValue] of Object.entries(params)) {
        template = template.replace(new RegExp(`\\{${pKey}\\}`, 'g'), pValue);
      }
    }
    return template;
  };

  const dateLocale = lang === 'vi' ? dateLocaleVi : dateLocaleKo;

  return (
    <I18nContext.Provider value={{ lang, setLanguage, t, dateLocale }}>
      {children}
    </I18nContext.Provider>
  );
};

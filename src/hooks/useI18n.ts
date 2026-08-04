// src/hooks/useI18n.ts
import { useState, useEffect } from 'react';
import { Language, translations, getStoredLanguage, setStoredLanguage } from '../i18n';
import { TranslationKeys } from '../i18n/ko';
import { ko as dateLocaleKo } from 'date-fns/locale/ko';
import { vi as dateLocaleVi } from 'date-fns/locale/vi';

export function useI18n() {
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

  return {
    lang,
    setLanguage,
    t,
    dateLocale,
  };
}

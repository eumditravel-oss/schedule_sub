// src/hooks/useI18n.ts
import { useContext } from 'react';
import { I18nContext, I18nContextType } from '../i18n/I18nContext';
import { translations, getStoredLanguage, setStoredLanguage } from '../i18n';

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (context) {
    return context;
  }

  // Fallback for standalone/test environments without Provider
  const lang = getStoredLanguage();
  return {
    lang,
    setLanguage: (newLang) => setStoredLanguage(newLang),
    t: (key, params) => {
      let template = translations[lang]?.[key] || translations['ko']?.[key] || String(key);
      if (params) {
        for (const [pKey, pValue] of Object.entries(params)) {
          template = template.replace(new RegExp(`\\{${pKey}\\}`, 'g'), String(pValue));
        }
      }
      return template;
    },
  };
}

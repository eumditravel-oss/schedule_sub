// src/i18n/index.ts
import { ko, TranslationKeys } from './ko';
import { vi } from './vi';

export type Language = 'ko' | 'vi';

export const translations: Record<Language, Record<TranslationKeys, string>> = {
  ko,
  vi,
};

export const LANGUAGE_STORAGE_KEY = 'schedule_ui_language';

export function getStoredLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'ko' || saved === 'vi') return saved;
  } catch {}

  if (typeof navigator !== 'undefined' && navigator.language && navigator.language.toLowerCase().startsWith('vi')) {
    return 'vi';
  }
  return 'ko';
}

export function setStoredLanguage(lang: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {}
}

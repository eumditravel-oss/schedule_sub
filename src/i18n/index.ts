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

export function getLocalizedErrorMessage(err: any, t: (key: TranslationKeys) => string): string {
  const code = err?.code;
  switch (code) {
    case 'INVALID_EDITOR':
      return t('invalidEditorError');
    case 'PROJECT_COMPLETED_READ_ONLY':
      return t('readOnlyCompletedNotice');
    case 'WORKER_LIST_FIXED':
      return t('workerListFixedError');
    case 'TRANSLATION_FAILED':
      return t('translationFailedNotice');
    default:
      return err?.message || t('noData');
  }
}

// src/hooks/useAutoTranslation.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { shouldAutomaticallyTranslate } from '../utils/translationControl';

export type TranslationUiStatus = 'IDLE' | 'PENDING' | 'TRANSLATING' | 'COMPLETED' | 'FAILED' | 'MANUAL';

interface UseAutoTranslationProps {
  sourceText: string;
  sourceLanguage: 'ko' | 'vi';
  initialTargetText?: string;
  initialStatus?: 'PENDING' | 'COMPLETED' | 'FAILED' | 'MANUAL';
  debounceMs?: number;
  autoTranslateEnabled?: boolean;
}

export function useAutoTranslation({
  sourceText,
  sourceLanguage,
  initialTargetText = '',
  initialStatus = 'COMPLETED',
  debounceMs = 700,
  autoTranslateEnabled = true,
}: UseAutoTranslationProps) {
  const [translatedText, setTranslatedText] = useState(initialTargetText);
  const [status, setStatus] = useState<TranslationUiStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);

  const initialSourceRef = useRef(sourceText.trim());
  const requestIdRef = useRef(0);
  const timerRef = useRef<any>(null);

  const targetLanguage: 'ko' | 'vi' = sourceLanguage === 'ko' ? 'vi' : 'ko';
  const isSourceChanged = sourceText.trim() !== initialSourceRef.current;

  const cancelTranslation = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const executeTranslation = useCallback(async (textToTranslate: string, currentReqId: number) => {
    const trimmed = textToTranslate.trim();
    if (!trimmed) {
      if (currentReqId === requestIdRef.current) {
        setTranslatedText('');
        setStatus('IDLE');
      }
      return '';
    }

    try {
      setStatus('TRANSLATING');
      const res = await api.translate(trimmed, sourceLanguage, targetLanguage);
      if (currentReqId === requestIdRef.current) {
        setTranslatedText(res.translated_text || '');
        setStatus('COMPLETED');
        setError(null);
        initialSourceRef.current = trimmed;
        return res.translated_text || '';
      }
    } catch (err: any) {
      if (currentReqId === requestIdRef.current) {
        setTranslatedText(''); // Immediately clear old stale translation!
        setStatus('FAILED');
        setError(err.message || 'Translation failed');
      }
    }
    return '';
  }, [sourceLanguage, targetLanguage]);

  useEffect(() => {
    const trimmedSource = sourceText.trim();
    if (!autoTranslateEnabled) {
      cancelTranslation();
      return;
    }

    if (!trimmedSource) {
      setTranslatedText('');
      setStatus('IDLE');
      initialSourceRef.current = '';
      return;
    }

    if (shouldAutomaticallyTranslate(trimmedSource, initialSourceRef.current, autoTranslateEnabled)) {
      // Source changed: invalidate old target translation immediately!
      setTranslatedText('');
      setStatus('PENDING');
      setError(null);

      cancelTranslation();
      requestIdRef.current += 1;
      const currentReqId = requestIdRef.current;

      timerRef.current = setTimeout(() => {
        executeTranslation(trimmedSource, currentReqId);
      }, debounceMs);
    }

    return () => {
      cancelTranslation();
    };
  }, [sourceText, sourceLanguage, debounceMs, autoTranslateEnabled, cancelTranslation, executeTranslation]);

  const setManualText = (text: string) => {
    cancelTranslation();
    requestIdRef.current += 1;
    setTranslatedText(text);
    setStatus('MANUAL');
    setError(null);
  };

  const translateNow = async (): Promise<string> => {
    cancelTranslation();
    requestIdRef.current += 1;
    return await executeTranslation(sourceText, requestIdRef.current);
  };

  const resetTranslation = useCallback((
    nextSourceText: string,
    nextTargetText = '',
    nextStatus: TranslationUiStatus = 'COMPLETED',
  ) => {
    cancelTranslation();
    requestIdRef.current += 1;
    initialSourceRef.current = nextSourceText.trim();
    setTranslatedText(nextTargetText);
    setStatus(nextSourceText.trim() ? nextStatus : 'IDLE');
    setError(null);
  }, [cancelTranslation]);

  return {
    translatedText,
    status,
    error,
    isSourceChanged,
    setManualText,
    translateNow,
    resetTranslation,
    cancelTranslation,
  };
}

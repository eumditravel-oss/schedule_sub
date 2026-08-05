// src/hooks/useAutoTranslation.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';

export type TranslationUiStatus = 'IDLE' | 'PENDING' | 'TRANSLATING' | 'COMPLETED' | 'FAILED' | 'MANUAL';

interface UseAutoTranslationProps {
  sourceText: string;
  sourceLanguage: 'ko' | 'vi';
  initialTargetText?: string;
  initialStatus?: 'PENDING' | 'COMPLETED' | 'FAILED' | 'MANUAL';
  debounceMs?: number;
}

export function useAutoTranslation({
  sourceText,
  sourceLanguage,
  initialTargetText = '',
  initialStatus = 'COMPLETED',
  debounceMs = 700,
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
    if (!trimmedSource) {
      setTranslatedText('');
      setStatus('IDLE');
      return;
    }

    // Check if source text changed from initial
    if (trimmedSource !== initialSourceRef.current) {
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
  }, [sourceText, sourceLanguage, debounceMs, cancelTranslation, executeTranslation]);

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

  return {
    translatedText,
    status,
    error,
    isSourceChanged,
    setManualText,
    translateNow,
    cancelTranslation,
  };
}

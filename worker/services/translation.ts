// worker/services/translation.ts

export interface TranslationParams {
  text: string;
  sourceLanguage: 'ko' | 'vi';
  targetLanguage: 'ko' | 'vi';
  env: { AI?: any };
}

export interface TranslationResult {
  translatedText: string;
  sourceLanguage: 'ko' | 'vi';
  targetLanguage: 'ko' | 'vi';
  provider: 'cloudflare-workers-ai';
}

export async function translateText({
  text,
  sourceLanguage,
  targetLanguage,
  env,
}: TranslationParams): Promise<TranslationResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      translatedText: '',
      sourceLanguage,
      targetLanguage,
      provider: 'cloudflare-workers-ai',
    };
  }

  // Same language: return immediately
  if (sourceLanguage === targetLanguage) {
    return {
      translatedText: trimmed,
      sourceLanguage,
      targetLanguage,
      provider: 'cloudflare-workers-ai',
    };
  }

  if (!env.AI) {
    throw new Error('Cloudflare Workers AI 바인딩을 찾을 수 없습니다.');
  }

  try {
    const response = await env.AI.run('@cf/meta/m2m100-1.2b', {
      text: trimmed,
      source_lang: sourceLanguage,
      target_lang: targetLanguage,
    });

    const resultStr = response?.translated_text || response?.result?.translated_text || response?.text || '';

    if (!resultStr || typeof resultStr !== 'string') {
      throw new Error('Workers AI 번역 결과가 올바르지 않습니다.');
    }

    return {
      translatedText: resultStr.trim(),
      sourceLanguage,
      targetLanguage,
      provider: 'cloudflare-workers-ai',
    };
  } catch (err: any) {
    console.error('Workers AI Translation Error:', err);
    throw new Error(`Workers AI 번역 실패: ${err.message || '알 수 없는 오류'}`);
  }
}

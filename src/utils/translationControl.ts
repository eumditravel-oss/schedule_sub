export function shouldAutomaticallyTranslate(
  sourceText: string,
  baselineSourceText: string,
  autoTranslateEnabled: boolean,
): boolean {
  const trimmedSource = sourceText.trim();
  return autoTranslateEnabled && Boolean(trimmedSource) && trimmedSource !== baselineSourceText.trim();
}

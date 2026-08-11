export function getAdaptiveColumnPercent(
  labels: Array<string | null | undefined>,
  minPercent: number,
  maxPercent: number
): number {
  const longest = labels.reduce<number>((max, label) => {
    const length = Array.from((label || '').trim()).length;
    return Math.max(max, length);
  }, 0);

  const estimated = minPercent + Math.max(0, longest - 12) * 0.32;
  return Math.round(Math.min(maxPercent, Math.max(minPercent, estimated)) * 10) / 10;
}

export function getRemainingColumnPercent(usedPercent: number, minimum = 1): number {
  return Math.max(minimum, Math.round((100 - usedPercent) * 10) / 10);
}

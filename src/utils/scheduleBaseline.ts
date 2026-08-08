// src/utils/scheduleBaseline.ts

export function calculateDateVarianceDays(
  baselineDate?: string | null,
  currentDate?: string | null
): number {
  if (!baselineDate || !currentDate) return 0;
  const baseMs = new Date(`${baselineDate}T00:00:00Z`).getTime();
  const currMs = new Date(`${currentDate}T00:00:00Z`).getTime();
  if (isNaN(baseMs) || isNaN(currMs)) return 0;

  const diffMs = currMs - baseMs;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function formatVarianceBadgeText(
  diffDays: number,
  lang: 'ko' | 'vi' = 'ko'
): { text: string; colorClass: string } {
  if (diffDays === 0) {
    return {
      text: lang === 'vi' ? 'Đúng tiến độ' : '기준 동일',
      colorClass: 'bg-slate-100 text-slate-700 border-slate-200',
    };
  } else if (diffDays > 0) {
    return {
      text: lang === 'vi' ? `Trễ +${diffDays} ngày` : `기준 대비 +${diffDays}일`,
      colorClass: 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold',
    };
  } else {
    return {
      text: lang === 'vi' ? `Sớm ${diffDays} ngày` : `기준 대비 ${diffDays}일`,
      colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-extrabold',
    };
  }
}

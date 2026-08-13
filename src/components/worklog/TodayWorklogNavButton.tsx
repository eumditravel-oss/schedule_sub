import React, { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { Worker } from '../../types';
import { api } from '../../services/api';

interface TodayWorklogNavButtonProps {
  worker: Worker | null;
  language: 'ko' | 'vi';
  onOpen: () => void;
  compact?: boolean;
}

function dateForWorker(worker: Worker | null) {
  const timeZone = worker?.country_code === 'VN' ? 'Asia/Ho_Chi_Minh' : 'Asia/Seoul';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '01';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function label(status: string | null, language: 'ko' | 'vi') {
  if (status === 'EOD_SUBMITTED' || status === 'SELF_REVISED' || status === 'MANAGER_CORRECTED') return language === 'vi' ? 'Hoàn tất' : '완료';
  if (status === 'MORNING_SUBMITTED') return language === 'vi' ? 'Cần chốt' : '마감 필요';
  if (status === 'RETROACTIVE_PENDING_REVIEW' || status === 'CORRECTION_REQUESTED') return language === 'vi' ? 'Chờ xác nhận' : '확인 필요';
  return language === 'vi' ? 'Chưa tạo' : '미작성';
}

export function TodayWorklogNavButton({ worker, language, onOpen, compact = false }: TodayWorklogNavButtonProps) {
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!worker?.id) { setStatus(null); return; }
    const controller = new AbortController();
    void api.getWorklogContext(worker.id, dateForWorker(worker), controller.signal)
      .then((context) => { if (!controller.signal.aborted) setStatus(context?.worklog?.status || 'NOT_CREATED'); })
      .catch(() => { if (!controller.signal.aborted) setStatus(null); });
    return () => controller.abort();
  }, [worker?.id, worker?.country_code]);

  const title = language === 'vi' ? 'Nhật ký công việc hôm nay' : '오늘 업무일지';
  const tone = status === 'MORNING_SUBMITTED' ? 'border-blue-200 bg-blue-50 text-blue-800' : status === 'EOD_SUBMITTED' || status === 'SELF_REVISED' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <button type="button" data-testid="today-worklog-nav-btn" onClick={onOpen} title={title} className={`h-8 rounded-lg border px-2.5 font-bold text-xs flex items-center gap-1.5 transition shadow-2xs shrink-0 whitespace-nowrap ${tone}`}>
      <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
      {!compact && <span>{language === 'vi' ? 'Nhật ký hôm nay' : '오늘 업무일지'}</span>}
      <span className="rounded border border-current/20 bg-white/60 px-1.5 py-0.5 text-[10px] font-extrabold">{label(status, language)}</span>
    </button>
  );
}

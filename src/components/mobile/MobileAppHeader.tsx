// src/components/mobile/MobileAppHeader.tsx
import React, { useState } from 'react';
import { Worker, isExecutiveViewer, isEditableWorker, getWorkerColorGroup } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { ArrowLeft, User, Calendar, Lock, ClipboardCheck, LayoutDashboard } from 'lucide-react';
import { canShowDashboardNavigation } from '../../utils/roleLanding';

interface MobileAppHeaderProps {
  title?: string;
  isDetailPage?: boolean;
  onBack?: () => void;
  currentWorker: Worker | null;
  onOpenCalendarModal?: () => void;
  onOpenWorklog?: () => void;
  onOpenDashboard?: () => void;
}

export const MobileAppHeader: React.FC<MobileAppHeaderProps> = ({
  title,
  isDetailPage = false,
  onBack,
  currentWorker,
  onOpenCalendarModal,
  onOpenWorklog,
  onOpenDashboard,
}) => {
  const { t, lang } = useI18n();
  const [logoSrc, setLogoSrc] = useState('/logo3-mobile-tight.png');

  const isViewer = isExecutiveViewer(currentWorker);
  const isEditor = isEditableWorker(currentWorker);
  const canOpenDashboard = canShowDashboardNavigation(currentWorker) && Boolean(onOpenDashboard);

  const getWorkerBtnStyles = () => {
    if (!currentWorker) return 'bg-slate-100 border-slate-200 text-slate-600';
    const group = getWorkerColorGroup(currentWorker);
    switch (group) {
      case 'EXECUTIVE':
        return 'bg-red-50 border-red-200 text-red-700';
      case 'KOREAN_STAFF':
        return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      case 'VIETNAMESE_STAFF':
        return 'bg-amber-50 border-amber-200 text-amber-800';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-700';
    }
  };

  return (
    <header
      className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs shrink-0 h-14 pt-[env(safe-area-inset-top)]"
      style={{ paddingLeft: 'max(12px, env(safe-area-inset-left))', paddingRight: 'max(12px, env(safe-area-inset-right))' }}
    >
      {/* 3-column grid: logo | title | right-controls */}
      <div className="h-full grid items-center" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: '8px' }}>

        {/* ── Left: Logo or Back+Logo ── */}
        <div
          data-testid="mobile-header-logo-area"
          className="flex items-center gap-1.5 overflow-visible"
        >
          {isDetailPage && (
            <button
              type="button"
              data-testid="mobile-back-btn"
              onClick={onBack}
              aria-label={t('backToList')}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <img
            data-testid="mobile-header-logo"
            src={logoSrc}
            onError={() => {
              if (logoSrc !== '/logo3-mobile-cropped.png') setLogoSrc('/logo3-mobile-cropped.png');
            }}
            alt="CON-COST × VIETQS"
            className="
              block
              w-auto
              object-contain
              object-left-center
              shrink-0
              h-8
              min-[344px]:h-[34px]
              min-[360px]:h-9
              max-[1023px]:max-h-[38px]
              max-w-[88px]
              min-[344px]:max-w-[96px]
              min-[360px]:max-w-[104px]
              min-[390px]:max-w-[112px]
            "
          />
        </div>

        {/* ── Center: Title ── */}
        <div
          data-testid="mobile-header-title"
          className="flex items-center justify-center overflow-hidden"
        >
          {title ? (
            <span className="text-xs font-bold text-slate-900 truncate text-center">
              {title}
            </span>
          ) : (
            <span
              className={`font-bold text-slate-900 truncate text-center leading-tight ${
                lang === 'vi' ? 'text-[11px]' : 'text-[13px] min-[360px]:text-sm'
              }`}
            >
              {t('appTitle')}
            </span>
          )}
        </div>

        {/* ── Right Controls ── */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Read-only Badge for Executive Viewers */}
          {isViewer && (
            <div
              data-testid="viewer-readonly-badge"
              className="h-8 px-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-[10px] font-extrabold flex items-center gap-1 shrink-0"
            >
              <Lock className="w-3 h-3 text-red-600" />
              <span>{lang === 'vi' ? 'Chỉ xem' : '보기 전용'}</span>
            </div>
          )}

          {/* Calendar Management Button - EDITOR only */}
          {isEditor && onOpenCalendarModal && (
            <button
              type="button"
              data-testid="mobile-manage-holidays-btn"
              onClick={onOpenCalendarModal}
              aria-label={t('manageHolidays')}
              className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-slate-700 transition"
            >
              <Calendar className="w-4 h-4 text-blue-600" />
            </button>
          )}

          {onOpenWorklog && (
            <button
              type="button"
              data-testid="mobile-today-worklog-btn"
              onClick={onOpenWorklog}
              aria-label={lang === 'vi' ? 'Nhật ký công việc hôm nay' : '오늘 업무일지'}
              className="w-8 h-8 flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-emerald-700 transition"
            >
              <ClipboardCheck className="w-4 h-4" />
            </button>
          )}

          {canOpenDashboard && (
            <button
              type="button"
              data-testid="mobile-dashboard-nav-btn"
              onClick={onOpenDashboard}
              aria-label="Dashboard"
              className="w-8 h-8 flex items-center justify-center bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-blue-700 transition"
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
          )}

          {/* Session identity is display-only. Switching employees requires a
              new authenticated session and is never a local UI action. */}
          <span
            data-testid="mobile-session-actor"
            className={`h-8 px-2.5 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 max-w-[115px] ${getWorkerBtnStyles()}`}
          >
            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
              isViewer
                ? 'bg-red-600 text-white'
                : currentWorker && getWorkerColorGroup(currentWorker) === 'KOREAN_STAFF'
                ? 'bg-emerald-600 text-white'
                : currentWorker
                ? 'bg-amber-500 text-white'
                : 'bg-slate-300 text-slate-700'
            }`}>
              {currentWorker ? currentWorker.name[0] : <User className="w-2.5 h-2.5" />}
            </div>
            <span className="truncate">{currentWorker ? currentWorker.name : t('selectWorker')}</span>
          </span>
        </div>
      </div>
    </header>
  );
};

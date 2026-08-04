// src/components/mobile/MobileAppHeader.tsx
import React from 'react';
import { useI18n } from '../../hooks/useI18n';
import { ArrowLeft, Globe, User } from 'lucide-react';

interface MobileAppHeaderProps {
  title?: string;
  isDetailPage?: boolean;
  onBack?: () => void;
  currentWorker: string;
  onOpenWorkerSheet: () => void;
}

export const MobileAppHeader: React.FC<MobileAppHeaderProps> = ({
  title,
  isDetailPage = false,
  onBack,
  currentWorker,
  onOpenWorkerSheet,
}) => {
  const { t, lang, setLanguage } = useI18n();

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-3 h-14 flex items-center justify-between gap-2 shadow-xs shrink-0 pt-[env(safe-area-inset-top)]">
      {/* Left: Back button + Compact Logo / Title */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {isDetailPage ? (
          <button
            type="button"
            data-testid="mobile-back-btn"
            onClick={onBack}
            aria-label={t('backToList')}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        ) : null}

        <div className="flex items-center gap-2 min-w-0">
          <img src="/logo3.png" alt="CON-COST × VIETQS" className="h-7 object-contain shrink-0 max-w-[125px]" />
          {title && (
            <span className="text-xs font-bold text-slate-900 truncate min-w-0">
              {title}
            </span>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Compact Lang Switcher */}
        <button
          type="button"
          data-testid="mobile-lang-btn"
          onClick={() => setLanguage(lang === 'ko' ? 'vi' : 'ko')}
          aria-label={t('inputLanguage')}
          className="h-8 px-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1 transition"
        >
          <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>{lang === 'ko' ? 'KO' : 'VI'}</span>
        </button>

        {/* Compact Worker Switcher */}
        <button
          type="button"
          data-testid="mobile-worker-btn"
          onClick={onOpenWorkerSheet}
          aria-label={t('selectWorkerTitle')}
          className={`h-8 px-2.5 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 max-w-[110px] ${
            currentWorker
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : 'bg-slate-100 border-slate-200 text-slate-600'
          }`}
        >
          <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
            currentWorker ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-700'
          }`}>
            {currentWorker ? currentWorker[0] : <User className="w-2.5 h-2.5" />}
          </div>
          <span className="truncate">{currentWorker || t('selectWorker')}</span>
        </button>
      </div>
    </header>
  );
};

// src/components/modals/StatusPopover.tsx
import React, { useEffect, useRef } from 'react';
import { DailyStatusType } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { Check } from 'lucide-react';

interface StatusPopoverProps {
  isOpen: boolean;
  position: { x: number; y: number } | null;
  triggerRect: DOMRect | null;
  currentStatus: DailyStatusType;
  dateStr: string;
  onSelect: (status: DailyStatusType) => void;
  onClose: () => void;
}

export const StatusPopover: React.FC<StatusPopoverProps> = ({
  isOpen,
  position,
  triggerRect,
  currentStatus,
  dateStr,
  onSelect,
  onClose,
}) => {
  const { t } = useI18n();
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !position) return null;

  const statusOptions: { type: DailyStatusType; label: string; colorClass: string }[] = [
    { type: 'NONE', label: t('statusNone'), colorClass: 'bg-slate-100 text-slate-700 hover:bg-slate-200' },
    { type: 'IN_PROGRESS', label: t('statusInProgress'), colorClass: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
    { type: 'COMPLETED', label: t('statusCompleted'), colorClass: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
    { type: 'ISSUE', label: t('statusIssue'), colorClass: 'bg-amber-50 text-amber-800 hover:bg-amber-100' },
  ];

  // Viewport bounds calculation to prevent popover clipping at edges
  const popoverWidth = 176; // w-44 = 11rem = 176px
  const popoverHeight = 170;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let leftPos = position.x - popoverWidth / 2;
  let topPos = position.y + 6;

  // Horizontal clamp
  if (leftPos < 8) leftPos = 8;
  if (leftPos + popoverWidth > viewportWidth - 8) leftPos = viewportWidth - popoverWidth - 8;

  // Vertical flip if clipping at bottom
  if (topPos + popoverHeight > viewportHeight - 8 && triggerRect) {
    topPos = triggerRect.top - popoverHeight - 6;
  }

  return (
    <div
      ref={popoverRef}
      data-testid="status-popover"
      style={{ top: `${topPos}px`, left: `${leftPos}px` }}
      className="fixed z-50 w-44 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-100 text-slate-900"
    >
      <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1 flex items-center justify-between">
        <span>{dateStr}</span>
        <span className="text-[10px] text-blue-600 font-semibold">{t('selectStatusTitle')}</span>
      </div>

      <div className="space-y-1">
        {statusOptions.map((opt) => {
          const isSelected = currentStatus === opt.type;
          return (
            <button
              key={opt.type}
              type="button"
              data-testid={`status-option-${opt.type}`}
              onClick={() => {
                onSelect(opt.type);
                onClose();
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-between ${
                opt.colorClass
              } ${isSelected ? 'ring-1 ring-blue-500' : ''}`}
            >
              <span>{opt.label}</span>
              {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

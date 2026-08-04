// src/components/modals/StatusPopover.tsx
import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { DailyStatusType } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { calculatePopoverPosition } from '../../utils/popoverPosition';
import { Check, AlertTriangle, Clock, Circle } from 'lucide-react';

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
  triggerRect,
  currentStatus,
  dateStr,
  onSelect,
  onClose,
}) => {
  const { t } = useI18n();
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen, onClose]);

  if (!isOpen || !triggerRect) return null;

  const { left, top } = calculatePopoverPosition(
    triggerRect,
    { width: 208, height: 180 },
    { width: window.innerWidth, height: window.innerHeight }
  );

  const statuses: Array<{ type: DailyStatusType; label: string; icon: React.ReactNode; colorClass: string }> = [
    { type: 'NONE', label: t('statusNone'), icon: <Circle className="w-3.5 h-3.5 text-slate-400" />, colorClass: 'hover:bg-slate-100 text-slate-700' },
    { type: 'IN_PROGRESS', label: t('statusInProgress'), icon: <Clock className="w-3.5 h-3.5 text-blue-600" />, colorClass: 'hover:bg-blue-50 text-blue-700 font-semibold' },
    { type: 'COMPLETED', label: t('statusCompleted'), icon: <Check className="w-3.5 h-3.5 text-emerald-600" />, colorClass: 'hover:bg-emerald-50 text-emerald-700 font-semibold' },
    { type: 'ISSUE', label: t('statusIssue'), icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />, colorClass: 'hover:bg-amber-50 text-amber-700 font-semibold' },
  ];

  return ReactDOM.createPortal(
    <div
      ref={popoverRef}
      style={{ left: `${left}px`, top: `${top}px` }}
      className="fixed z-50 w-52 bg-white border border-slate-200 rounded-xl shadow-xl p-2 text-slate-800"
    >
      <div className="px-2 py-1 text-[11px] font-semibold text-slate-500 border-b border-slate-100 mb-1 flex justify-between">
        <span>{dateStr}</span>
        <span>상태 변경</span>
      </div>

      <div className="space-y-1">
        {statuses.map((s) => {
          const isSelected = currentStatus === s.type;
          return (
            <button
              key={s.type}
              type="button"
              onClick={() => {
                onSelect(s.type);
                onClose();
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${s.colorClass} ${
                isSelected ? 'bg-slate-100 font-bold border border-slate-200' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                {s.icon}
                <span>{s.label}</span>
              </div>
              {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
};

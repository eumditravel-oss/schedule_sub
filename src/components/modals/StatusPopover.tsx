// src/components/modals/StatusPopover.tsx
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DailyStatusType } from '../../types';
import { calculatePopoverPosition } from '../../utils/popoverPosition';
import { Check, X, AlertTriangle, Clock, Circle } from 'lucide-react';

interface StatusPopoverProps {
  isOpen: boolean;
  position: { x: number; y: number } | null;
  triggerRect?: DOMRect | null;
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
  const popoverRef = useRef<HTMLDivElement>(null);
  const [computedPos, setComputedPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const pWidth = 192; // 12rem (w-48)
      const pHeight = 220;

      if (triggerRect) {
        const pos = calculatePopoverPosition(
          {
            top: triggerRect.top,
            bottom: triggerRect.bottom,
            left: triggerRect.left,
            right: triggerRect.right,
            width: triggerRect.width,
            height: triggerRect.height,
          },
          { width: pWidth, height: pHeight }
        );
        setComputedPos({ top: pos.top, left: pos.left });
      } else if (position) {
        // Fallback using center x, y
        const fakeRect = {
          top: position.y - 20,
          bottom: position.y,
          left: position.x - 18,
          right: position.x + 18,
          width: 36,
          height: 36,
        };
        const pos = calculatePopoverPosition(fakeRect, { width: pWidth, height: pHeight });
        setComputedPos({ top: pos.top, left: pos.left });
      }
    };

    updatePosition();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleScrollOrResize = () => {
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, position, triggerRect]);

  if (!isOpen) return null;

  const statusOptions: Array<{ type: DailyStatusType; label: string; icon: React.ReactNode; colorClass: string }> = [
    { type: 'NONE', label: '미작업 (기본)', icon: <Circle className="w-3.5 h-3.5" />, colorClass: 'text-slate-400' },
    { type: 'IN_PROGRESS', label: '작업 중', icon: <Clock className="w-3.5 h-3.5 text-blue-400" />, colorClass: 'text-blue-400 font-bold' },
    { type: 'COMPLETED', label: '완료', icon: <Check className="w-3.5 h-3.5 text-emerald-400" />, colorClass: 'text-emerald-400 font-bold' },
    { type: 'ISSUE', label: '문제 발생', icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />, colorClass: 'text-amber-400 font-bold' },
  ];

  const content = (
    <div
      ref={popoverRef}
      style={{ top: `${computedPos.top}px`, left: `${computedPos.left}px` }}
      className="fixed z-50 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden p-2 text-slate-100 animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="flex items-center justify-between px-2 py-1 border-b border-slate-700/80 mb-1">
        <span className="text-[11px] font-bold text-slate-300">{dateStr} 상태 변경</span>
        <button onClick={onClose} className="p-0.5 rounded text-slate-400 hover:text-white">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1">
        {statusOptions.map((opt) => {
          const isSelected = currentStatus === opt.type;
          return (
            <button
              key={opt.type}
              type="button"
              onClick={() => {
                onSelect(opt.type);
                onClose();
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${
                isSelected ? 'bg-slate-700 font-bold text-white shadow-inner' : 'hover:bg-slate-700/50 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {opt.icon}
                <span className={opt.colorClass}>{opt.label}</span>
              </div>
              {isSelected && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
};

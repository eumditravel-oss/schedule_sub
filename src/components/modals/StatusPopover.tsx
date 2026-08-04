// src/components/modals/StatusPopover.tsx
import React from 'react';
import { DailyStatusType } from '../../types';

interface StatusPopoverProps {
  isOpen: boolean;
  position: { x: number; y: number } | null;
  currentStatus: DailyStatusType;
  dateStr: string;
  onSelect: (status: DailyStatusType) => void;
  onClose: () => void;
}

export const StatusPopover: React.FC<StatusPopoverProps> = ({
  isOpen,
  position,
  currentStatus,
  dateStr,
  onSelect,
  onClose,
}) => {
  if (!isOpen || !position) return null;

  const options: Array<{ status: DailyStatusType; label: string; bg: string; dot: string }> = [
    { status: 'NONE', label: '미작업', bg: 'hover:bg-slate-700', dot: 'bg-slate-500' },
    { status: 'IN_PROGRESS', label: '작업 중', bg: 'hover:bg-blue-900/50', dot: 'bg-blue-500' },
    { status: 'COMPLETED', label: '완료', bg: 'hover:bg-emerald-900/50', dot: 'bg-emerald-500' },
    { status: 'ISSUE', label: '문제 발생', bg: 'hover:bg-amber-900/50', dot: 'bg-amber-500' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Popover Card */}
      <div
        style={{ top: position.y, left: position.x }}
        className="fixed z-50 transform -translate-x-1/2 mt-2 w-44 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden p-1 text-slate-200"
      >
        <div className="px-3 py-1.5 border-b border-slate-700/60 mb-1 text-[11px] font-semibold text-slate-400">
          날짜: {dateStr}
        </div>
        <div className="space-y-0.5">
          {options.map((opt) => {
            const isSelected = currentStatus === opt.status;
            return (
              <button
                key={opt.status}
                onClick={() => {
                  onSelect(opt.status);
                  onClose();
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition ${opt.bg} ${
                  isSelected ? 'bg-slate-700/80 text-white font-bold' : 'text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${opt.dot}`} />
                  <span>{opt.label}</span>
                </div>
                {isSelected && <span className="text-blue-400 text-xs">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};

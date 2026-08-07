// src/components/modals/ModalShell.tsx
import React from 'react';
import { X } from 'lucide-react';

export interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  errorMsg?: React.ReactNode;
  maxWidthClass?: string; // e.g. "max-w-xl", "max-w-2xl"
  testId?: string;
  headerTestId?: string;
  bodyTestId?: string;
  footerTestId?: string;
  closeBtnTestId?: string;
  headerClassName?: string;
}

export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  errorMsg,
  maxWidthClass = 'max-w-xl',
  testId,
  headerTestId,
  bodyTestId,
  footerTestId,
  closeBtnTestId,
  headerClassName = 'bg-slate-900 text-white border-b border-slate-800',
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs select-none overflow-hidden"
    >
      <div
        data-testid={testId}
        className={`w-full ${maxWidthClass} max-h-[calc(100dvh-24px)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden my-auto`}
      >
        {/* Persistent Header */}
        <header
          data-testid={headerTestId}
          className={`shrink-0 px-6 py-4 flex items-center justify-between ${headerClassName}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            <div className="min-w-0 truncate">
              <h3 className="font-bold text-base truncate">{title}</h3>
              {subtitle && <p className="text-xs text-slate-400 font-medium truncate">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            data-testid={closeBtnTestId || (testId ? `${testId}-close-btn` : undefined)}
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Scrollable Body Container */}
        <div
          data-testid={bodyTestId}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 space-y-4 text-xs"
        >
          {children}
        </div>

        {/* Persistent Error Banner */}
        {errorMsg && (
          <div className="shrink-0 px-6 py-2.5 bg-red-50 border-t border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
            {errorMsg}
          </div>
        )}

        {/* Persistent Footer */}
        {footer && (
          <footer
            data-testid={footerTestId}
            className="shrink-0 px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-end gap-3 shadow-xs"
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};

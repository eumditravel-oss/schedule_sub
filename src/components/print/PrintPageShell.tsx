// src/components/print/PrintPageShell.tsx
import React from 'react';
import { PrintColorMode } from '../../utils/printVisualTokens';

export interface PrintPageShellProps {
  paper: 'a4' | 'a3';
  orientation: 'portrait' | 'landscape';
  colorMode: PrintColorMode;
  children: React.ReactNode;
  pageNumber?: number;
  totalPages?: number;
  className?: string;
}

export const PrintPageShell: React.FC<PrintPageShellProps> = ({
  paper,
  orientation,
  colorMode,
  children,
  className = '',
}) => {
  // Compute container dimensions for preview mode
  const paperClass = paper === 'a3' ? 'print-paper-a3' : 'print-paper-a4';
  const orientClass = orientation === 'landscape' ? 'print-landscape' : 'print-portrait';
  const modeClass = colorMode === 'mono' ? 'print-mode-mono' : 'print-mode-color';

  return (
    <div
      className={`print-page-shell ${paperClass} ${orientClass} ${modeClass} mx-auto bg-white shadow-xl border border-slate-300 print:shadow-none print:border-none print:m-0 print:p-0 font-sans text-slate-900 ${className}`}
      style={{
        boxSizing: 'border-box',
      }}
    >
      <div className="print-page-content w-full h-full flex flex-col justify-between p-4 print:p-0">
        {children}
      </div>
    </div>
  );
};

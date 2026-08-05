// src/components/common/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, List, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackViewName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCode: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorCode: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    const code = `ERR_${Date.now().toString(36).toUpperCase().slice(-5)}`;
    return { hasError: true, error, errorCode: code };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled React Error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorCode: '' });
  };

  private handleGoToProjects = () => {
    window.location.href = '/projects';
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const isVi = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().includes('vi');
      const viewName = this.props.fallbackViewName || 'Schedule Scheduler View';
      const commitSha = import.meta.env.VITE_BUILD_SHA || 'unknown';

      return (
        <div
          data-testid="app-error-boundary"
          className="min-h-screen bg-slate-100 flex items-center justify-center p-4 text-slate-900 font-sans"
        >
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-rose-200 text-center space-y-4 animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-300 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h2 className="font-extrabold text-base text-slate-900 leading-tight">
                {isVi
                  ? 'Đã xảy ra lỗi khi tải màn hình lịch trình.'
                  : '일정 화면을 불러오는 중 오류가 발생했습니다.'}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {isVi
                  ? 'Hệ thống đã tự động ghi lại lỗi này. Vui lòng thử lại hoặc tải lại trang.'
                  : '시스템이 오류를 감지했습니다. 다시 시도하거나 페이지를 새로고침하세요.'}
              </p>
            </div>

            {/* Error Metadata Box */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left text-[11px] font-mono space-y-1 text-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold">Error Code:</span>
                <span className="font-extrabold text-rose-700">{this.state.errorCode}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold">Build SHA:</span>
                <span className="font-bold text-slate-800">{commitSha}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold">Location:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[200px]">{viewName}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                data-testid="error-retry-btn"
                onClick={this.handleRetry}
                className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 shadow-xs transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isVi ? 'Thử lại' : '다시 시도'}</span>
              </button>

              <button
                type="button"
                data-testid="error-project-list-btn"
                onClick={this.handleGoToProjects}
                className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 shadow-2xs transition"
              >
                <List className="w-3.5 h-3.5" />
                <span>{isVi ? 'Danh sách' : '목록으로'}</span>
              </button>

              <button
                type="button"
                data-testid="error-reload-btn"
                onClick={this.handleReload}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 shadow-xs transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isVi ? 'Tải lại' : '새로고침'}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// src/components/modals/OverdueTaskDetailModal.tsx
import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, Calendar, User, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';
import { api } from '../../services/api';

export interface OverdueTaskDetailItem {
  task_id: string;
  task_name: string;
  project_id: string;
  project_name: string;
  primary_worker_id: string;
  worker_name: string;
  start_date: string;
  end_date: string;
  business_date: string;
  days_overdue: number;
  progress_mode: string;
  actual_progress: number;
  completion_confirmed: number;
  judgement_reason: string;
}

interface OverdueTaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  date?: string;
  tasks?: OverdueTaskDetailItem[];
  onNavigateToTask?: (projectId: string, taskId: string) => void;
}

export const OverdueTaskDetailModal: React.FC<OverdueTaskDetailModalProps> = ({
  isOpen,
  onClose,
  date,
  tasks,
  onNavigateToTask,
}) => {
  const { lang } = useI18n();
  const isVi = lang === 'vi';

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<OverdueTaskDetailItem[]>(tasks || []);

  useEffect(() => {
    if (isOpen) {
      if (tasks && tasks.length > 0) {
        setItems(tasks);
      } else {
        setLoading(true);
        const targetDate = date || new Date().toISOString().substring(0, 10);
        api
          .getOverdueDetails(targetDate)
          .then((res: any) => {
            setItems(res.overdue_tasks || res.items || []);
          })
          .catch((err) => {
            console.error('Failed to fetch overdue details:', err);
            setItems([]);
          })
          .finally(() => setLoading(false));
      }
    }
  }, [isOpen, date, tasks]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-hidden">
      <div
        data-testid="overdue-task-detail-modal"
        className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150 my-auto overflow-hidden"
      >
        {/* Header */}
        <header className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-amber-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">
                {isVi ? 'Chi tiết công việc quá hạn' : '기한 경과 작업 상세'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {isVi ? `Tổng số: ${items.length} công việc` : `전체 ${items.length}건의 기한 경과 작업`}
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="overdue-modal-close-btn"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="py-12 text-center text-slate-500 font-medium">
              {isVi ? 'Đang tải dữ liệu...' : '데이터를 불러오는 중입니다...'}
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-slate-500 font-medium">
              {isVi ? 'Không có công việc quá hạn' : '기한 경과 작업이 없습니다.'}
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.task_id}
                data-testid={`overdue-task-item-${item.task_id}`}
                className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 hover:border-amber-300 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded">
                      {item.project_name}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm mt-1">{item.task_name}</h4>
                  </div>
                  {onNavigateToTask && (
                    <button
                      type="button"
                      data-testid={`overdue-view-task-btn-${item.task_id}`}
                      onClick={() => {
                        onClose();
                        onNavigateToTask(item.project_id, item.task_id);
                      }}
                      className="shrink-0 text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
                    >
                      {isVi ? 'Xem 작업' : '이동'}
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] bg-white p-3 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-400 block">{isVi ? 'Người phụ trách (PIC)' : '주 담당자 (PIC)'}</span>
                    <span className="font-semibold text-slate-800">{item.worker_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isVi ? 'Thời gian' : '계획 일정'}</span>
                    <span className="font-semibold text-slate-800">
                      {item.start_date} ~ {item.end_date}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isVi ? 'Số ngày quá hạn' : '경과일'}</span>
                    <span className="font-bold text-rose-600">{item.days_overdue}일 경과</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isVi ? 'Phương thức tiến độ' : '진행 방식'}</span>
                    <span className="font-semibold text-slate-800">{item.progress_mode}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isVi ? 'Tiến độ thực tế' : '실제 공정률'}</span>
                    <span className="font-bold text-amber-700">{item.actual_progress}%</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isVi ? 'Xác nhận hoàn thành' : '완료 확정'}</span>
                    <span className="font-semibold text-slate-700">
                      {item.completion_confirmed === 1 ? '완료 확정됨' : '미확정'}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-amber-900 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200/60 font-medium">
                  <span className="font-bold text-amber-900 mr-1">판정 이유:</span>
                  {item.judgement_reason}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <footer className="shrink-0 px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            type="button"
            data-testid="overdue-modal-confirm-btn"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition"
          >
            {isVi ? 'Đóng' : '확인'}
          </button>
        </footer>
      </div>
    </div>
  );
};

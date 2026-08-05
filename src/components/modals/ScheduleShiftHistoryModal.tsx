// src/components/modals/ScheduleShiftHistoryModal.tsx
import React, { useEffect, useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import { api } from '../../services/api';
import { X, History, ArrowRight, Calendar, User, Clock } from 'lucide-react';

interface ScheduleShiftHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export const ScheduleShiftHistoryModal: React.FC<ScheduleShiftHistoryModalProps> = ({
  isOpen,
  onClose,
  projectId,
}) => {
  const { lang } = useI18n();
  const [loading, setLoading] = useState(false);
  const [projectLogs, setProjectLogs] = useState<any[]>([]);
  const [leaveLogs, setLeaveLogs] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && projectId) {
      setLoading(true);
      api.getProjectShiftLogs(projectId)
        .then((data) => {
          setProjectLogs(data.project_shift_logs || []);
          setLeaveLogs(data.leave_shift_logs || []);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        data-testid="schedule-shift-history-modal"
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-900 overflow-hidden text-xs flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600 shrink-0" />
            <h3 className="font-extrabold text-slate-900 text-sm">
              {lang === 'vi' ? 'Lịch sử thay đổi lịch trình' : '일정 변경 이력 기록'}
            </h3>
          </div>
          <button
            type="button"
            data-testid="shift-history-close-btn"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {loading ? (
            <div className="py-8 text-center text-slate-500 font-medium">
              {lang === 'vi' ? 'Đang tải lịch sử...' : '이력을 불러오는 중입니다...'}
            </div>
          ) : projectLogs.length === 0 && leaveLogs.length === 0 ? (
            <div className="py-8 text-center text-slate-500 font-medium bg-slate-50 rounded-xl border border-slate-200">
              {lang === 'vi' ? 'Chưa có lịch sử thay đổi lịch trình nào.' : '일정 변경 이력이 기록되지 않았습니다.'}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Project Level Shift Logs */}
              {projectLogs.map((log) => (
                <div key={log.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-blue-900 bg-blue-100 px-2 py-0.5 rounded text-[10px]">
                      {lang === 'vi' ? 'Thay đổi ngày dự án' : '프로젝트 일괄 이동'}
                    </span>
                    <span className="text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {log.created_at || '방금 전'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-bold text-slate-800 text-[11px]">
                    <span>{log.old_start_date} ~ {log.old_end_date}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-blue-700">{log.new_start_date} ~ {log.new_end_date}</span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-600 border-t border-slate-200/60 pt-1.5 font-medium">
                    <span>이동 일수: {log.delta_days}일 ({log.shifted_task_count}개 작업 영향)</span>
                    <span className="flex items-center gap-1 font-bold text-slate-700">
                      <User className="w-3 h-3 text-slate-400" />
                      {log.changed_by_name || '시스템'}
                    </span>
                  </div>
                </div>
              ))}

              {/* Leave Shift Logs */}
              {leaveLogs.map((log) => (
                <div key={log.id} className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-purple-900 bg-purple-100 px-2 py-0.5 rounded text-[10px]">
                      {lang === 'vi' ? 'Nghỉ phép 이연' : '휴가로 인한 작업 이연'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {log.created_at || '방금 전'}
                    </span>
                  </div>

                  <div className="font-extrabold text-slate-900 text-xs">
                    {log.task_name || '작업'}
                  </div>

                  <div className="flex items-center gap-2 font-bold text-slate-800 text-[11px]">
                    <span>{log.old_start_date} ~ {log.old_end_date}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-purple-700">{log.new_start_date} ~ {log.new_end_date}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-8 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition"
          >
            {lang === 'vi' ? 'Đóng' : '닫기'}
          </button>
        </div>
      </div>
    </div>
  );
};

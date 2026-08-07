// src/components/modals/DayActionPanel.tsx
import React, { useState } from 'react';
import { Task, Worker, CountryHoliday, CalendarOverride, DailyStatusType, WorkDayStatus, isExecutiveViewer } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { X, Calendar, CheckCircle2, Clock, AlertTriangle, ShieldAlert, Info, Trash2 } from 'lucide-react';

export interface DayActionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
  dateStr: string;
  worker: Worker | null;
  currentWorker: Worker | null;
  dayStatus: WorkDayStatus;
  holidays: CountryHoliday[];
  overrides: CalendarOverride[];
  onUpdateStatus: (taskId: string, dateStr: string, status: DailyStatusType) => Promise<void>;
  onCreateOverride: (overrideType: 'LEAVE' | 'WORK') => Promise<void>;
  onClearOverride: (overrideId?: string) => Promise<void>;
  isMobileView?: boolean;
  anchorRect?: DOMRect | null;
}

export const DayActionPanel: React.FC<DayActionPanelProps> = ({
  isOpen,
  onClose,
  task,
  dateStr,
  worker,
  currentWorker,
  dayStatus,
  holidays,
  overrides,
  onUpdateStatus,
  onCreateOverride,
  onClearOverride,
  isMobileView = false,
  anchorRect,
}) => {
  const { t, lang } = useI18n();
  const [activeTab, setActiveTab] = useState<'STATUS' | 'CALENDAR'>('STATUS');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  // Permission Logic
  const isViewer = isExecutiveViewer(currentWorker);
  const isOwnTask = currentWorker && worker && (currentWorker.id === worker.id || currentWorker.name === worker.name);
  const canEditCalendar = !!isOwnTask && !isViewer;
  const canEditStatus = !isViewer;

  const countryCode = worker?.country_code || 'KR';
  const profileStr = worker?.workweek_profile || 'MON_FRI';
  const profileLabel = profileStr === 'MON_SAT' ? (lang === 'vi' ? 'Thứ 2 - Thứ 7' : '월~토 근무') : (lang === 'vi' ? 'Thứ 2 - Thứ 6' : '월~금 근무');

  const currentStatusVal = task.daily_statuses?.[dateStr] || 'NONE';
  const statusDetail = task.daily_status_details?.[dateStr];

  const matchingHoliday = holidays.find((h) => h.country_code === countryCode && h.holiday_date === dateStr);
  const holidayName = matchingHoliday ? (lang === 'vi' ? (matchingHoliday.name_vi || matchingHoliday.name_local) : (matchingHoliday.name_ko || matchingHoliday.name_local)) : null;

  const currentOverride = overrides.find(
    (o) => o.scope_type === 'WORKER' && (o.scope_key === worker?.id || o.scope_key === worker?.name) && o.work_date === dateStr
  );

  const handleStatusSelect = async (st: DailyStatusType) => {
    if (!canEditStatus) return;
    try {
      setLoading(true);
      await onUpdateStatus(task.id, dateStr, st);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Error updating status');
    } finally {
      setLoading(false);
    }
  };

  const handleCalendarSelect = async (type: 'LEAVE' | 'WORK') => {
    if (!canEditCalendar) {
      alert(lang === 'vi' ? 'Bạn chỉ có thể thay đổi lịch nghỉ của chính mình.' : '본인의 휴일·휴가만 변경할 수 있습니다.');
      return;
    }
    try {
      setLoading(true);
      await onCreateOverride(type);
      if (type === 'WORK') {
        alert(
          lang === 'vi'
            ? 'Đã thêm ngày làm việc. Lịch công việc hiện tại không được tự động rút ngắn.'
            : '근무일이 추가되었습니다. 기존 작업 일정은 자동으로 앞당겨지지 않습니다.'
        );
      }
      onClose();
    } catch (err: any) {
      alert(err.message || 'Error creating override');
    } finally {
      setLoading(false);
    }
  };

  const handleClearCalendar = async () => {
    if (!canEditCalendar) {
      alert(lang === 'vi' ? 'Bạn chỉ có thể thay đổi lịch nghỉ của chính mình.' : '본인의 휴일·휴가만 변경할 수 있습니다.');
      return;
    }
    try {
      setLoading(true);
      await onClearOverride(currentOverride?.id);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Error clearing override');
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <div data-testid="day-action-panel" className="w-full bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-900 overflow-hidden text-xs">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div>
          <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span>{dateStr}</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-extrabold uppercase">
              {countryCode}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 font-medium flex items-center gap-2">
            <span>{task.worker_name}</span>
            <span>•</span>
            <span>{profileLabel}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Overview Metadata Box */}
      <div className="p-3 bg-slate-50/70 border-b border-slate-200 space-y-1 text-[11px] text-slate-600">
        {holidayName && (
          <div className="flex items-center justify-between text-rose-700 font-bold bg-rose-50 px-2 py-1 rounded">
            <span>{lang === 'vi' ? 'Ngày lễ:' : '공휴일:'}</span>
            <span>{holidayName}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span>{lang === 'vi' ? 'Lịch hiện tại:' : '현재 일자 상태:'}</span>
          <span className="font-bold text-slate-800">
            {lang === 'vi' ? dayStatus.label_vi : dayStatus.label_ko}
          </span>
        </div>
        {statusDetail?.updated_by_name && (
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>{lang === 'vi' ? 'Sửa lần cuối:' : '마지막 수정자:'}</span>
            <span>{statusDetail.updated_by_name} ({statusDetail.updated_at ? statusDetail.updated_at.substring(0, 10) : ''})</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-100 p-1">
        <button
          type="button"
          data-testid="day-action-status-tab"
          onClick={() => setActiveTab('STATUS')}
          className={`flex-1 py-1.5 rounded-md font-bold text-center transition ${
            activeTab === 'STATUS' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {lang === 'vi' ? 'Trạng thái công việc' : '작업 상태'}
        </button>
        <button
          type="button"
          data-testid="day-action-calendar-tab"
          onClick={() => setActiveTab('CALENDAR')}
          className={`flex-1 py-1.5 rounded-md font-bold text-center transition ${
            activeTab === 'CALENDAR' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {lang === 'vi' ? 'Lịch làm việc' : '근무 일정'}
        </button>
      </div>

      {/* Tab Panels */}
      <div className="p-4 space-y-3">
        {activeTab === 'STATUS' && (
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-700 mb-1">
              {lang === 'vi' ? 'Chọn trạng thái ngày:' : '일별 작업 상태 선택:'}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canEditStatus || loading}
                onClick={() => handleStatusSelect('NONE')}
                className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition ${
                  currentStatusVal === 'NONE'
                    ? 'border-slate-400 bg-slate-100 text-slate-800 font-bold'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{lang === 'vi' ? 'Chưa làm' : '미작업'}</span>
              </button>

              <button
                type="button"
                disabled={!canEditStatus || loading}
                onClick={() => handleStatusSelect('IN_PROGRESS')}
                className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition ${
                  currentStatusVal === 'IN_PROGRESS'
                    ? 'border-blue-500 bg-blue-50 text-blue-800 font-bold'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-blue-50/50'
                }`}
              >
                <div className="w-3.5 h-3.5 rounded-full bg-blue-500 shrink-0" />
                <span>{lang === 'vi' ? 'Đang làm' : '작업 중'}</span>
              </button>

              <button
                type="button"
                disabled={!canEditStatus || loading}
                onClick={() => handleStatusSelect('COMPLETED')}
                className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition ${
                  currentStatusVal === 'COMPLETED'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-emerald-50/50'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{lang === 'vi' ? 'Hoàn thành' : '완료'}</span>
              </button>

              <button
                type="button"
                disabled={!canEditStatus || loading}
                onClick={() => handleStatusSelect('ISSUE')}
                className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition ${
                  currentStatusVal === 'ISSUE'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-amber-50/50'
                }`}
              >
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span>{lang === 'vi' ? 'Có sự cố' : '문제 발생'}</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'CALENDAR' && (
          <div className="space-y-3">
            {!canEditCalendar ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 font-bold text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {isViewer
                    ? (lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.')
                    : (lang === 'vi' ? 'Bạn chỉ có thể thay đổi lịch nghỉ của chính mình.' : '본인의 휴일·휴가만 변경할 수 있습니다.')}
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-700">
                  {lang === 'vi' ? 'Đăng ký ngày nghỉ / làm việc cho bản thân:' : '근무 일정 변경 선택:'}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid="day-action-leave-btn"
                    disabled={loading}
                    onClick={() => handleCalendarSelect('LEAVE')}
                    className="p-2.5 rounded-xl border border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-900 font-bold text-left transition flex items-center gap-2"
                  >
                    <span className="w-3.5 h-3.5 rounded bg-violet-500 shrink-0" />
                    <span>{lang === 'vi' ? 'Nghỉ phép (LEAVE)' : '개인 휴가 (LEAVE)'}</span>
                  </button>

                  <button
                    type="button"
                    data-testid="day-action-work-btn"
                    disabled={loading}
                    onClick={() => handleCalendarSelect('WORK')}
                    className="p-2.5 rounded-xl border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 text-cyan-900 font-bold text-left transition flex items-center gap-2"
                  >
                    <span className="w-3.5 h-3.5 rounded bg-cyan-600 shrink-0" />
                    <span>{lang === 'vi' ? 'Ngày làm việc (WORK)' : '근무일 지정 (WORK)'}</span>
                  </button>
                </div>

                {currentOverride && (
                  <button
                    type="button"
                    data-testid="day-action-clear-calendar-btn"
                    disabled={loading}
                    onClick={handleClearCalendar}
                    className="w-full mt-2 p-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold flex items-center justify-center gap-1.5 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{lang === 'vi' ? 'Xóa ngoại lệ đã đăng ký' : '등록된 예외 삭제'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (isMobileView) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-200 p-2">
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md animate-in zoom-in-95 duration-150">
        {content}
      </div>
    </div>
  );
};

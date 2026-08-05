// src/components/modals/CalendarManagerModal.tsx
import React, { useState, useEffect } from 'react';
import { useI18n } from '../../hooks/useI18n';
import { Worker, isExecutiveViewer, LeaveDeleteResponse, canManageCountryCalendar } from '../../types';
import { X, Calendar, Plus, Trash2, CheckCircle, AlertCircle, Lock, AlertTriangle, ArrowRight, RotateCcw, ChevronLeft, ChevronRight, RefreshCw, Users } from 'lucide-react';
import { api } from '../../services/api';

interface CalendarManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  workers: Worker[];
  currentWorker: Worker | null;
  onRefreshCalendar: () => void;
}

export const CalendarManagerModal: React.FC<CalendarManagerModalProps> = ({
  isOpen,
  onClose,
  workers,
  currentWorker,
  onRefreshCalendar,
}) => {
  const { t, lang } = useI18n();

  // Tab State
  const [activeTab, setActiveTab] = useState<'PERSONAL' | 'VIETNAM_SATURDAY'>('PERSONAL');

  // Personal Leave Tab State
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [overrideType, setOverrideType] = useState<'LEAVE' | 'OFF' | 'WORK'>('LEAVE');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [labelKo, setLabelKo] = useState<string>('');
  const [labelVi, setLabelVi] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const [overrideGroups, setOverrideGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals for Cascade & Restore
  const [leaveConfirmDetails, setLeaveConfirmDetails] = useState<any | null>(null);
  const [leaveConflictDetails, setLeaveConflictDetails] = useState<any | null>(null);
  const [pendingLeavePayload, setPendingLeavePayload] = useState<any | null>(null);

  // Restore Modal State
  const [deleteResponse, setDeleteResponse] = useState<LeaveDeleteResponse | null>(null);
  const [showRestorePreview, setShowRestorePreview] = useState<boolean>(false);

  // Vietnam Saturday Calendar Tab State
  const now = new Date();
  const [vnYear, setVnYear] = useState<number>(now.getFullYear());
  const [vnMonth, setVnMonth] = useState<number>(now.getMonth() + 1);
  const [vnSaturdays, setVnSaturdays] = useState<any[]>([]);
  const [selectedVnStatus, setSelectedVnStatus] = useState<Record<string, 'WORK' | 'OFF'>>({});
  const [vnLoading, setVnLoading] = useState<boolean>(false);
  const [vnImpactData, setVnImpactData] = useState<any | null>(null);
  const [showVnImpactModal, setShowVnImpactModal] = useState<boolean>(false);
  const [vnSaving, setVnSaving] = useState<boolean>(false);

  const isViewer = isExecutiveViewer(currentWorker);
  const canManageCountry = canManageCountryCalendar(currentWorker);

  useEffect(() => {
    if (isOpen) {
      if (currentWorker) {
        setSelectedWorkerId(currentWorker.id);
      } else if (workers.length > 0) {
        setSelectedWorkerId(workers[0].id);
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      setStartDate(todayStr);
      setEndDate(todayStr);
      loadOverrideGroups();
      checkPendingDecisions();

      if (activeTab === 'VIETNAM_SATURDAY') {
        loadVnSaturdayCalendar(vnYear, vnMonth);
      }
    }
  }, [isOpen, currentWorker, workers]);

  useEffect(() => {
    if (isOpen && activeTab === 'VIETNAM_SATURDAY') {
      loadVnSaturdayCalendar(vnYear, vnMonth);
    }
  }, [vnYear, vnMonth, activeTab, isOpen]);

  const loadVnSaturdayCalendar = async (y: number, m: number) => {
    setVnLoading(true);
    try {
      const data = await api.getVietnamSaturdayCalendar(y, m);
      const list = data?.saturdays || [];
      setVnSaturdays(list);
      const map: Record<string, 'WORK' | 'OFF'> = {};
      for (const item of list) {
        map[item.date] = item.status;
      }
      setSelectedVnStatus(map);
    } catch (e) {
      console.error('Failed to load Vietnam Saturday calendar', e);
    } finally {
      setVnLoading(false);
    }
  };

  const checkPendingDecisions = async () => {
    if (!currentWorker || isViewer) return;
    try {
      const pds = await api.getPendingScheduleDecisions();
      if (pds && pds.length > 0) {
        const pd = pds[0];
        setDeleteResponse({
          deleted_group_id: pd.groupId,
          restore_available: true,
          working_leave_days: pd.working_leave_days,
          affected_project_count: pd.affected_project_count,
          affected_task_count: pd.affected_task_count,
          restorable_task_count: pd.restorable_task_count,
          conflict_task_count: pd.conflict_task_count,
          restore_token: pd.restore_token,
          task_preview: pd.task_preview,
        });
        setShowRestorePreview(false);
      }
    } catch (e) {
      console.error('Failed to check pending schedule decisions', e);
    }
  };

  const loadOverrideGroups = async () => {
    setLoading(true);
    try {
      const data = await api.getOverrideGroups();
      setOverrideGroups(data || []);
    } catch (e) {
      console.error('Failed to load calendar override groups', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorker) {
      setMsg({
        text: lang === 'vi' ? 'Vui lòng chọn người dùng hiện tại trước.' : '현재 접속자를 먼저 선택하세요.',
        type: 'error',
      });
      return;
    }
    if (isViewer) {
      setMsg({
        text: lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.',
        type: 'error',
      });
      return;
    }

    const targetWorkerId = currentWorker.id;
    const editorName = currentWorker.name;

    const defaultLabelKo =
      overrideType === 'LEAVE' ? '개인 휴가' : overrideType === 'OFF' ? '수동 휴무' : '근무일 지정';
    const defaultLabelVi =
      overrideType === 'LEAVE' ? 'Nghỉ phép' : overrideType === 'OFF' ? 'Ngày nghỉ thủ công' : 'Chỉ định ngày làm việc';

    const payload = {
      scope_type: 'WORKER',
      scope_key: targetWorkerId,
      start_date: startDate,
      end_date: endDate || startDate,
      override_type: overrideType,
      label_ko: labelKo.trim() || defaultLabelKo,
      label_vi: labelVi.trim() || defaultLabelVi,
      note: note.trim(),
      editor_name: editorName,
    };

    setPendingLeavePayload(payload);

    try {
      await api.createOverride(payload);
      setMsg({ text: t('save'), type: 'success' });
      setLabelKo('');
      setLabelVi('');
      setNote('');
      await loadOverrideGroups();
      onRefreshCalendar();
    } catch (e: any) {
      if (e.code === 'LEAVE_SCHEDULE_CASCADE_CONFIRMATION_REQUIRED' && e.details) {
        setLeaveConfirmDetails(e.details);
      } else if (e.code === 'LEAVE_SHIFT_PROJECT_RANGE_CONFLICT' && e.details) {
        setLeaveConflictDetails(e.details);
      } else {
        setMsg({ text: e.message || t('taskSaveFailed'), type: 'error' });
      }
    }
  };

  const handleConfirmLeaveCascade = async () => {
    if (!pendingLeavePayload) return;
    try {
      await api.createOverride({
        ...pendingLeavePayload,
        confirm_leave_schedule_cascade: true,
      });
      setLeaveConfirmDetails(null);
      setPendingLeavePayload(null);
      setMsg({ text: lang === 'vi' ? 'Đã lưu lịch nghỉ và cập nhật lịch công việc.' : '휴가 및 작업 일정이 변경되었습니다.', type: 'success' });
      setLabelKo('');
      setLabelVi('');
      setNote('');
      await loadOverrideGroups();
      onRefreshCalendar();
    } catch (e: any) {
      alert(e.message || 'Save failed');
    }
  };

  const handleSaveLeaveWithoutShift = async () => {
    if (!pendingLeavePayload) return;
    try {
      await api.createOverride({
        ...pendingLeavePayload,
        save_leave_without_schedule_shift: true,
      });
      setLeaveConflictDetails(null);
      setPendingLeavePayload(null);
      setMsg({ text: lang === 'vi' ? 'Đã lưu lịch nghỉ (giữ nguyên lịch công việc).' : '휴가만 등록되었습니다. (작업 일정 유지)', type: 'success' });
      setLabelKo('');
      setLabelVi('');
      setNote('');
      await loadOverrideGroups();
      onRefreshCalendar();
    } catch (e: any) {
      alert(e.message || 'Save failed');
    }
  };

  const handleDeleteGroup = async (group: any) => {
    if (!currentWorker || isViewer) return;

    const confirmMsg = lang === 'vi' ? 'Bạn có muốn xóa lịch nghỉ này không?' : '이 휴가 일정을 삭제하시겠습니까?';
    if (!window.confirm(confirmMsg)) return;

    try {
      const res: LeaveDeleteResponse = await api.deleteOverrideGroup(group.id);
      await loadOverrideGroups();
      onRefreshCalendar();

      if (res.restore_available && res.restore_token) {
        setDeleteResponse(res);
        setShowRestorePreview(false);
      } else {
        setMsg({ text: lang === 'vi' ? 'Đã xóa lịch nghỉ.' : '휴가 기록이 삭제되었습니다.', type: 'success' });
      }
    } catch (e: any) {
      alert(e.message || 'Delete failed');
    }
  };

  const handleKeepSchedule = async () => {
    if (!deleteResponse || !deleteResponse.restore_token) return;
    try {
      await api.keepLeaveSchedule(deleteResponse.deleted_group_id, deleteResponse.restore_token);
      setDeleteResponse(null);
      setShowRestorePreview(false);
      setMsg({ text: lang === 'vi' ? 'Lịch nghỉ đã được xóa. Lịch công việc đã thay đổi được giữ nguyên.' : '휴가 기록만 삭제되었습니다. 변경된 작업 일정은 유지됩니다.', type: 'success' });
      await loadOverrideGroups();
      onRefreshCalendar();
    } catch (e: any) {
      alert(e.message || 'Keep failed');
    }
  };

  const handleExecuteRestore = async () => {
    if (!deleteResponse || !deleteResponse.restore_token) return;
    try {
      await api.restoreLeaveSchedule(deleteResponse.deleted_group_id, deleteResponse.restore_token);
      setDeleteResponse(null);
      setShowRestorePreview(false);
      setMsg({ text: lang === 'vi' ? 'Lịch công việc đã được khôi phục về ngày ban đầu.' : '작업 일정이 원래 위치로 복원되었습니다.', type: 'success' });
      await loadOverrideGroups();
      onRefreshCalendar();
    } catch (e: any) {
      alert(e.message || 'Restore failed');
    }
  };

  // Vietnam Saturday Handlers
  const handleVnStatusToggle = (date: string, newStatus: 'WORK' | 'OFF') => {
    const item = vnSaturdays.find((s) => s.date === date);
    if (item?.is_public_holiday) return; // Cannot edit public holidays
    setSelectedVnStatus((prev) => ({
      ...prev,
      [date]: newStatus,
    }));
  };

  const handleVnPreset = (type: 'ALL_WORK' | 'ALL_OFF' | 'ODD_OFF' | 'EVEN_OFF' | 'RESET') => {
    if (type === 'RESET') {
      const map: Record<string, 'WORK' | 'OFF'> = {};
      for (const item of vnSaturdays) {
        map[item.date] = item.status;
      }
      setSelectedVnStatus(map);
      return;
    }

    const nextMap: Record<string, 'WORK' | 'OFF'> = { ...selectedVnStatus };
    vnSaturdays.forEach((item) => {
      if (item.is_public_holiday) return;
      if (type === 'ALL_WORK') {
        nextMap[item.date] = 'WORK';
      } else if (type === 'ALL_OFF') {
        nextMap[item.date] = 'OFF';
      } else if (type === 'ODD_OFF') {
        nextMap[item.date] = item.week_of_month % 2 === 1 ? 'OFF' : 'WORK';
      } else if (type === 'EVEN_OFF') {
        nextMap[item.date] = item.week_of_month % 2 === 0 ? 'OFF' : 'WORK';
      }
    });
    setSelectedVnStatus(nextMap);
  };

  const handleVnMonthChange = (delta: number) => {
    let newM = vnMonth + delta;
    let newY = vnYear;
    if (newM > 12) {
      newM = 1;
      newY += 1;
    } else if (newM < 1) {
      newM = 12;
      newY -= 1;
    }
    setVnYear(newY);
    setVnMonth(newM);
  };

  const handleVnSaveInit = async () => {
    if (!currentWorker) return;
    if (!canManageCountry) {
      setMsg({
        text: lang === 'vi' ? 'Bạn không có quyền quản lý lịch làm việc quốc gia.' : '국가 달력 관리 권한이 필요합니다.',
        type: 'error',
      });
      return;
    }

    const payloadSaturdays = vnSaturdays.map((item) => ({
      date: item.date,
      status: selectedVnStatus[item.date] || 'WORK',
    }));

    setVnSaving(true);
    try {
      const impact = await api.calculateVietnamSaturdayImpact({
        year: vnYear,
        month: vnMonth,
        target_scope: 'ALL_VN',
        saturdays: payloadSaturdays,
      });
      setVnImpactData(impact);
      setShowVnImpactModal(true);
    } catch (e: any) {
      setMsg({ text: e.message || 'Impact calculation failed', type: 'error' });
    } finally {
      setVnSaving(false);
    }
  };

  const handleVnConfirmSave = async (shiftSchedule: boolean) => {
    if (!currentWorker) return;
    const payloadSaturdays = vnSaturdays.map((item) => ({
      date: item.date,
      status: selectedVnStatus[item.date] || 'WORK',
    }));

    setVnSaving(true);
    try {
      await api.updateVietnamSaturdayCalendar({
        year: vnYear,
        month: vnMonth,
        target_scope: 'ALL_VN',
        saturdays: payloadSaturdays,
        editor_name: currentWorker.name,
        shift_schedule: shiftSchedule,
      });

      setShowVnImpactModal(false);
      setVnImpactData(null);
      setMsg({ text: lang === 'vi' ? 'Đã cập nhật lịch làm việc thứ Bảy Việt Nam.' : '베트남 토요일 근무표가 저장되었습니다.', type: 'success' });
      await loadVnSaturdayCalendar(vnYear, vnMonth);
      onRefreshCalendar();
    } catch (e: any) {
      alert(e.message || 'Save failed');
    } finally {
      setVnSaving(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (deleteResponse) {
          handleKeepSchedule();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteResponse, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (deleteResponse) {
        handleKeepSchedule();
      } else {
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  const vnWorkCount = vnSaturdays.filter((s) => (selectedVnStatus[s.date] || s.status) === 'WORK' && !s.is_public_holiday).length;
  const vnOffCount = vnSaturdays.filter((s) => (selectedVnStatus[s.date] || s.status) === 'OFF' && !s.is_public_holiday).length;
  const vnHolCount = vnSaturdays.filter((s) => s.is_public_holiday).length;

  return (
    <div
      data-testid="calendar-manager-modal"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto"
    >
      {/* 1. Leave Registration Impact Preview Modal */}
      {leaveConfirmDetails ? (
        <div
          data-testid="leave-cascade-modal"
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-amber-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-amber-100 bg-amber-50/80">
            <div className="flex items-center gap-2 text-amber-900 font-extrabold text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>{lang === 'vi' ? 'Thông báo thay đổi lịch công việc do nghỉ phép' : '휴가 일정 반영 및 작업 이연 안내'}</span>
            </div>
            <button
              type="button"
              onClick={() => setLeaveConfirmDetails(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4 text-xs">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 leading-relaxed font-semibold">
              {lang === 'vi'
                ? `Đã tính toán số ngày làm việc bị mất do nghỉ phép (${leaveConfirmDetails.working_leave_days} ngày). Tất cả lịch công việc hiện tại và tương lai của nhân viên này sẽ được tự động lùi tương ứng.`
                : `휴가 기간 중 실제 근무일(${leaveConfirmDetails.working_leave_days}일)을 계산했습니다. 해당 직원의 진행 중 및 미래 작업 일정이 근무일 기준으로 자동 이연됩니다.`}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Dự án ảnh hưởng' : '영향 프로젝트'}</span>
                <span className="font-extrabold text-slate-800 text-sm">{leaveConfirmDetails.affected_project_count}{lang === 'vi' ? ' dự án' : '개'}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Công việc ảnh hưởng' : '영향 작업'}</span>
                <span className="font-extrabold text-blue-700 text-sm">{leaveConfirmDetails.affected_task_count}{lang === 'vi' ? ' công việc' : '개'}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Trạng thái chuyển' : '상태 이연'}</span>
                <span className="font-extrabold text-emerald-700 text-sm">{leaveConfirmDetails.shifted_future_status_count}{lang === 'vi' ? ' ngày' : '건'}</span>
              </div>
            </div>

            <div>
              <span className="font-bold text-slate-800 block mb-1.5">{lang === 'vi' ? 'Xem trước thay đổi lịch công việc:' : '작업 일정 변경 미리보기'}</span>
              <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg p-2 bg-slate-50">
                {leaveConfirmDetails.task_impacts?.map((tImp: any) => (
                  <div key={tImp.task.id} className="p-2 bg-white rounded border border-slate-200 text-[11px] space-y-0.5">
                    <div className="font-bold text-slate-900 truncate">{tImp.task.project_name} - {tImp.task.task_name}</div>
                    <div className="text-slate-600 flex items-center gap-1">
                      <span>{tImp.old_start_date.slice(5)} ~ {tImp.old_end_date.slice(5)}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <strong className="text-blue-600">{tImp.new_start_date.slice(5)} ~ {tImp.new_end_date.slice(5)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setLeaveConfirmDetails(null)}
                className="flex-1 h-9 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                data-testid="leave-cascade-confirm-btn"
                onClick={handleConfirmLeaveCascade}
                className="flex-1 h-9 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition shadow-xs"
              >
                {lang === 'vi' ? 'Xác nhận thay đổi lịch' : '휴가 및 일정 변경 확정'}
              </button>
            </div>
          </div>
        </div>
      ) : leaveConflictDetails ? (
        /* 2. Leave Schedule Conflict Range Modal */
        <div
          data-testid="leave-conflict-modal"
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-rose-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-rose-100 bg-rose-50/80">
            <div className="flex items-center gap-2 text-rose-900 font-extrabold text-sm">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{lang === 'vi' ? 'Cảnh báo vượt quá thời gian dự án' : '프로젝트 종료일 초과 경고'}</span>
            </div>
            <button
              type="button"
              onClick={() => setLeaveConflictDetails(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4 text-xs">
            <p className="font-semibold text-slate-800 leading-relaxed bg-rose-50/50 p-3 rounded-xl border border-rose-100 text-rose-900">
              {lang === 'vi'
                ? 'Hành động phản ánh nghỉ phép sẽ khiến một số công việc vượt quá ngày kết thúc của dự án.'
                : '휴가 반영 후 일부 작업이 프로젝트 종료일을 초과합니다. 프로젝트 일정은 자동 연장되지 않습니다.'}
            </p>

            <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar border border-rose-200 rounded-lg p-2 bg-rose-50/30">
              {leaveConflictDetails.conflicts?.map((cItem: any) => (
                <div key={cItem.task_id} className="p-2 bg-white rounded border border-rose-100 text-[11px] space-y-0.5">
                  <div className="font-bold text-rose-900">{cItem.project_name} - {cItem.task_name}</div>
                  <div className="text-slate-600">
                    {lang === 'vi' ? 'Hạn dự án:' : '프로젝트 종료일:'} {cItem.project_end_date} | {lang === 'vi' ? 'Lịch dự kiến sau nghỉ:' : '휴가 후 작업 종료일:'} <strong className="text-rose-600">{cItem.new_end_date}</strong> (+{cItem.exceeded_working_days}{lang === 'vi' ? ' ngày' : '일'})
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleSaveLeaveWithoutShift}
                className="w-full h-9 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition shadow-xs"
              >
                {lang === 'vi' ? 'Chỉ lưu lịch nghỉ (giữ nguyên lịch công việc)' : '휴가만 등록하고 현재 작업 일정 유지'}
              </button>
              <button
                type="button"
                onClick={() => setLeaveConflictDetails(null)}
                className="w-full h-9 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : deleteResponse && !showRestorePreview ? (
        /* 3. Leave Deletion 2-Stage Restore Decision Prompt */
        <div
          data-testid="leave-delete-prompt-modal"
          className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-blue-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-blue-100 bg-blue-50/80">
            <div className="flex items-center gap-2 text-blue-900 font-extrabold text-sm">
              <RotateCcw className="w-5 h-5 text-blue-600 shrink-0" />
              <span>{lang === 'vi' ? 'Xác nhận khôi phục lịch công việc' : '휴가 삭제 후 일정 원복 안내'}</span>
            </div>
            <button
              type="button"
              onClick={handleKeepSchedule}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4 text-xs">
            <p className="font-bold text-slate-900 text-sm leading-relaxed">
              {lang === 'vi'
                ? `Lịch nghỉ đã được xóa. Bạn có muốn đưa lịch công việc bị lùi tiến lên ${deleteResponse.working_leave_days} ngày làm việc không?`
                : deleteResponse.working_leave_days === 1
                ? '휴가 일정이 삭제되었습니다. 해당 휴가로 밀린 작업 일정을 근무일 기준 하루씩 앞당길까요?'
                : `휴가 일정이 삭제되었습니다. 해당 휴가로 밀린 작업 일정을 근무일 기준 ${deleteResponse.working_leave_days}일씩 앞당길까요?`}
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                data-testid="leave-cascade-keep-btn"
                onClick={handleKeepSchedule}
                className="w-full h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition flex items-center justify-center gap-1.5"
              >
                <span>{lang === 'vi' ? 'Giữ nguyên lịch công việc hiện tại' : '현재 변경된 작업 일정 유지'}</span>
              </button>
              <button
                type="button"
                data-testid="leave-cascade-restore-preview-btn"
                onClick={() => setShowRestorePreview(true)}
                className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-xs flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{lang === 'vi' ? 'Xem trước & khôi phục lịch công việc' : '작업 일정 원복 검토 및 진행'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : deleteResponse && showRestorePreview ? (
        /* 4. Leave Restore Detailed Inspection Modal */
        <div
          data-testid="leave-restore-preview-modal"
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-blue-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-blue-100 bg-blue-50/80">
            <div className="flex items-center gap-2 text-blue-900 font-extrabold text-sm">
              <RotateCcw className="w-5 h-5 text-blue-600 shrink-0" />
              <span>{lang === 'vi' ? 'Chi tiết khôi phục lịch công việc' : '작업 일정 원복 검토'}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowRestorePreview(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                <span className="text-emerald-700 block text-[10px] font-bold">{lang === 'vi' ? 'Công việc có thể khôi phục' : '원복 가능 작업'}</span>
                <span className="font-extrabold text-emerald-800">{deleteResponse.restorable_task_count}{lang === 'vi' ? ' công việc' : '개'}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Công việc không thể khôi phục' : '원복 불가 작업'}</span>
                <span className="font-extrabold text-rose-600">{deleteResponse.conflict_task_count}{lang === 'vi' ? ' công việc' : '개'}</span>
              </div>
            </div>

            {deleteResponse.conflict_task_count > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[11px] font-semibold">
                {lang === 'vi'
                  ? 'Một số công việc đã được sửa đổi thủ công sau khi nghỉ phép, do đó không thể khôi phục tự động (Tạm dừng toàn bộ khôi phục).'
                  : '일부 작업은 휴가 등록 이후 일정이 수정되어 자동으로 앞당길 수 없습니다. (전체 원복 중단)'}
              </div>
            )}

            <div>
              <span className="font-bold text-slate-800 block mb-1.5">{lang === 'vi' ? 'Xem trước lịch khôi phục:' : '원복 일정 미리보기'}</span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg p-2 bg-slate-50">
                {deleteResponse.task_preview?.map((tItem: any) => (
                  <div key={tItem.id} className="p-2 bg-white rounded border border-slate-100 text-[11px] space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 truncate max-w-[180px]">{tItem.project_name} - {tItem.task_name}</span>
                      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${tItem.restore_status === 'RESTORABLE' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {tItem.restore_status === 'RESTORABLE' ? (lang === 'vi' ? 'Có thể khôi phục' : '원복 가능') : (tItem.conflict_reason || tItem.restore_status)}
                      </span>
                    </div>
                    <div className="text-slate-600 flex items-center gap-1 font-medium">
                      <span>{lang === 'vi' ? 'Hiện tại:' : '현재'} {tItem.current_start_date?.slice(5)} ~ {tItem.current_end_date?.slice(5)}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <strong className="text-emerald-600">{lang === 'vi' ? 'Khôi phục:' : '원복'} {tItem.old_start_date?.slice(5)} ~ {tItem.old_end_date?.slice(5)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowRestorePreview(false)}
                className="flex-1 h-9 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleKeepSchedule}
                className="flex-1 h-9 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition"
              >
                {lang === 'vi' ? 'Giữ nguyên' : '일정 유지'}
              </button>
              <button
                type="button"
                data-testid="restore-execute-btn"
                disabled={deleteResponse.conflict_task_count > 0}
                onClick={handleExecuteRestore}
                className="flex-1 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-xs flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{lang === 'vi' ? 'Khôi phục' : '일정 원복'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : showVnImpactModal && vnImpactData ? (
        /* Vietnam Saturday Impact Preview Modal */
        <div
          data-testid="vn-saturday-impact-modal"
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-blue-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-blue-100 bg-blue-50/80">
            <div className="flex items-center gap-2 text-blue-900 font-extrabold text-sm">
              <Calendar className="w-5 h-5 text-blue-600 shrink-0" />
              <span>{lang === 'vi' ? 'Xác nhận thay đổi lịch làm việc thứ Bảy VN' : '베트남 토요일 근무표 변경 확정'}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowVnImpactModal(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4 text-xs">
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-900 leading-relaxed font-semibold">
              {lang === 'vi'
                ? `Áp dụng lịch làm việc thứ Bảy tháng ${vnMonth}/${vnYear} cho tất cả nhân viên Việt Nam (${vnImpactData.affected_worker_count} người).`
                : `${vnYear}년 ${vnMonth}월 베트남 토요일 근무표를 베트남 직원 전체(${vnImpactData.affected_worker_count}명)에게 적용합니다.`}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Thứ Bảy nghỉ' : '휴무 지정 토요일'}</span>
                <span className="font-extrabold text-rose-700 text-sm">{vnImpactData.affected_saturday_off_count}{lang === 'vi' ? ' ngày' : '일'}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Dự án ảnh hưởng' : '영향 프로젝트'}</span>
                <span className="font-extrabold text-slate-800 text-sm">{vnImpactData.affected_project_count}{lang === 'vi' ? ' dự án' : '개'}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Công việc ảnh hưởng' : '영향 작업'}</span>
                <span className="font-extrabold text-blue-700 text-sm">{vnImpactData.affected_task_count}{lang === 'vi' ? ' công việc' : '개'}</span>
              </div>
            </div>

            {vnImpactData.has_range_conflict && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[11px] font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  {lang === 'vi'
                    ? 'Một số công việc bị lùi sẽ vượt quá ngày kết thúc của dự án. Vui lòng kiểm tra lại tiến độ.'
                    : '휴무 추가로 인해 일부 작업이 프로젝트 종료일을 초과합니다.'}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                data-testid="vn-saturday-confirm-shift-btn"
                disabled={vnSaving}
                onClick={() => handleVnConfirmSave(true)}
                className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-xs flex items-center justify-center gap-1.5"
              >
                <span>{lang === 'vi' ? 'Lưu lịch & tự động cập nhật lịch công việc' : '근무표 및 작업 일정 자동 변경 저장'}</span>
              </button>
              <button
                type="button"
                data-testid="vn-saturday-confirm-noshift-btn"
                disabled={vnSaving}
                onClick={() => handleVnConfirmSave(false)}
                className="w-full h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition"
              >
                <span>{lang === 'vi' ? 'Chỉ lưu lịch làm việc thứ Bảy (giữ nguyên lịch công việc)' : '근무표만 저장하고 현재 작업 일정 유지'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowVnImpactModal(false)}
                className="w-full h-8 rounded-lg text-slate-500 font-bold hover:bg-slate-100 transition"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Main Calendar Manager Modal */
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">{t('manageHolidays')}</h2>
            </div>
            <button
              type="button"
              data-testid="calendar-modal-close-btn"
              onClick={onClose}
              aria-label={t('close')}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50/60 px-5 pt-2 gap-2">
            <button
              type="button"
              data-testid="calendar-personal-tab"
              onClick={() => setActiveTab('PERSONAL')}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
                activeTab === 'PERSONAL'
                  ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {lang === 'vi' ? 'Nghỉ phép cá nhân' : '개인 휴가·휴무'}
            </button>
            <button
              type="button"
              data-testid="vietnam-saturday-calendar-tab"
              onClick={() => {
                setActiveTab('VIETNAM_SATURDAY');
                if (vnSaturdays.length === 0) {
                  loadVnSaturdayCalendar(vnYear, vnMonth);
                }
              }}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
                activeTab === 'VIETNAM_SATURDAY'
                  ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {lang === 'vi' ? 'Lịch làm việc thứ Bảy' : '베트남 토요일 근무표'}
            </button>
          </div>

          {/* Content Body */}
          <div className="p-5 overflow-y-auto space-y-6 flex-1 text-slate-900">
            {isViewer && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 flex items-center gap-2">
                <Lock className="w-4 h-4 text-red-600 shrink-0" />
                <span>{lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.'}</span>
              </div>
            )}

            {msg && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between transition ${
                  msg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {msg.type === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{msg.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMsg(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* TAB 1: PERSONAL LEAVE MANAGEMENT */}
            {activeTab === 'PERSONAL' && (
              <>
                {/* Form */}
                <form onSubmit={handleCreateOverride} className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-blue-600" />
                    <span>{lang === 'vi' ? 'Tạo lịch nghỉ / làm việc mới' : '휴가 및 수동 휴무 등록'}</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">{t('worker')}</label>
                      <input
                        type="text"
                        disabled
                        value={currentWorker ? `${currentWorker.name} (${currentWorker.country_code})` : ''}
                        className="w-full h-9 px-3 bg-slate-200/70 border border-slate-300 rounded-lg text-slate-700 font-semibold cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">{lang === 'vi' ? 'Loại' : '항목'}</label>
                      <select
                        disabled={isViewer}
                        value={overrideType}
                        onChange={(e: any) => setOverrideType(e.target.value)}
                        className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        <option value="LEAVE">{lang === 'vi' ? 'Nghỉ phép cá nhân' : '개인 휴가 (LEAVE)'}</option>
                        <option value="OFF">{lang === 'vi' ? 'Ngày nghỉ thủ công' : '수동 휴무 (OFF)'}</option>
                        <option value="WORK">{lang === 'vi' ? 'Chỉ định ngày làm việc' : '근무일 지정 (WORK)'}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">{t('startDate')}</label>
                      <input
                        type="date"
                        disabled={isViewer}
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">{t('endDate')}</label>
                      <input
                        type="date"
                        disabled={isViewer}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">{lang === 'vi' ? 'Tên (Tiếng Hàn)' : '명칭 (한국어)'}</label>
                      <input
                        type="text"
                        disabled={isViewer}
                        placeholder={overrideType === 'LEAVE' ? '개인 휴가' : '수동 휴무'}
                        value={labelKo}
                        onChange={(e) => setLabelKo(e.target.value)}
                        className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">{lang === 'vi' ? 'Tên (Tiếng Việt)' : '명칭 (베트남어)'}</label>
                      <input
                        type="text"
                        disabled={isViewer}
                        placeholder={overrideType === 'LEAVE' ? 'Nghỉ phép' : 'Ngày nghỉ thủ công'}
                        value={labelVi}
                        onChange={(e) => setLabelVi(e.target.value)}
                        className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={isViewer}
                      className="px-4 h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t('save')}</span>
                    </button>
                  </div>
                </form>

                {/* History List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                      {lang === 'vi' ? 'Lịch sử nghỉ phép đã đăng ký' : '등록된 개인 휴가 및 수동 휴무'}
                    </h3>
                    <span className="text-[11px] font-bold text-slate-500">
                      {overrideGroups.length}{lang === 'vi' ? ' mục' : '건'}
                    </span>
                  </div>

                  {loading ? (
                    <div className="py-8 text-center text-xs text-slate-500">{t('loading')}</div>
                  ) : overrideGroups.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      {lang === 'vi' ? 'Chưa có lịch nghỉ nào được đăng ký.' : '등록된 휴가 내역이 없습니다.'}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                      {overrideGroups.map((group) => {
                        const targetWorker = workers.find((w) => w.id === group.worker_id);
                        return (
                          <div
                            key={group.id}
                            className="p-3 bg-white rounded-xl border border-slate-200 hover:border-blue-200 transition shadow-2xs flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-extrabold text-slate-900">
                                  {targetWorker ? targetWorker.name : group.worker_id}
                                </span>
                                <span
                                  className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${
                                    group.override_type === 'LEAVE'
                                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                                      : group.override_type === 'OFF'
                                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  }`}
                                >
                                  {group.override_type === 'LEAVE'
                                    ? (lang === 'vi' ? 'Nghỉ phép' : '개인 휴가')
                                    : group.override_type === 'OFF'
                                    ? (lang === 'vi' ? 'Nghỉ thủ công' : '수동 휴무')
                                    : (lang === 'vi' ? 'Làm việc' : '근무일')}
                                </span>
                                <span className="text-[11px] font-semibold text-slate-500">
                                  {group.start_date} ~ {group.end_date}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-600">
                                {lang === 'vi' ? group.label_vi || group.label_ko : group.label_ko || group.label_vi}
                              </div>
                            </div>

                            {!isViewer && (
                              <button
                                type="button"
                                onClick={() => handleDeleteGroup(group)}
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition shrink-0 border border-slate-200"
                                title={lang === 'vi' ? 'Xóa' : '삭제'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* TAB 2: VIETNAM SATURDAY WORK CALENDAR */}
            {activeTab === 'VIETNAM_SATURDAY' && (
              <div className="space-y-4">
                {/* Month Picker & Targets */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="text-xs font-extrabold text-slate-900">
                        {lang === 'vi' ? `Tháng ${vnMonth} năm ${vnYear}` : `${vnYear}년 ${vnMonth}월 토요일 근무표`}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        data-testid="vn-saturday-prev-month-btn"
                        onClick={() => handleVnMonthChange(-1)}
                        className="w-7 h-7 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700 transition"
                        title={lang === 'vi' ? 'Tháng trước' : '이전 달'}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        data-testid="vn-saturday-current-month-btn"
                        onClick={() => {
                          const now = new Date();
                          setVnYear(now.getFullYear());
                          setVnMonth(now.getMonth() + 1);
                        }}
                        className="h-7 px-2 text-[11px] font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition"
                      >
                        {lang === 'vi' ? 'Tháng này' : '이번 달'}
                      </button>
                      <button
                        type="button"
                        data-testid="vn-saturday-next-month-btn"
                        onClick={() => handleVnMonthChange(1)}
                        className="w-7 h-7 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700 transition"
                        title={lang === 'vi' ? 'Tháng sau' : '다음 달'}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <input
                        type="month"
                        data-testid="vn-saturday-month-input"
                        value={`${vnYear}-${String(vnMonth).padStart(2, '0')}`}
                        onChange={(e) => {
                          if (e.target.value) {
                            const [y, m] = e.target.value.split('-').map(Number);
                            setVnYear(y);
                            setVnMonth(m);
                          }
                        }}
                        className="h-7 px-2 text-[11px] font-bold rounded-lg border border-slate-300 bg-white text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <Users className="w-4 h-4 text-amber-600" />
                      <span>{lang === 'vi' ? 'Đối tượng áp dụng: Tất cả nhân viên VN (3 người)' : '적용 대상: 베트남 직원 전체 (3명)'}</span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-semibold hidden sm:inline">
                      Thanh Phuong, Manh Cuong, Quoc Nhut
                    </span>
                  </div>
                </div>

                {/* Presets */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                    {lang === 'vi' ? 'Lựa chọn nhanh (Preset)' : '빠른 프리셋 설정'}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      data-testid="vn-saturday-all-work-btn"
                      onClick={() => handleVnPreset('ALL_WORK')}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition"
                    >
                      {lang === 'vi' ? 'Làm việc tất cả thứ Bảy' : '전체 토요일 근무'}
                    </button>
                    <button
                      type="button"
                      data-testid="vn-saturday-all-off-btn"
                      onClick={() => handleVnPreset('ALL_OFF')}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 transition"
                    >
                      {lang === 'vi' ? 'Nghỉ tất cả thứ Bảy' : '전체 토요일 휴무'}
                    </button>
                    <button
                      type="button"
                      data-testid="vn-saturday-odd-off-btn"
                      onClick={() => handleVnPreset('ODD_OFF')}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition"
                    >
                      {lang === 'vi' ? 'Nghỉ tuần 1, 3, 5' : '1·3·5주 휴무'}
                    </button>
                    <button
                      type="button"
                      data-testid="vn-saturday-even-off-btn"
                      onClick={() => handleVnPreset('EVEN_OFF')}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold border border-purple-300 bg-purple-50 text-purple-800 hover:bg-purple-100 transition"
                    >
                      {lang === 'vi' ? 'Nghỉ tuần 2, 4' : '2·4주 휴무'}
                    </button>
                    <button
                      type="button"
                      data-testid="vn-saturday-reset-btn"
                      onClick={() => handleVnPreset('RESET')}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                    >
                      {lang === 'vi' ? 'Đặt lại lựa chọn' : '직접 선택 초기화'}
                    </button>
                  </div>
                </div>

                {/* Saturdays Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                      <tr>
                        <th className="py-2.5 px-3">{lang === 'vi' ? 'Tuần' : '주차'}</th>
                        <th className="py-2.5 px-3">{lang === 'vi' ? 'Ngày' : '날짜'}</th>
                        <th className="py-2.5 px-3">{lang === 'vi' ? 'Trạng thái hiện tại' : '현재 상태'}</th>
                        <th className="py-2.5 px-3 text-right">{lang === 'vi' ? 'Thay đổi' : '근무/휴무 변경'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {vnLoading ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400 font-semibold">
                            {t('loading')}
                          </td>
                        </tr>
                      ) : vnSaturdays.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400 font-semibold">
                            {lang === 'vi' ? 'Không có thứ Bảy trong tháng này.' : '선택한 월에 토요일이 없습니다.'}
                          </td>
                        </tr>
                      ) : (
                        vnSaturdays.map((item) => {
                          const currStatus = selectedVnStatus[item.date] || item.status;
                          return (
                            <tr
                              key={item.date}
                              data-testid={`vn-saturday-row-${item.date}`}
                              className="hover:bg-slate-50 transition"
                            >
                              <td className="py-2.5 px-3 font-bold text-slate-800">
                                {lang === 'vi' ? `Tuần ${item.week_of_month}` : `${item.week_of_month}주차`}
                              </td>
                              <td className="py-2.5 px-3 font-bold text-slate-900">
                                {item.date}
                              </td>
                              <td className="py-2.5 px-3">
                                {item.is_public_holiday ? (
                                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                                    {lang === 'vi' ? 'Ngày lễ VN' : 'VN 공휴일'}
                                  </span>
                                ) : (
                                  <span
                                    className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${
                                      currStatus === 'OFF'
                                        ? 'bg-rose-100 text-rose-800 border-rose-200'
                                        : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    }`}
                                  >
                                    {currStatus === 'OFF' ? (lang === 'vi' ? 'Nghỉ' : '휴무') : (lang === 'vi' ? 'Làm việc' : '근무')}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {item.is_public_holiday ? (
                                  <span className="text-[11px] text-slate-400 font-medium italic">
                                    {lang === 'vi' ? 'Không thể chỉnh sửa' : '공휴일 변경 불가'}
                                  </span>
                                ) : (
                                  <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
                                    <button
                                      type="button"
                                      data-testid={`vn-saturday-work-btn-${item.date}`}
                                      disabled={isViewer || !canManageCountry}
                                      onClick={() => handleVnStatusToggle(item.date, 'WORK')}
                                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${
                                        currStatus === 'WORK'
                                          ? 'bg-emerald-600 text-white shadow-2xs'
                                          : 'text-slate-600 hover:text-slate-900'
                                      }`}
                                    >
                                      {lang === 'vi' ? 'Làm việc' : '근무'}
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`vn-saturday-off-btn-${item.date}`}
                                      disabled={isViewer || !canManageCountry}
                                      onClick={() => handleVnStatusToggle(item.date, 'OFF')}
                                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${
                                        currStatus === 'OFF'
                                          ? 'bg-rose-600 text-white shadow-2xs'
                                          : 'text-slate-600 hover:text-slate-900'
                                      }`}
                                    >
                                      {lang === 'vi' ? 'Nghỉ' : '휴무'}
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Summary Card */}
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Tổng số thứ Bảy' : '토요일 수'}</span>
                    <span className="font-extrabold text-slate-900 text-sm">{vnSaturdays.length}{lang === 'vi' ? ' ngày' : '일'}</span>
                  </div>
                  <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                    <span className="text-emerald-700 block text-[10px] font-bold">{lang === 'vi' ? 'Số ngày làm việc' : '근무일'}</span>
                    <span className="font-extrabold text-emerald-800 text-sm">{vnWorkCount}{lang === 'vi' ? ' ngày' : '일'}</span>
                  </div>
                  <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                    <span className="text-rose-700 block text-[10px] font-bold">{lang === 'vi' ? 'Số ngày nghỉ' : '휴무일'}</span>
                    <span className="font-extrabold text-rose-800 text-sm">{vnOffCount}{lang === 'vi' ? ' ngày' : '일'}</span>
                  </div>
                  <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                    <span className="text-amber-800 block text-[10px] font-bold">{lang === 'vi' ? 'Trùng ngày lễ' : '공휴일 중복'}</span>
                    <span className="font-extrabold text-amber-900 text-sm">{vnHolCount}{lang === 'vi' ? ' ngày' : '일'}</span>
                  </div>
                </div>

                {/* Save Footer */}
                <div className="flex justify-end pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    data-testid="vn-saturday-save-btn"
                    disabled={isViewer || !canManageCountry || vnSaving}
                    onClick={handleVnSaveInit}
                    className="px-5 h-10 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>{lang === 'vi' ? 'Lưu lịch làm việc thứ Bảy' : '베트남 토요일 근무표 저장'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

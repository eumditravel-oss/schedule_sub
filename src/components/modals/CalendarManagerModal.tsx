// src/components/modals/CalendarManagerModal.tsx
import React, { useState, useEffect } from 'react';
import { useI18n } from '../../hooks/useI18n';
import { Worker, CalendarOverrideGroup, isExecutiveViewer, LeaveDeleteResponse } from '../../types';
import { X, Calendar, Plus, Trash2, CheckCircle, AlertCircle, Lock, AlertTriangle, ArrowRight, RotateCcw } from 'lucide-react';
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

  const isViewer = isExecutiveViewer(currentWorker);

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
    }
  }, [isOpen, currentWorker, workers]);

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

  if (!isOpen) return null;

  return (
    <div
      data-testid="calendar-manager-modal"
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
            <p className="font-semibold text-slate-800 leading-relaxed bg-amber-50/50 p-3 rounded-xl border border-amber-100">
              {lang === 'vi'
                ? `Lịch nghỉ phép của ${leaveConfirmDetails.worker_name} sẽ làm di chuyển lịch của các công việc liên quan.`
                : `${leaveConfirmDetails.worker_name} 수석의 휴가 일정으로 인해 연결된 작업 일정이 근무일 기준으로 이연됩니다.`}
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Thời gian nghỉ' : '휴가 기간'}</span>
                <span className="font-bold text-slate-900">{leaveConfirmDetails.leave_start_date} ~ {leaveConfirmDetails.leave_end_date}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Số ngày làm việc nghỉ' : '실제 근무 휴가일'}</span>
                <span className="font-extrabold text-blue-600">{leaveConfirmDetails.working_leave_days}{lang === 'vi' ? ' ngày' : '일'}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Dự án ảnh hưởng' : '영향 프로젝트'}</span>
                <span className="font-bold text-slate-900">{leaveConfirmDetails.affected_project_count}{lang === 'vi' ? ' dự án' : '개'}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Công việc ảnh hưởng' : '영향 작업'}</span>
                <span className="font-bold text-emerald-600">{leaveConfirmDetails.affected_task_count}{lang === 'vi' ? ' công việc' : '개'}</span>
              </div>
            </div>

            <div>
              <span className="font-bold text-slate-800 block mb-1.5">{lang === 'vi' ? 'Xem trước lịch công việc bị di chuyển:' : '작업 일정 이연 미리보기'}</span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg p-2 bg-slate-50">
                {leaveConfirmDetails.task_preview?.map((tItem: any) => (
                  <div key={tItem.task_id} className="p-2 bg-white rounded border border-slate-100 text-[11px] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 truncate max-w-[180px]">{tItem.task_name}</span>
                      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${tItem.shift_mode === 'EXTEND_END_ONLY' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {tItem.shift_mode === 'EXTEND_END_ONLY' ? (lang === 'vi' ? 'Gia hạn ngày kết thúc' : '종료일 연장') : (lang === 'vi' ? 'Di chuyển lịch' : '일정 이연')}
                      </span>
                    </div>
                    <div className="text-slate-600 flex items-center gap-1 font-medium">
                      <span>{tItem.old_start_date.slice(5)} ~ {tItem.old_end_date.slice(5)}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <strong className="text-blue-600">{tItem.new_start_date.slice(5)} ~ {tItem.new_end_date.slice(5)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                data-testid="leave-cascade-cancel-btn"
                onClick={() => setLeaveConfirmDetails(null)}
                className="flex-1 h-9 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                data-testid="leave-cascade-confirm-btn"
                onClick={handleConfirmLeaveCascade}
                className="flex-1 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-xs flex items-center justify-center gap-1"
              >
                <CheckCircle className="w-4 h-4" />
                <span>{lang === 'vi' ? 'Lưu nghỉ phép & Di chuyển' : '휴가 및 일정 변경'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : leaveConflictDetails ? (
        /* 2. Leave Registration Project Range Conflict Modal */
        <div
          data-testid="leave-conflict-modal"
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-rose-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-rose-100 bg-rose-50/80">
            <div className="flex items-center gap-2 text-rose-900 font-extrabold text-sm">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{lang === 'vi' ? 'Cảnh báo vượt quá thời gian dự án' : '프로젝트 기간 초과 경고'}</span>
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

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-700 space-y-1">
              <div>• {lang === 'vi' ? 'Số ngày làm việc nghỉ:' : '실제 근무 휴가일:'} <strong className="text-blue-600">{deleteResponse.working_leave_days}일</strong></div>
              <div>• {lang === 'vi' ? 'Công việc có thể khôi phục:' : '원복 가능 작업:'} <strong className="text-emerald-600">{deleteResponse.restorable_task_count}개</strong></div>
              {deleteResponse.conflict_task_count > 0 && (
                <div className="text-rose-600 font-bold">• {lang === 'vi' ? 'Công việc không thể khôi phục:' : '원복 불가 작업:'} {deleteResponse.conflict_task_count}개</div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                data-testid="restore-keep-btn"
                onClick={handleKeepSchedule}
                className="flex-1 h-10 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                {lang === 'vi' ? 'Giữ nguyên lịch' : '일정 유지'}
              </button>
              <button
                type="button"
                data-testid="restore-confirm-btn"
                onClick={() => setShowRestorePreview(true)}
                className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-xs flex items-center justify-center gap-1"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{lang === 'vi' ? 'Tiến lịch lên' : '일정 앞당기기'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : deleteResponse && showRestorePreview ? (
        /* 4. Leave Restore Schedule Preview Modal */
        <div
          data-testid="leave-restore-preview-modal"
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-blue-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-blue-100 bg-blue-50/80">
            <div className="flex items-center gap-2 text-blue-900 font-extrabold text-sm">
              <RotateCcw className="w-5 h-5 text-blue-600 shrink-0" />
              <span>{lang === 'vi' ? 'Xem trước khôi phục lịch công việc' : '휴가 삭제 일정 원복 미리보기'}</span>
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
      ) : (
        /* 5. Main Calendar Manager Modal */
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
                className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  msg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                {msg.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{msg.text}</span>
              </div>
            )}

            {/* Form: Add Personal Leave / Override (EDITOR only) */}
            {!isViewer && currentWorker && (
              <form onSubmit={handleCreateOverride} className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-blue-600" />
                  <span>{t('leaveSchedule')}</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">{t('worker')}</label>
                    <input
                      type="text"
                      readOnly
                      value={`${currentWorker.name} (${currentWorker.country_code || 'KR'})`}
                      className="w-full h-9 px-3 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">{t('scopeType')}</label>
                    <select
                      data-testid="override-type-select"
                      value={overrideType}
                      onChange={(e) => setOverrideType(e.target.value as any)}
                      className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                    >
                      <option value="LEAVE">{t('leaveTypePersonal')}</option>
                      <option value="OFF">{t('leaveTypeManualOff')}</option>
                      <option value="WORK">{t('leaveTypeWorkOverride')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">{t('startDate')}</label>
                    <input
                      type="date"
                      data-testid="override-start-date-input"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                      className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">{t('endDate')}</label>
                    <input
                      type="date"
                      data-testid="override-end-date-input"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                      className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">명칭 (한국어)</label>
                    <input
                      type="text"
                      data-testid="override-label-ko-input"
                      placeholder={overrideType === 'LEAVE' ? '개인 휴가' : '수동 휴무'}
                      value={labelKo}
                      onChange={(e) => setLabelKo(e.target.value)}
                      className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">명칭 (Tiếng Việt)</label>
                    <input
                      type="text"
                      data-testid="override-label-vi-input"
                      placeholder={overrideType === 'LEAVE' ? 'Nghỉ phép' : 'Ngày nghỉ thủ công'}
                      value={labelVi}
                      onChange={(e) => setLabelVi(e.target.value)}
                      className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    data-testid="override-save-btn"
                    className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('save')}</span>
                  </button>
                </div>
              </form>
            )}

            {/* List of Registered Override Groups */}
            <div>
              <h3 className="text-xs font-bold text-slate-900 mb-2">{t('leaveSchedule')} 목록</h3>

              {loading ? (
                <p className="text-xs text-slate-400 py-4 text-center">{t('loading')}</p>
              ) : overrideGroups.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">{t('noData')}</p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {overrideGroups.map((group) => {
                    const targetWorker = workers.find((w) => w.id === group.worker_id || w.name === group.worker_id);
                    const displayWorker = targetWorker ? targetWorker.name : group.worker_id;
                    const displayLabel = lang === 'vi' ? group.label_vi || group.label_ko : group.label_ko || group.label_vi;
                    const isDeletable = !isViewer && currentWorker && (group.worker_id === currentWorker.id || group.worker_id === currentWorker.name);

                    const dateRangeStr = group.start_date === group.end_date ? group.start_date : `${group.start_date} ~ ${group.end_date}`;

                    return (
                      <div key={group.id} className="px-3.5 py-3 flex items-center justify-between text-xs hover:bg-slate-50 transition">
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                group.override_type === 'LEAVE'
                                  ? 'bg-violet-100 text-violet-700'
                                  : group.override_type === 'OFF'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-cyan-100 text-cyan-700'
                              }`}
                            >
                              {group.override_type}
                            </span>
                            <span className="font-bold text-slate-900">{displayWorker}</span>
                            <span className="text-slate-600 font-semibold">{dateRangeStr}</span>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-500">
                            <span>{displayLabel}</span>
                            {group.working_leave_days !== undefined && group.working_leave_days > 0 && (
                              <span className="text-blue-600 font-bold">
                                {lang === 'vi' ? `Nghỉ ${group.working_leave_days} ngày làm việc` : `근무일 ${group.working_leave_days}일`}
                              </span>
                            )}
                            {group.affected_task_count !== undefined && group.affected_task_count > 0 && (
                              <span className="text-emerald-600 font-bold">
                                {lang === 'vi' ? `Di chuyển ${group.affected_task_count} công việc` : `작업 ${group.affected_task_count}개 이동`}
                              </span>
                            )}
                          </div>
                        </div>

                        {isDeletable && (
                          <button
                            type="button"
                            data-testid={`delete-override-group-btn-${group.id}`}
                            onClick={() => handleDeleteGroup(group)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition"
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

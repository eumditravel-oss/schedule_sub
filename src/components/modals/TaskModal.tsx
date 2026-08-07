// src/components/modals/TaskModal.tsx
import React, { useState, useEffect } from 'react';
import { Task, Worker, Project, TaskGroup, CountryHoliday, CalendarOverride, ProgressMode, TaskAssignee } from '../../types';
import { calculateTaskWorkdayBreakdown } from '../../utils/workCalendar';
import { useI18n } from '../../hooks/useI18n';
import { useAutoTranslation } from '../../hooks/useAutoTranslation';
import { X, Sparkles, RefreshCw, Calendar, AlertCircle, Plus, Trash2, UserCheck, Users } from 'lucide-react';

interface TaskModalProps {
  isOpen: boolean;
  projectId: string;
  project?: Project | null;
  task: Task | null;
  currentWorker: Worker | null;
  taskGroups?: TaskGroup[];
  holidays?: CountryHoliday[];
  overrides?: CalendarOverride[];
  workers?: Worker[];
  onClose: () => void;
  onSave: (data: Partial<Task> & Record<string, any>) => Promise<any>;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  projectId,
  project,
  task,
  currentWorker,
  taskGroups = [],
  holidays,
  overrides,
  workers = [],
  onClose,
  onSave,
}) => {
  const { t, lang } = useI18n();

  const activeEditors = workers.filter(
    (w) => Number(w.is_active) === 1 && w.access_role === 'EDITOR' && w.name !== 'CEO' && w.name !== 'COO'
  );

  const workerLang: 'ko' | 'vi' = currentWorker?.ui_language || (lang === 'vi' ? 'vi' : 'ko');
  const [inputLang, setInputLang] = useState<'ko' | 'vi'>(workerLang);
  const [taskGroupId, setTaskGroupId] = useState<string>('');
  const [taskNameInput, setTaskNameInput] = useState('');
  const [targetText, setTargetText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [scheduleStatus, setScheduleStatus] = useState<'SCHEDULED' | 'UNSCHEDULED'>('SCHEDULED');
  const [saving, setSaving] = useState(false);
  const [manualLock, setManualLock] = useState(false);

  // V2 Domain Roles: PIC (Primary) + Support
  const [primaryWorkerId, setPrimaryWorkerId] = useState<string>('');
  const [initialPrimaryId, setInitialPrimaryId] = useState<string>('');
  const [supportWorkerIds, setSupportWorkerIds] = useState<string[]>([]);
  const [progressMode, setProgressMode] = useState<ProgressMode>('AUTO_TIME');
  const [selectedSupportToAdd, setSelectedSupportToAdd] = useState<string>('');

  const [saveError, setSaveError] = useState<{ code?: string; message: string } | null>(null);

  const targetLang = inputLang === 'ko' ? 'vi' : 'ko';

  const {
    translatedText: autoTranslatedText,
    status: autoStatus,
  } = useAutoTranslation({
    sourceText: taskNameInput,
    sourceLanguage: inputLang,
    initialTargetText: targetText,
    debounceMs: 700,
  });

  useEffect(() => {
    if (!manualLock) {
      if (autoStatus === 'TRANSLATING') {
        setTargetText('');
      } else if (autoTranslatedText) {
        setTargetText(autoTranslatedText);
      }
    }
  }, [autoTranslatedText, autoStatus, manualLock]);

  useEffect(() => {
    const src = (task?.source_language as 'ko' | 'vi') || currentWorker?.ui_language || workerLang;
    setInputLang(src);
    setSaveError(null);

    if (task && task.id) {
      setTaskGroupId(task.task_group_id || taskGroups[0]?.id || '');
      setManualLock(task.translation_status === 'MANUAL');
    } else {
      setTaskGroupId((task as any)?.task_group_id || taskGroups[0]?.id || '');
      setManualLock(false);
    }

    if (task) {
      const initialSourceText = src === 'vi' ? (task.task_name_vi || task.task_name) : (task.task_name_ko || task.task_name);
      const initialTransText = src === 'vi' ? (task.task_name_ko || '') : (task.task_name_vi || '');

      setTaskNameInput(initialSourceText || '');
      setTargetText(initialTransText || '');
      const isUnsch = task.schedule_status === 'UNSCHEDULED' || (!task.start_date && !task.end_date);
      setScheduleStatus(isUnsch ? 'UNSCHEDULED' : 'SCHEDULED');
      setStartDate(task.start_date || '');
      setEndDate(task.end_date || '');
      setProgressMode(task.progress_mode || 'AUTO_TIME');

      // Initialize Assignees: PIC + Support
      let assigneesList: TaskAssignee[] = task.assignees || [];
      if (assigneesList.length === 0) {
        const pObj = workers.find((w) => w.id === task.primary_worker_id || w.id === task.worker_name || w.name === task.worker_name) || currentWorker;
        if (pObj) {
          assigneesList = [{ worker_id: pObj.id, name: pObj.name, assignment_role: 'PRIMARY', allocation_percent: 100 }];
        }
      }

      const pId = task.primary_worker_id || assigneesList.find((a) => a.assignment_role === 'PRIMARY')?.worker_id || assigneesList[0]?.worker_id || currentWorker?.id || activeEditors[0]?.id || '';
      setPrimaryWorkerId(pId);
      setInitialPrimaryId(pId);

      const supports = assigneesList
        .filter((a) => a.worker_id !== pId && a.assignment_role === 'CO_ASSIGNEE')
        .map((a) => a.worker_id);
      setSupportWorkerIds(Array.from(new Set(supports)));
    } else {
      const defaultStart = project?.start_date || new Date().toISOString().slice(0, 10);
      const defaultEnd = project?.end_date || defaultStart;
      const initialPrimary = currentWorker?.id || (activeEditors[0]?.id || '');

      setTaskNameInput('');
      setTargetText('');
      setScheduleStatus('SCHEDULED');
      setStartDate(defaultStart);
      setEndDate(defaultEnd);
      setProgressMode('AUTO_TIME');
      setPrimaryWorkerId(initialPrimary);
      setInitialPrimaryId(initialPrimary);
      setSupportWorkerIds([]);
    }
  }, [task, project, isOpen, currentWorker, workers]);

  const handlePrimaryChange = (newId: string) => {
    if (!newId) return;
    setPrimaryWorkerId(newId);
    setSaveError(null);
    // If new PIC was in support list, remove from support
    setSupportWorkerIds((prev) => prev.filter((id) => id !== newId));
  };

  const handleAddSupport = (workerId: string) => {
    if (!workerId) return;
    setSaveError(null);
    if (workerId === primaryWorkerId) {
      setSaveError({ message: lang === 'vi' ? 'Người phụ trách chính không thể là người hỗ trợ.' : '주 담당자는 지원 담당자로 추가할 수 없습니다.' });
      return;
    }
    if (supportWorkerIds.includes(workerId)) return;
    if (supportWorkerIds.length >= 4) {
      setSaveError({ message: lang === 'vi' ? 'Tối đa 4 người hỗ trợ (tổng cộng 5 người).' : '지원 담당자는 최대 4명(총 5명)까지 배정할 수 있습니다.' });
      return;
    }
    setSupportWorkerIds((prev) => [...prev, workerId]);
    setSelectedSupportToAdd('');
  };

  const handleRemoveSupport = (workerId: string) => {
    setSaveError(null);
    setSupportWorkerIds((prev) => prev.filter((id) => id !== workerId));
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTaskNameInput(e.target.value);
    setSaveError(null);
  };

  const handleTargetTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTargetText(e.target.value);
    setManualLock(true);
    setSaveError(null);
  };

  const primaryWorkerObj = workers.find((w) => w.id === primaryWorkerId) || currentWorker;

  // Workday calculation depends STRICTLY on the PIC's Calendar
  const breakdown = calculateTaskWorkdayBreakdown(
    primaryWorkerObj || null,
    startDate,
    endDate,
    holidays || [],
    overrides || []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    if (!taskNameInput.trim()) {
      setSaveError({ message: lang === 'vi' ? 'Vui lòng nhập nội dung công việc.' : '작업 내용을 입력해 주세요.' });
      return;
    }

    if (!primaryWorkerId) {
      setSaveError({ message: lang === 'vi' ? 'Vui lòng chọn người phụ trách chính (PIC).' : '주 담당자(PIC)를 선택해 주세요.' });
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      setSaveError({ message: lang === 'vi' ? 'Ngày kết thúc phải sau ngày bắt đầu.' : '종료일은 시작일 이후여야 합니다.' });
      return;
    }

    if (project) {
      if (startDate < project.start_date || endDate > project.end_date) {
        setSaveError({ message: lang === 'vi' ? 'Lịch công việc phải nằm trong thời gian của dự án.' : '작업 일정은 프로젝트 기간 안에서만 설정할 수 있습니다.' });
        return;
      }
    }

    if (scheduleStatus === 'SCHEDULED') {
      if (!startDate || !endDate) {
        setSaveError({ message: lang === 'vi' ? 'Vui lòng chọn ngày bắt đầu và kết thúc.' : '시작일과 종료일을 입력해 주세요.' });
        return;
      }

      if (breakdown.has_profile_error) {
        setSaveError({ message: lang === 'vi' ? 'Không thể xác minh thông tin lịch làm việc của nhân viên.' : '작업자 캘린더 정보를 확인할 수 없습니다.' });
        return;
      }

      if (breakdown.planned_working_days === 0) {
        setSaveError({ message: lang === 'vi' ? 'Không có ngày làm việc thực tế trong khoảng thời gian đã chọn.' : '선택한 기간에 실제 근무 가능한 날짜가 없습니다.' });
        return;
      }
    }

    try {
      setSaving(true);

      const pWorker = workers.find((w) => w.id === primaryWorkerId) || primaryWorkerObj;
      const allAssigneeIds = [primaryWorkerId, ...supportWorkerIds];

      const assigneesPayload: TaskAssignee[] = [
        {
          worker_id: primaryWorkerId,
          name: pWorker?.name || '',
          country_code: pWorker?.country_code,
          assignment_role: 'PRIMARY',
          allocation_percent: 100,
        },
        ...supportWorkerIds.map((sId) => {
          const sWorker = workers.find((w) => w.id === sId);
          return {
            worker_id: sId,
            name: sWorker?.name || '',
            country_code: sWorker?.country_code,
            assignment_role: 'CO_ASSIGNEE' as const,
            allocation_percent: 0,
          };
        }),
      ];

      const payload: Partial<Task> & Record<string, any> = {
        project_id: projectId,
        task_group_id: taskGroupId,
        worker_name: pWorker?.name || '',
        primary_worker_id: primaryWorkerId,
        pic_worker_id: primaryWorkerId,
        support_worker_ids: supportWorkerIds,
        assignee_ids: allAssigneeIds,
        assignees: assigneesPayload,
        assignee_allocations: assigneesPayload.map((a) => ({
          worker_id: a.worker_id,
          allocation_percent: a.allocation_percent,
        })),
        progress_mode: progressMode,
        availability_policy: 'ANY_AVAILABLE',
        task_name: taskNameInput.trim(),
        schedule_status: scheduleStatus,
        start_date: scheduleStatus === 'UNSCHEDULED' ? null : startDate,
        end_date: scheduleStatus === 'UNSCHEDULED' ? null : endDate,
        source_language: inputLang,
        translation_status: manualLock ? 'MANUAL' : (autoStatus === 'MANUAL' ? 'MANUAL' : 'COMPLETED'),
      };

      if (inputLang === 'ko') {
        payload.task_name_ko = taskNameInput.trim();
        if (targetText.trim()) {
          payload.task_name_vi = targetText.trim();
        } else if (task && task.task_name_vi && targetText === '') {
          payload.task_name_vi = '';
        }
      } else {
        payload.task_name_vi = taskNameInput.trim();
        if (targetText.trim()) {
          payload.task_name_ko = targetText.trim();
        } else if (task && task.task_name_ko && targetText === '') {
          payload.task_name_ko = '';
        }
      }

      await onSave(payload);
      onClose();
    } catch (err: any) {
      setSaveError({ message: err.message || (lang === 'vi' ? 'Lưu không thành công.' : '저장에 실패했습니다.') });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const isEditing = Boolean(task && task.id);
  const isPicChanged = isEditing && initialPrimaryId && primaryWorkerId !== initialPrimaryId;

  return (
    <div
      data-testid="task-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-base">
              {isEditing ? (lang === 'vi' ? 'Chỉnh sửa công việc' : '작업 수정') : (lang === 'vi' ? 'Thêm công việc mới' : '신규 작업 추가')}
            </h3>
          </div>
          <button
            type="button"
            data-testid="task-modal-close-btn"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {saveError && (
          <div
            data-testid="task-save-error"
            className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-bold flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{saveError.message}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Task Group Selection */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {lang === 'vi' ? 'Nhóm công việc' : '공정 대분류'} *
            </label>
            <select
              value={taskGroupId}
              onChange={(e) => setTaskGroupId(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-slate-300 font-semibold text-slate-900 bg-white focus:outline-none focus:border-blue-500"
            >
              {taskGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {lang === 'vi' ? (g.group_name_vi || g.group_name) : (g.group_name_ko || g.group_name)}
                </option>
              ))}
            </select>
          </div>

          {/* V2 RESPONSIBILITY SECTION: PIC & Support */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            {/* PIC (Primary Worker) */}
            <div>
              <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1">
                <UserCheck className="w-4 h-4 text-blue-600" />
                <span>{lang === 'vi' ? 'Người phụ trách chính (PIC) *' : '주 담당자 (PIC) *'}</span>
              </label>
              <select
                data-testid="task-primary-worker-select"
                value={primaryWorkerId}
                onChange={(e) => handlePrimaryChange(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-blue-300 font-bold text-blue-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {activeEditors.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.country_code === 'VN' ? '🇻🇳 베트남' : '🇰🇷 한국'})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                {lang === 'vi' ? '* Lịch làm việc của người phụ trách chính (PIC) sẽ quyết định số ngày làm việc thực tế.' : '* 주 담당자(PIC)의 캘린더를 기준으로 실제 근무일수가 계산됩니다.'}
              </p>
            </div>

            {/* PIC Change Impact Preview Alert */}
            {isPicChanged && (
              <div data-testid="pic-change-alert" className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-[11px] font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {lang === 'vi'
                    ? 'Thay đổi người phụ trách chính (PIC): Lịch làm việc sẽ được tính lại theo PIC mới (Schedule Revision +1).'
                    : '주 담당자(PIC)가 변경됩니다. 근무 캘린더가 새 PIC 기준으로 재계산되며 Schedule Revision(+1)이 적용됩니다.'}
                </span>
              </div>
            )}

            {/* Support Workers */}
            <div>
              <label className="block font-bold text-slate-800 mb-1.5 flex items-center gap-1">
                <Users className="w-4 h-4 text-slate-600" />
                <span>{lang === 'vi' ? 'Người hỗ trợ (Support)' : '지원 담당자 (Support)'}</span>
              </label>

              {/* Support Chips */}
              <div className="space-y-1.5 mb-2">
                {supportWorkerIds.length === 0 ? (
                  <div className="text-[11px] text-slate-400 italic py-1">
                    {lang === 'vi' ? 'Chưa có người hỗ trợ' : '지원 담당자 없음'}
                  </div>
                ) : (
                  supportWorkerIds.map((sId) => {
                    const sWorker = workers.find((w) => w.id === sId);
                    return (
                      <div
                        key={sId}
                        data-testid={`task-support-chip-${sId}`}
                        className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{sWorker?.name || sId}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                            Support
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {sWorker?.country_code === 'VN' ? '🇻🇳 VN' : '🇰🇷 KR'}
                          </span>
                        </div>
                        <button
                          type="button"
                          data-testid={`task-support-remove-${sId}`}
                          onClick={() => handleRemoveSupport(sId)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add Support Selector */}
              {supportWorkerIds.length < 4 && (
                <div className="flex items-center gap-2 pt-1">
                  <select
                    data-testid="task-support-selector"
                    value={selectedSupportToAdd}
                    onChange={(e) => setSelectedSupportToAdd(e.target.value)}
                    className="flex-1 h-9 px-2 rounded-lg border border-slate-300 font-medium text-slate-700 bg-white"
                  >
                    <option value="">{lang === 'vi' ? '+ Chọn người hỗ trợ...' : '+ 지원 담당자 선택...'}</option>
                    {activeEditors
                      .filter((w) => w.id !== primaryWorkerId && !supportWorkerIds.includes(w.id))
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.country_code === 'VN' ? '베트남' : '한국'})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    data-testid="task-add-support-btn"
                    onClick={() => handleAddSupport(selectedSupportToAdd)}
                    disabled={!selectedSupportToAdd}
                    className="h-9 px-3 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{lang === 'vi' ? 'Thêm' : '추가'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Progress Mode Selector */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <label className="block font-bold text-slate-800 mb-1">
              {lang === 'vi' ? 'Phương thức tính tiến độ thực tế' : '실제 공정률 계산 방식'}
            </label>
            <div className="space-y-1.5 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="progress_mode"
                  data-testid="progress-mode-radio"
                  value="AUTO_TIME"
                  checked={progressMode === 'AUTO_TIME'}
                  onChange={() => setProgressMode('AUTO_TIME')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="font-semibold text-slate-800">시간 경과형 (자동 100%)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="progress_mode"
                  value="STATUS_BASED"
                  checked={progressMode === 'STATUS_BASED'}
                  onChange={() => setProgressMode('STATUS_BASED')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="font-semibold text-slate-800">일별 상태 입력형 (COMPLETED)</span>
              </label>
            </div>
          </div>

          {/* Read-only Input Language Label */}
          <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-slate-700 font-bold text-xs flex items-center justify-between">
            <span>{inputLang === 'ko' ? '입력 언어: 한국어' : 'Ngôn ngữ nhập: Tiếng Việt'}</span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">
              {inputLang}
            </span>
          </div>

          {/* Task Name Input */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {t('taskContent')} ({t('originalTag')}) *
            </label>
            <input
              type="text"
              data-testid="task-name-input"
              value={taskNameInput}
              onChange={handleNameChange}
              required
              placeholder={inputLang === 'ko' ? '작업 내용을 입력하세요' : 'Nhập nội dung công việc'}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500 font-medium text-slate-900 bg-white"
            />
          </div>

          {/* Auto Translated Text Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>{t('translatedTextLabel')} ({targetLang.toUpperCase()})</span>
              </label>
              {autoStatus === 'TRANSLATING' && (
                <span className="text-[10px] text-blue-600 font-semibold flex items-center gap-1 animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  {t('translating')}
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                data-testid="task-translated-input"
                value={targetText}
                onChange={handleTargetTextChange}
                placeholder={
                  autoStatus === 'TRANSLATING'
                    ? (lang === 'vi' ? 'Đang dịch...' : '번역 중...')
                    : (targetLang === 'vi' ? 'Bản dịch tự động' : '자동 번역 내용')
                }
                className={`w-full h-10 px-3 pr-20 rounded-lg border font-medium text-slate-900 ${
                  manualLock ? 'border-amber-400 bg-amber-50/30' : 'border-slate-300 bg-slate-50'
                }`}
              />
            </div>
          </div>

          {/* Schedule Status Selection */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <label className="block font-bold text-slate-800">
              {lang === 'vi' ? 'Trạng thái lịch công việc' : '일정 확정 상태'}
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <input
                  type="radio"
                  name="scheduleStatus"
                  data-testid="task-schedule-status-scheduled"
                  value="SCHEDULED"
                  checked={scheduleStatus === 'SCHEDULED'}
                  onChange={() => setScheduleStatus('SCHEDULED')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>{lang === 'vi' ? 'Đã xếp lịch (Có ngày bắt đầu/kết thúc)' : '일정 확정 (시작일/종료일 지정)'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <input
                  type="radio"
                  name="scheduleStatus"
                  data-testid="task-schedule-status-unscheduled"
                  value="UNSCHEDULED"
                  checked={scheduleStatus === 'UNSCHEDULED'}
                  onChange={() => setScheduleStatus('UNSCHEDULED')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>{lang === 'vi' ? 'Chưa xếp lịch (UNSCHEDULED)' : '미정 (UNSCHEDULED)'}</span>
              </label>
            </div>
          </div>

          {/* Date Picker Section */}
          {scheduleStatus === 'SCHEDULED' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {lang === 'vi' ? 'Ngày bắt đầu' : '시작일'} *
                </label>
                <input
                  type="date"
                  data-testid="task-start-date-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 font-semibold text-slate-900 bg-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {lang === 'vi' ? 'Ngày kết thúc' : '종료일'} *
                </label>
                <input
                  type="date"
                  data-testid="task-end-date-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 font-semibold text-slate-900 bg-white"
                />
              </div>
            </div>
          )}

          {/* Working Days Summary */}
          {scheduleStatus === 'SCHEDULED' && startDate && endDate && (
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-blue-900 space-y-1">
              <div className="flex items-center justify-between font-bold text-xs">
                <span>{lang === 'vi' ? 'Số ngày làm việc dự kiến (PIC):' : '주 담당자(PIC) 기준 근무일수:'}</span>
                <span className="text-sm font-extrabold text-blue-700">{breakdown.planned_working_days}일</span>
              </div>
              <div className="text-[11px] text-blue-700 flex flex-wrap gap-x-3 gap-y-1">
                <span>근무일: {breakdown.planned_working_days}일</span>
                <span>주말휴무: {breakdown.excluded_weekly_off_days}일</span>
                <span>공휴일: {breakdown.excluded_public_holiday_days}일</span>
                {breakdown.excluded_leave_days > 0 && <span>개인휴가: {breakdown.excluded_leave_days}일</span>}
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              data-testid="task-cancel-btn"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              {lang === 'vi' ? 'Hủy' : '취소'}
            </button>
            <button
              type="submit"
              data-testid="task-save-btn"
              disabled={saving}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition flex items-center gap-1.5 shadow-xs"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{lang === 'vi' ? 'Đang lưu...' : '저장 중...'}</span>
                </>
              ) : (
                <span>{lang === 'vi' ? 'Lưu' : '저장'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

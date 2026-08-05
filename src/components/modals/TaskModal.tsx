// src/components/modals/TaskModal.tsx
import React, { useState, useEffect } from 'react';
import { Task, Worker, Project, CountryHoliday, CalendarOverride, ProgressMode, AvailabilityPolicy, TaskAssignee } from '../../types';
import { calculateTaskWorkdayBreakdown } from '../../utils/workCalendar';
import { useI18n } from '../../hooks/useI18n';
import { useAutoTranslation } from '../../hooks/useAutoTranslation';
import { X, Sparkles, RefreshCw, Calendar, AlertCircle, Users, Plus, Trash2 } from 'lucide-react';

interface TaskModalProps {
  isOpen: boolean;
  projectId: string;
  project?: Project | null;
  task: Task | null;
  currentWorker: Worker | null;
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
  const [taskNameInput, setTaskNameInput] = useState('');
  const [targetText, setTargetText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Multi-Assignees & Modes State
  const [primaryWorkerId, setPrimaryWorkerId] = useState<string>('');
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [progressMode, setProgressMode] = useState<ProgressMode>('AUTO_TIME');
  const [availabilityPolicy, setAvailabilityPolicy] = useState<AvailabilityPolicy>('ANY_AVAILABLE');
  const [selectedToAdd, setSelectedToAdd] = useState<string>('');

  const targetLang = inputLang === 'ko' ? 'vi' : 'ko';

  const {
    translatedText: autoTranslatedText,
    status: autoStatus,
    setManualText,
  } = useAutoTranslation({
    sourceText: taskNameInput,
    sourceLanguage: inputLang,
    initialTargetText: targetText,
    debounceMs: 700,
  });

  useEffect(() => {
    if (autoStatus === 'TRANSLATING') {
      setTargetText('');
    } else if (autoTranslatedText) {
      setTargetText(autoTranslatedText);
    }
  }, [autoTranslatedText, autoStatus]);

  useEffect(() => {
    const src = currentWorker?.ui_language || (task?.source_language as 'ko' | 'vi') || workerLang;
    setInputLang(src);

    if (task) {
      const initialSourceText = src === 'vi' ? (task.task_name_vi || task.task_name) : (task.task_name_ko || task.task_name);
      const initialTransText = src === 'vi' ? (task.task_name_ko || '') : (task.task_name_vi || '');

      setTaskNameInput(initialSourceText || '');
      setTargetText(initialTransText || '');
      setStartDate(task.start_date || '');
      setEndDate(task.end_date || '');
      setProgressMode(task.progress_mode || 'AUTO_TIME');
      setAvailabilityPolicy(task.availability_policy || 'ANY_AVAILABLE');

      // Initialize Assignees
      let assigneesList: TaskAssignee[] = task.assignees || [];
      if (assigneesList.length === 0) {
        const pObj = workers.find((w) => w.id === task.primary_worker_id || w.id === task.worker_name || w.name === task.worker_name) || currentWorker;
        if (pObj) {
          assigneesList = [{ worker_id: pObj.id, name: pObj.name, assignment_role: 'PRIMARY', allocation_percent: 100 }];
        }
      }

      const pId = task.primary_worker_id || assigneesList.find((a) => a.assignment_role === 'PRIMARY')?.worker_id || assigneesList[0]?.worker_id || currentWorker?.id || '';
      setPrimaryWorkerId(pId);

      const ids = Array.from(new Set(assigneesList.map((a) => a.worker_id)));
      if (pId && !ids.includes(pId)) ids.unshift(pId);
      setSelectedAssigneeIds(ids);

      const allocMap: Record<string, number> = {};
      assigneesList.forEach((a) => {
        allocMap[a.worker_id] = a.allocation_percent;
      });
      setAllocations(allocMap);
    } else {
      const defaultStart = project?.start_date || new Date().toISOString().slice(0, 10);
      const defaultEnd = project?.end_date || defaultStart;
      const initialPrimary = currentWorker?.id || (activeEditors[0]?.id || '');

      setTaskNameInput('');
      setTargetText('');
      setStartDate(defaultStart);
      setEndDate(defaultEnd);
      setProgressMode('AUTO_TIME');
      setAvailabilityPolicy('ANY_AVAILABLE');
      setPrimaryWorkerId(initialPrimary);
      setSelectedAssigneeIds(initialPrimary ? [initialPrimary] : []);
      setAllocations(initialPrimary ? { [initialPrimary]: 100 } : {});
    }
  }, [task, project, isOpen, currentWorker, workers]);

  // Recalculate allocations when assignees change if not explicitly set
  const handleEqualizeAllocations = (ids: string[]) => {
    if (ids.length === 0) return {};
    const base = Math.floor(100 / ids.length);
    const rem = 100 - base * ids.length;
    const newAlloc: Record<string, number> = {};
    ids.forEach((id, idx) => {
      newAlloc[id] = base + (idx === 0 ? rem : 0);
    });
    return newAlloc;
  };

  const handlePrimaryChange = (newId: string) => {
    setPrimaryWorkerId(newId);
    if (!selectedAssigneeIds.includes(newId)) {
      const nextIds = [newId, ...selectedAssigneeIds];
      setSelectedAssigneeIds(nextIds);
      setAllocations(handleEqualizeAllocations(nextIds));
    }
  };

  const handleAddAssignee = (workerId: string) => {
    if (!workerId || selectedAssigneeIds.includes(workerId)) return;
    const nextIds = [...selectedAssigneeIds, workerId];
    setSelectedAssigneeIds(nextIds);
    setAllocations(handleEqualizeAllocations(nextIds));
    setSelectedToAdd('');
  };

  const handleRemoveAssignee = (workerId: string) => {
    if (selectedAssigneeIds.length <= 1) {
      alert(lang === 'vi' ? 'Phải có ít nhất một người phụ trách.' : '최소 한 명 이상의 담당자가 필요합니다.');
      return;
    }
    const nextIds = selectedAssigneeIds.filter((id) => id !== workerId);
    setSelectedAssigneeIds(nextIds);
    if (primaryWorkerId === workerId) {
      setPrimaryWorkerId(nextIds[0]);
    }
    setAllocations(handleEqualizeAllocations(nextIds));
  };

  const handleAllocationChange = (workerId: string, val: number) => {
    setAllocations((prev) => ({
      ...prev,
      [workerId]: val,
    }));
  };

  const totalAllocationSum = selectedAssigneeIds.reduce((sum, id) => sum + (allocations[id] || 0), 0);

  const primaryWorkerObj = workers.find((w) => w.id === primaryWorkerId) || currentWorker;

  const breakdown = calculateTaskWorkdayBreakdown(
    primaryWorkerObj,
    startDate,
    endDate,
    holidays || [],
    overrides || []
  );

  if (!isOpen) return null;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTaskNameInput(e.target.value);
  };

  const handleTargetTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTargetText(val);
    setManualText(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskNameInput.trim()) {
      alert(t('taskSaveFailed'));
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      alert(lang === 'vi' ? 'Ngày kết thúc phải sau ngày bắt đầu.' : '종료일은 시작일 이후여야 합니다.');
      return;
    }

    if (project) {
      if (startDate < project.start_date || endDate > project.end_date) {
        alert(lang === 'vi' ? 'Lịch công việc phải nằm trong thời gian của dự án.' : '작업 일정은 프로젝트 기간 안에서만 설정할 수 있습니다.');
        return;
      }
    }

    if (selectedAssigneeIds.length === 0) {
      alert(lang === 'vi' ? 'Phải chọn ít nhất một người phụ trách.' : '최소 1명 이상의 담당자를 배정해야 합니다.');
      return;
    }

    if (totalAllocationSum !== 100) {
      alert(lang === 'vi' ? 'Tổng tỷ lệ phân công phải bằng 100%.' : '담당 비중의 합계는 반드시 100%여야 합니다.');
      return;
    }

    if (breakdown.has_profile_error) {
      alert(lang === 'vi' ? 'Không thể xác minh thông tin lịch làm việc của nhân viên.' : '작업자 캘린더 정보를 확인할 수 없습니다.');
      return;
    }

    if (breakdown.planned_working_days === 0) {
      alert(lang === 'vi' ? 'Không có ngày làm việc thực tế trong khoảng thời gian đã chọn.' : '선택한 기간에 실제 근무 가능한 날짜가 없습니다.');
      return;
    }

    try {
      setSaving(true);

      const pWorker = workers.find((w) => w.id === primaryWorkerId) || primaryWorkerObj;

      const payload: Partial<Task> & Record<string, any> = {
        project_id: projectId,
        worker_name: pWorker?.name || '',
        primary_worker_id: primaryWorkerId,
        assignee_ids: selectedAssigneeIds,
        assignee_allocations: selectedAssigneeIds.map((id) => ({
          worker_id: id,
          allocation_percent: allocations[id] || 0,
        })),
        progress_mode: progressMode,
        availability_policy: availabilityPolicy,
        task_name: taskNameInput.trim(),
        start_date: startDate,
        end_date: endDate,
        source_language: inputLang,
        translation_status: autoStatus === 'MANUAL' ? 'MANUAL' : 'COMPLETED',
      };

      if (inputLang === 'ko') {
        payload.task_name_ko = taskNameInput.trim();
        payload.task_name_vi = targetText.trim();
      } else {
        payload.task_name_vi = taskNameInput.trim();
        payload.task_name_ko = targetText.trim();
      }

      await onSave(payload);
      onClose();
    } catch (err: any) {
      alert(err.message || t('taskSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div
        data-testid="task-modal"
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150 my-8"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-900 text-sm">
            {task ? t('editTask') : t('addTask')}
          </h3>
          <button
            type="button"
            data-testid="task-close-btn"
            onClick={onClose}
            aria-label={t('cancel')}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Project Period Notice */}
          {project && (
            <div className="bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg text-blue-700 font-bold text-xs flex items-center gap-1.5">
              <Calendar className="w-4 h-4 shrink-0 text-blue-600" />
              <span>
                {lang === 'vi' ? `Thời gian dự án: ${project.start_date} ~ ${project.end_date}` : `프로젝트 기간: ${project.start_date} ~ ${project.end_date}`}
              </span>
            </div>
          )}

          {/* Primary Worker Selection */}
          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span>{lang === 'vi' ? 'Người phụ trách chính (PRIMARY)' : '주 담당자 (Primary Worker)'} *</span>
            </label>
            <select
              data-testid="task-primary-worker-select"
              value={primaryWorkerId}
              onChange={(e) => handlePrimaryChange(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500 font-semibold text-slate-900 bg-white"
            >
              {activeEditors.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.country_code === 'VN' ? '베트남' : '한국'})
                </option>
              ))}
            </select>
          </div>

          {/* Multi Assignees & Allocation Management */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 flex items-center gap-1.5">
                <span>{lang === 'vi' ? 'Danh sách người cùng làm việc & Tỷ lệ' : '담당자 목록 및 업무 비중 분배'}</span>
              </label>
              <button
                type="button"
                onClick={() => setAllocations(handleEqualizeAllocations(selectedAssigneeIds))}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded border border-blue-200"
              >
                {lang === 'vi' ? 'Chia đều %' : '비중 균등 배분'}
              </button>
            </div>

            {/* Assignees Chips & Allocations */}
            <div className="space-y-2">
              {selectedAssigneeIds.map((wId) => {
                const wObj = workers.find((w) => w.id === wId);
                const isPrimary = wId === primaryWorkerId;
                return (
                  <div
                    key={wId}
                    data-testid={`task-assignee-chip-${wId}`}
                    className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${isPrimary ? 'text-blue-700' : 'text-slate-800'}`}>
                        {wObj?.name || wId}
                      </span>
                      {isPrimary && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-extrabold">
                          주 담당자
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">
                        {wObj?.country_code === 'VN' ? '🇻🇳 VN' : '🇰🇷 KR'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={allocations[wId] || 0}
                          onChange={(e) => handleAllocationChange(wId, parseInt(e.target.value) || 0)}
                          className="w-16 h-7 px-2 border border-slate-300 rounded text-center font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                        />
                        <span className="font-bold text-slate-600">%</span>
                      </div>

                      {selectedAssigneeIds.length > 1 && (
                        <button
                          type="button"
                          data-testid={`task-assignee-remove-${wId}`}
                          onClick={() => handleRemoveAssignee(wId)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Additional Assignee Selector */}
            <div className="flex items-center gap-2 pt-1">
              <select
                data-testid="task-assignee-selector"
                value={selectedToAdd}
                onChange={(e) => setSelectedToAdd(e.target.value)}
                className="flex-1 h-9 px-2 rounded-lg border border-slate-300 font-medium text-slate-700 bg-white"
              >
                <option value="">{lang === 'vi' ? '+ Thêm người phụ trách' : '+ 추가 담당자 선택...'}</option>
                {activeEditors
                  .filter((w) => !selectedAssigneeIds.includes(w.id))
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.country_code === 'VN' ? '베트남' : '한국'})
                    </option>
                  ))}
              </select>
              <button
                type="button"
                data-testid="task-add-assignee-btn"
                onClick={() => handleAddAssignee(selectedToAdd)}
                disabled={!selectedToAdd}
                className="h-9 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                <span>{lang === 'vi' ? 'Thêm' : '추가'}</span>
              </button>
            </div>

            {/* Sum validation alert */}
            {totalAllocationSum !== 100 && (
              <div className="text-[11px] font-bold text-red-600 flex items-center gap-1 bg-red-50 p-2 rounded-lg border border-red-200">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {lang === 'vi'
                    ? `Tổng tỷ lệ hiện tại là ${totalAllocationSum}%. Vui lòng điều chỉnh về đúng 100%.`
                    : `현재 담당 비중 합계가 ${totalAllocationSum}%입니다. 100%로 맞춰주세요.`}
                </span>
              </div>
            )}
          </div>

          {/* Mixed Working Day Policy & Progress Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Availability Policy */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <label className="block font-bold text-slate-800 mb-1">
                {lang === 'vi' ? 'Điều kiện làm việc (Lịch hỗn hợp)' : '근무 수행 조건 (혼합 달력)'}
              </label>
              <div className="space-y-1.5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="availability_policy"
                    data-testid="availability-policy-radio"
                    value="ANY_AVAILABLE"
                    checked={availabilityPolicy === 'ANY_AVAILABLE'}
                    onChange={() => setAvailabilityPolicy('ANY_AVAILABLE')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-slate-800">1명 이상 근무 시 수행 (기본)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="availability_policy"
                    value="ALL_REQUIRED"
                    checked={availabilityPolicy === 'ALL_REQUIRED'}
                    onChange={() => setAvailabilityPolicy('ALL_REQUIRED')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-slate-800">모든 담당자 근무일만 수행</span>
                </label>
              </div>
            </div>

            {/* Progress Mode */}
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
          </div>

          {/* Read-only Input Language Label */}
          <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-slate-700 font-bold text-xs flex items-center justify-between">
            <span>{inputLang === 'ko' ? '입력 언어: 한국어' : 'Ngôn ngữ nhập: Tiếng Việt'}</span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">
              {inputLang}
            </span>
          </div>

          {/* Source Text Input */}
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
              className="w-full h-10 px-3 rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500 font-medium text-slate-900 bg-slate-50"
            />
          </div>

          {/* Schedule Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">{t('startDate')} *</label>
              <input
                type="date"
                data-testid="task-start-date-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500 font-medium text-slate-900 bg-white"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">{t('endDate')} *</label>
              <input
                type="date"
                data-testid="task-end-date-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500 font-medium text-slate-900 bg-white"
              />
            </div>
          </div>

          {/* Planned Workday Summary */}
          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-blue-900">
            <div className="flex items-center justify-between font-bold">
              <span>{lang === 'vi' ? 'Số ngày làm việc thực tế:' : '실제 근무 가능 일수:'}</span>
              <span className="text-blue-700 text-sm">{breakdown.planned_working_days} {lang === 'vi' ? 'ngày' : '일'}</span>
            </div>
          </div>

          {/* Submit / Cancel Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              data-testid="task-cancel-btn"
              onClick={onClose}
              className="px-4 h-10 rounded-lg border border-slate-300 hover:bg-slate-50 font-bold text-slate-700"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              data-testid="task-save-btn"
              id="task-submit-btn"
              disabled={saving || totalAllocationSum !== 100}
              className="px-5 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-sm shadow-blue-200"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{t('saving')}</span>
                </>
              ) : (
                <span>{t('save')}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

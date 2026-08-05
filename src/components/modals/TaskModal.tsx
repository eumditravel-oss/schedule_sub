// src/components/modals/TaskModal.tsx
import React, { useState, useEffect } from 'react';
import { Task, Worker, Project, CountryHoliday, CalendarOverride } from '../../types';
import { resolveWorkDayStatus, calculateTaskWorkdayBreakdown } from '../../utils/workCalendar';
import { useI18n } from '../../hooks/useI18n';
import { useAutoTranslation } from '../../hooks/useAutoTranslation';
import { X, Sparkles, RefreshCw, Calendar, AlertCircle } from 'lucide-react';

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
  onSave: (data: Partial<Task>) => Promise<any>;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  projectId,
  project,
  task,
  currentWorker,
  holidays,
  overrides,
  workers,
  onClose,
  onSave,
}) => {
  const { t, lang } = useI18n();

  const workerLang: 'ko' | 'vi' = currentWorker?.ui_language || (lang === 'vi' ? 'vi' : 'ko');
  const [inputLang, setInputLang] = useState<'ko' | 'vi'>(workerLang);
  const [taskNameInput, setTaskNameInput] = useState('');
  const [targetText, setTargetText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);

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
      setProgress(task.progress || 0);
    } else {
      const defaultStart = project?.start_date || new Date().toISOString().slice(0, 10);
      const defaultEnd = project?.end_date || defaultStart;

      setTaskNameInput('');
      setTargetText('');
      setStartDate(defaultStart);
      setEndDate(defaultEnd);
      setProgress(0);
    }
  }, [task, project, isOpen, currentWorker]);

  if (!isOpen) return null;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTaskNameInput(e.target.value);
  };

  const handleTargetTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTargetText(val);
    setManualText(val);
  };

  const currentWorkerName = task ? task.worker_name : currentWorker ? currentWorker.name : '';
  const taskWorker = (workers && workers.find((w) => w.name === currentWorkerName || w.id === currentWorkerName)) || currentWorker;

  const [showExcludedDetail, setShowExcludedDetail] = useState(false);

  const breakdown = calculateTaskWorkdayBreakdown(
    taskWorker,
    startDate,
    endDate,
    holidays || [],
    overrides || []
  );

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

      const workerName = task ? task.worker_name : currentWorker ? currentWorker.name : '';

      const payload: Partial<Task> = {
        project_id: projectId,
        worker_name: workerName,
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
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
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

          {/* Worker Badge */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">{t('worker')}</label>
            <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-800 font-bold">
              {currentWorkerName}
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
              placeholder={t('automaticTranslationPlaceholder')}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 font-medium text-slate-800 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {t('startDate')} *
              </label>
              <input
                type="date"
                data-testid="task-start-date"
                value={startDate}
                min={project?.start_date}
                max={project?.end_date}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full h-9 px-3 rounded-lg border border-slate-300 font-medium text-slate-900"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {t('endDate')} *
              </label>
              <input
                type="date"
                data-testid="task-end-date"
                value={endDate}
                min={startDate || project?.start_date}
                max={project?.end_date}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full h-9 px-3 rounded-lg border border-slate-300 font-medium text-slate-900"
              />
            </div>
          </div>

          {/* Compact Workday Summary */}
          {startDate && endDate && startDate <= endDate && (
            <div data-testid="task-workday-summary" className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-bold text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>
                    {lang === 'vi'
                      ? `${breakdown.calendar_span_days} ngày theo lịch · ${breakdown.planned_working_days} ngày làm việc · Loại trừ ${breakdown.excluded_non_working_days} ngày nghỉ`
                      : `달력 ${breakdown.calendar_span_days}일 · 실근무 ${breakdown.planned_working_days}일 · 휴무 제외 ${breakdown.excluded_non_working_days}일`}
                  </span>
                  <span data-testid="task-calendar-span-days" className="hidden">{breakdown.calendar_span_days}</span>
                  <span data-testid="task-planned-working-days" className="hidden">{breakdown.planned_working_days}</span>
                  <span data-testid="task-excluded-days" className="hidden">{breakdown.excluded_non_working_days}</span>
                </div>
                {breakdown.excluded_non_working_days > 0 && (
                  <button
                    type="button"
                    data-testid="task-toggle-excluded-btn"
                    onClick={() => setShowExcludedDetail(!showExcludedDetail)}
                    className="text-[11px] text-blue-600 hover:underline shrink-0"
                  >
                    {showExcludedDetail ? (lang === 'vi' ? 'Ẩn chi tiết' : '접기') : (lang === 'vi' ? 'Chi tiết ngày nghỉ' : '제외일 상세')}
                  </button>
                )}
              </div>

              {showExcludedDetail && breakdown.excluded_dates_detail.length > 0 && (
                <div className="pt-2 border-t border-slate-200 max-h-32 overflow-y-auto space-y-1 text-[11px] font-medium">
                  {breakdown.excluded_dates_detail.map((item) => (
                    <div key={item.date} className="flex items-center justify-between py-0.5 border-b border-slate-100 last:border-0">
                      <span className="font-bold text-slate-800">{item.date}</span>
                      <span className="text-slate-500">{lang === 'vi' ? item.label_vi : item.label_ko}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              data-testid="task-cancel-btn"
              onClick={onClose}
              className="px-4 h-9 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              data-testid="task-save-btn"
              disabled={saving}
              className="px-4 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-xs flex items-center gap-1.5"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// src/components/modals/ProjectModal.tsx
import React, { useState, useEffect } from 'react';
import { Project, Worker } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { useAutoTranslation } from '../../hooks/useAutoTranslation';
import { X, Sparkles, RefreshCw, AlertTriangle, Calendar, CheckCircle2 } from 'lucide-react';
import { differenceInPureCalendarDays, addPureCalendarDays } from '../../utils/dateUtils';

interface CascadeConfirmDetails {
  old_start_date: string;
  new_start_date: string;
  delta_days: number;
  old_end_date: string;
  new_end_date: string;
  shifted_task_count: number;
  shifted_future_status_count: number;
  preserved_past_status_count: number;
  task_preview: Array<{
    task_id: string;
    task_name: string;
    old_start_date: string;
    new_start_date: string;
    old_end_date: string;
    new_end_date: string;
  }>;
}

interface ProjectModalProps {
  isOpen: boolean;
  project: Project | null;
  currentWorker: Worker | null;
  onClose: () => void;
  onSave: (data: Partial<Project>) => Promise<any>;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  project,
  currentWorker,
  onClose,
  onSave,
}) => {
  const { t, lang } = useI18n();

  const workerLang: 'ko' | 'vi' = currentWorker?.ui_language || (lang === 'vi' ? 'vi' : 'ko');
  const [inputLang, setInputLang] = useState<'ko' | 'vi'>(workerLang);
  const [nameInput, setNameInput] = useState('');
  const [targetText, setTargetText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [cascadeDetails, setCascadeDetails] = useState<CascadeConfirmDetails | null>(null);
  const [pendingPayload, setPendingPayload] = useState<Partial<Project> | null>(null);

  const targetLang = inputLang === 'ko' ? 'vi' : 'ko';

  const {
    translatedText: autoTranslatedText,
    status: autoStatus,
    setManualText,
  } = useAutoTranslation({
    sourceText: nameInput,
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
    const src = currentWorker?.ui_language || (project?.source_language as 'ko' | 'vi') || workerLang;
    setInputLang(src);
    setCascadeDetails(null);
    setPendingPayload(null);

    if (project) {
      const initialSourceText = src === 'vi' ? (project.name_vi || project.name) : (project.name_ko || project.name);
      const initialTransText = src === 'vi' ? (project.name_ko || '') : (project.name_vi || '');

      setNameInput(initialSourceText || '');
      setTargetText(initialTransText || '');
      setStartDate(project.start_date || '');
      setEndDate(project.end_date || '');
      setProgress(project.progress || 0);
    } else {
      const todayStr = new Date().toISOString().slice(0, 10);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const futureStr = futureDate.toISOString().slice(0, 10);

      setNameInput('');
      setTargetText('');
      setStartDate(todayStr);
      setEndDate(futureStr);
      setProgress(0);
    }
  }, [project, isOpen, currentWorker]);

  if (!isOpen) return null;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNameInput(e.target.value);
  };

  const handleTargetTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTargetText(val);
    setManualText(val);
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (project && project.start_date && val !== project.start_date) {
      const delta = differenceInPureCalendarDays(val, project.start_date);
      const autoEnd = addPureCalendarDays(project.end_date, delta);
      setEndDate(autoEnd);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) {
      alert(t('projectSaveFailed'));
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      alert(lang === 'vi' ? 'Ngày kết thúc phải sau ngày bắt đầu.' : '종료일은 시작일 이후여야 합니다.');
      return;
    }

    try {
      setSaving(true);

      const payload: Partial<Project> = {
        name: nameInput.trim(),
        start_date: startDate,
        end_date: endDate,
        source_language: inputLang,
        translation_status: autoStatus === 'MANUAL' ? 'MANUAL' : 'COMPLETED',
      };

      if (inputLang === 'ko') {
        payload.name_ko = nameInput.trim();
        payload.name_vi = targetText.trim();
      } else {
        payload.name_vi = nameInput.trim();
        payload.name_ko = targetText.trim();
      }

      setPendingPayload(payload);

      const res: any = await onSave(payload);
      if (res && res.error && res.error.code === 'PROJECT_SCHEDULE_CASCADE_CONFIRMATION_REQUIRED') {
        setCascadeDetails(res.error.details);
        return;
      }
      if (res && res.error) {
        alert(res.error.message);
        return;
      }

      onClose();
    } catch (err: any) {
      if (err && err.code === 'PROJECT_SCHEDULE_CASCADE_CONFIRMATION_REQUIRED' && err.details) {
        setCascadeDetails(err.details);
      } else {
        console.error(err);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmCascade = async () => {
    if (!pendingPayload) return;
    try {
      setSaving(true);
      const res: any = await onSave({
        ...pendingPayload,
        confirm_schedule_cascade: true,
      });

      if (res && res.error) {
        alert(res.error.message);
        return;
      }

      const cascadeData = res?.schedule_cascade || res?.data?.schedule_cascade;
      const count = cascadeData?.shifted_task_count ?? cascadeDetails?.shifted_task_count ?? 0;
      const delta = cascadeData?.delta_days ?? cascadeDetails?.delta_days ?? 0;

      if (count > 0) {
        if (lang === 'vi') {
          const dir = delta >= 0 ? `lùi ${delta}` : `sớm ${Math.abs(delta)}`;
          alert(`Dự án và lịch của ${count} công việc liên quan đã được ${dir} ngày.`);
        } else {
          const dir = delta >= 0 ? `${delta}일 뒤로` : `${Math.abs(delta)}일 앞으로`;
          alert(`프로젝트와 연결된 ${count}개 작업 일정이 ${dir} 이동되었습니다.`);
        }
      } else {
        alert(lang === 'vi' ? 'Lịch dự án đã được thay đổi. Không có công việc liên quan.' : '프로젝트 일정이 변경되었습니다. 연결된 작업은 없습니다.');
      }

      onClose();
    } catch (err: any) {
      alert(err.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      {cascadeDetails ? (
        /* Schedule Shift Cascade Confirmation Modal */
        <div
          data-testid="cascade-confirm-modal"
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-amber-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-amber-100 bg-amber-50/80">
            <div className="flex items-center gap-2 text-amber-900 font-extrabold text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>{lang === 'vi' ? 'Xác nhận thay đổi lịch dự án' : '프로젝트 일정 변경 안내'}</span>
            </div>
            <button
              type="button"
              data-testid="cascade-close-btn"
              onClick={() => setCascadeDetails(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4 text-xs">
            <p className="font-semibold text-slate-800 leading-relaxed bg-amber-50/50 p-3 rounded-xl border border-amber-100">
              {lang === 'vi'
                ? 'Dự án là lịch trình cấp cao nhất, do đó lịch của các công việc liên quan cũng sẽ được di chuyển tương ứng.'
                : '프로젝트는 상위 일정이므로 연결된 작업 일정도 동일한 일수만큼 이동합니다.'}
            </p>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Ngày bắt đầu' : '시작일 변경'}</span>
                <span className="font-bold text-slate-900">{cascadeDetails.old_start_date} → {cascadeDetails.new_start_date}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Số ngày di chuyển' : '이동 일수'}</span>
                <span className="font-extrabold text-blue-600">
                  {cascadeDetails.delta_days >= 0 ? `+${cascadeDetails.delta_days}` : cascadeDetails.delta_days}{lang === 'vi' ? ' ngày' : '일'}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Ngày kết thúc dự án' : '프로젝트 종료일'}</span>
                <span className="font-bold text-slate-900">{cascadeDetails.old_end_date} → {cascadeDetails.new_end_date}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-bold">{lang === 'vi' ? 'Công việc tự động đổi' : '자동 변경 대상'}</span>
                <span className="font-bold text-emerald-600">{cascadeDetails.shifted_task_count}{lang === 'vi' ? ' công việc' : '개 작업'}</span>
              </div>
            </div>

            {/* Shifted Details Counts */}
            <div className="text-[11px] text-slate-600 space-y-1 bg-slate-100/70 p-2.5 rounded-lg">
              <div>• {lang === 'vi' ? 'Lịch công việc:' : '작업 일정:'} <strong className="text-slate-900">{cascadeDetails.shifted_task_count}</strong>개</div>
              <div>• {lang === 'vi' ? 'Trạng thái hàng ngày tương lai:' : '미래 일별 상태:'} <strong className="text-blue-700">{cascadeDetails.shifted_future_status_count}</strong>개</div>
              <div>• {lang === 'vi' ? 'Lịch sử tiến độ quá khứ:' : '과거 진행기록:'} <strong className="text-emerald-700">{cascadeDetails.preserved_past_status_count}</strong>개 유지</div>
            </div>

            {/* Task Preview (Min 5 items preview) */}
            <div>
              <span className="font-bold text-slate-800 block mb-1.5">{lang === 'vi' ? 'Xem trước lịch công việc:' : '작업 일정 변경 미리보기'}</span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg p-2 bg-slate-50">
                {cascadeDetails.task_preview.slice(0, 5).map((tItem) => (
                  <div key={tItem.task_id} className="flex items-center justify-between text-[11px] bg-white p-1.5 rounded border border-slate-100">
                    <span className="font-bold text-slate-900 truncate max-w-[140px]">{tItem.task_name}</span>
                    <span className="text-[10px] font-medium text-slate-600">
                      {tItem.old_start_date.slice(5)} ~ {tItem.old_end_date.slice(5)} → <strong className="text-blue-600">{tItem.new_start_date.slice(5)} ~ {tItem.new_end_date.slice(5)}</strong>
                    </span>
                  </div>
                ))}
                {cascadeDetails.task_preview.length > 5 && (
                  <div className="text-[10px] text-center font-bold text-slate-500 py-1">
                    {lang === 'vi' ? `Và ${cascadeDetails.task_preview.length - 5} công việc khác` : `외 ${cascadeDetails.task_preview.length - 5}개 작업`}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                data-testid="cascade-cancel-btn"
                onClick={() => setCascadeDetails(null)}
                className="flex-1 h-9 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                data-testid="cascade-confirm-btn"
                onClick={handleConfirmCascade}
                disabled={saving}
                className="flex-1 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-xs flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{lang === 'vi' ? 'Thay đổi toàn bộ lịch' : '전체 일정 변경'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Normal Project Edit/Add Modal Form */
        <div
          data-testid="project-modal"
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-900 text-sm">
              {project ? t('editProject') : t('addProject')}
            </h3>
            <button
              type="button"
              data-testid="project-close-btn"
              onClick={onClose}
              aria-label={t('cancel')}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
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
                {t('projectInfo')} ({t('originalTag')}) *
              </label>
              <input
                type="text"
                data-testid="project-name-input"
                value={nameInput}
                onChange={handleNameChange}
                required
                placeholder={inputLang === 'ko' ? '프로젝트명을 입력하세요' : 'Nhập tên dự án'}
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
                data-testid="project-translated-input"
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
                  data-testid="project-start-date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
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
                  data-testid="project-end-date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 font-medium text-slate-900"
                />
              </div>
            </div>



            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                data-testid="project-cancel-btn"
                onClick={onClose}
                className="px-4 h-9 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                data-testid="project-save-btn"
                disabled={saving}
                className="px-4 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-xs flex items-center gap-1.5"
              >
                {saving ? t('saving') : t('save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// src/components/modals/TaskGroupModal.tsx
import React, { useState, useEffect } from 'react';
import { TaskGroup, TaskGroupColorKey, Worker } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { useAutoTranslation } from '../../hooks/useAutoTranslation';
import { X, Sparkles, RefreshCw } from 'lucide-react';

interface TaskGroupModalProps {
  isOpen: boolean;
  group: TaskGroup | null;
  currentWorker: Worker | null;
  onClose: () => void;
  onSave: (data: Partial<TaskGroup>) => Promise<any>;
}

const COLOR_OPTIONS: Array<{ key: TaskGroupColorKey; nameKo: string; nameVi: string; bgClass: string }> = [
  { key: 'BLUE', nameKo: '블루', nameVi: 'Xanh dương', bgClass: 'bg-blue-500' },
  { key: 'GREEN', nameKo: '그린', nameVi: 'Xanh lá', bgClass: 'bg-emerald-500' },
  { key: 'ORANGE', nameKo: '오렌지', nameVi: 'Cam', bgClass: 'bg-amber-500' },
  { key: 'VIOLET', nameKo: '바이올렛', nameVi: 'Tím', bgClass: 'bg-purple-500' },
  { key: 'SLATE', nameKo: '슬레이트', nameVi: 'Xám', bgClass: 'bg-slate-500' },
];

export const TaskGroupModal: React.FC<TaskGroupModalProps> = ({
  isOpen,
  group,
  currentWorker,
  onClose,
  onSave,
}) => {
  const { t, lang } = useI18n();
  const workerLang: 'ko' | 'vi' = currentWorker?.ui_language || (lang === 'vi' ? 'vi' : 'ko');

  const [inputLang, setInputLang] = useState<'ko' | 'vi'>(workerLang);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [targetText, setTargetText] = useState('');
  const [colorKey, setColorKey] = useState<TaskGroupColorKey>('BLUE');
  const [saving, setSaving] = useState(false);
  const [manualLock, setManualLock] = useState(false);

  const targetLang = inputLang === 'ko' ? 'vi' : 'ko';

  const {
    translatedText: autoTranslatedText,
    status: autoStatus,
    setManualText,
    translateNow,
    resetTranslation,
  } = useAutoTranslation({
    sourceText: groupNameInput,
    sourceLanguage: inputLang,
    initialTargetText: targetText,
    debounceMs: 700,
    autoTranslateEnabled: !manualLock,
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
    if (group) {
      const src = currentWorker?.ui_language || (group.source_language as 'ko' | 'vi') || workerLang;
      setInputLang(src);
      const initialSource = src === 'vi' ? (group.group_name_vi || group.group_name) : (group.group_name_ko || group.group_name);
      const initialTarget = src === 'vi' ? (group.group_name_ko || '') : (group.group_name_vi || '');

      setGroupNameInput(initialSource || '');
      setTargetText(initialTarget || '');
      resetTranslation(initialSource || '', initialTarget || '', group.translation_status || 'COMPLETED');
      setColorKey(group.color_key || 'BLUE');
      setManualLock(group.translation_status === 'MANUAL');
    } else {
      setInputLang(workerLang);
      setGroupNameInput('');
      setTargetText('');
      resetTranslation('', '', 'IDLE');
      setColorKey('BLUE');
      setManualLock(false);
    }
  }, [group, isOpen, currentWorker, workerLang, resetTranslation]);

  if (!isOpen) return null;

  const handleSourceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGroupNameInput(e.target.value);
  };

  const handleTargetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTargetText(val);
    setManualText(val);
    setManualLock(true);
  };

  const handleRegenerate = async () => {
    const nextTranslation = await translateNow();
    if (nextTranslation) {
      setTargetText(nextTranslation);
      setManualLock(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupNameInput.trim()) {
      alert(lang === 'vi' ? 'Vui lòng nhập tên nhóm công việc' : '공정 대분류 이름을 입력하세요.');
      return;
    }

    try {
      setSaving(true);
      const payload: Partial<TaskGroup> = {
        group_name: groupNameInput.trim(),
        group_name_ko: inputLang === 'ko' ? groupNameInput.trim() : targetText.trim(),
        group_name_vi: inputLang === 'vi' ? groupNameInput.trim() : targetText.trim(),
        source_language: inputLang,
        translation_status: manualLock ? 'MANUAL' : (autoStatus === 'MANUAL' ? 'MANUAL' : 'COMPLETED'),
        color_key: colorKey,
      };

      await onSave(payload);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Error saving task group');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="task-group-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-900 text-base">
            {group
              ? lang === 'vi'
                ? 'Sửa nhóm công việc'
                : '공정 대분류 수정'
              : lang === 'vi'
              ? 'Thêm nhóm công việc'
              : '공정 대분류 추가'}
          </h3>
          <button
            type="button"
            data-testid="task-group-modal-close-btn"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Source Language Input */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {lang === 'vi' ? 'Tên nhóm công việc *' : '공정 대분류명 *'} ({inputLang.toUpperCase()})
            </label>
            <input
              type="text"
              data-testid="task-group-name-input"
              value={groupNameInput}
              onChange={handleSourceChange}
              required
              placeholder={inputLang === 'ko' ? '예: 기획, 개발, 테스트' : 'VD: Thiết kế, Phát triển, Kiểm thử'}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500 font-medium text-slate-900"
            />
          </div>

          {/* Translation Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>{lang === 'vi' ? 'Bản dịch' : '번역문'} ({targetLang.toUpperCase()})</span>
              </label>
              {autoStatus === 'TRANSLATING' && (
                <span className="text-[10px] text-blue-600 font-semibold flex items-center gap-1 animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  {lang === 'vi' ? 'Đang dịch...' : '자동 번역 중...'}
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                data-testid="task-group-target-text-input"
                value={targetText}
                onChange={handleTargetChange}
                placeholder={manualLock ? (lang === 'vi' ? 'Bản dịch thủ công' : '수동 입력 번역문') : (lang === 'vi' ? 'Tự động dịch...' : '자동 번역 입력...')}
                className={`w-full h-10 px-3 pr-20 rounded-lg border font-medium text-slate-900 ${
                  manualLock ? 'border-amber-400 bg-amber-50/30' : 'border-slate-300 bg-slate-50/50'
                }`}
              />
              <button
                type="button"
                data-testid="task-translation-regenerate-btn"
                onClick={handleRegenerate}
                disabled={!groupNameInput.trim() || autoStatus === 'TRANSLATING'}
                title={lang === 'vi' ? 'Dịch tự động lại' : '자동번역 다시 생성'}
                className="absolute right-1.5 top-1.5 bottom-1.5 px-2 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${autoStatus === 'TRANSLATING' ? 'animate-spin' : ''}`} />
                <span>{t('retryTranslation')}</span>
              </button>
            </div>
          </div>

          {/* Color Key Selector */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {lang === 'vi' ? 'Màu nhãn' : '강조 색상'}
            </label>
            <div className="flex items-center gap-2 pt-1">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  data-testid={`task-group-color-${c.key}`}
                  onClick={() => setColorKey(c.key)}
                  className={`w-8 h-8 rounded-full ${c.bgClass} flex items-center justify-center transition shadow-xs ${
                    colorKey === c.key ? 'ring-2 ring-offset-2 ring-slate-800 scale-110' : 'opacity-70 hover:opacity-100'
                  }`}
                  title={lang === 'vi' ? c.nameVi : c.nameKo}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              data-testid="task-group-cancel-btn"
              onClick={onClose}
              className="px-4 h-9 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              data-testid="task-group-save-btn"
              disabled={saving}
              className="px-4 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-xs"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

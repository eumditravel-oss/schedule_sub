// src/components/modals/TaskModal.tsx
import React, { useState, useEffect } from 'react';
import { Task } from '../../types';
import { getCurrentWorkerName } from '../../services/api';
import { X, Lock } from 'lucide-react';

interface TaskModalProps {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  onSave: (data: Partial<Task>) => Promise<void>;
  task?: Task | null;
  currentWorkerName: string;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  projectId,
  onClose,
  onSave,
  task,
  currentWorkerName,
}) => {
  const [workerName, setWorkerName] = useState('');
  const [taskName, setTaskName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (task) {
      setWorkerName(task.worker_name || currentWorkerName || getCurrentWorkerName());
      setTaskName(task.task_name || '');
      setStartDate(task.start_date || '');
      setEndDate(task.end_date || '');
      setProgress(task.progress ?? 0);
    } else {
      const activeWorker = currentWorkerName || getCurrentWorkerName();
      setWorkerName(activeWorker);
      setTaskName('');
      setStartDate('2026-08-01');
      setEndDate('2026-08-20');
      setProgress(0);
    }
  }, [task, isOpen, currentWorkerName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName || !startDate || !endDate) return;

    if (!currentWorkerName && !getCurrentWorkerName()) {
      alert('현재 접속자를 먼저 선택해 주세요.');
      return;
    }

    setLoading(true);
    try {
      await onSave({
        project_id: projectId,
        worker_name: workerName,
        task_name: taskName,
        start_date: startDate,
        end_date: endDate,
        progress: Number(progress),
      });
      onClose();
    } catch (err: any) {
      alert(err.message || '작업 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-slate-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-850">
          <h2 className="text-lg font-bold text-white">
            {task ? '작업 수정' : '신규 작업 추가'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
              <span>작업 담당자 (자동 설정)</span>
              <Lock className="w-3 h-3 text-slate-500" />
            </label>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-slate-300 font-bold">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>{workerName || '접속자 미선택'}</span>
              <span className="text-[11px] font-normal text-slate-500 ml-auto">
                {task ? '(기존 담당자 유지)' : '(현재 접속자)'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">작업내용 *</label>
            <input
              type="text"
              required
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="예: 프로젝트 상세 화면 개발"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">시작일 *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">종료일 *</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 text-white"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-slate-400">작업 공정률 (%)</label>
              <span className="text-xs font-bold text-blue-400">{progress}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-lg transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow transition disabled:opacity-50"
            >
              {loading ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

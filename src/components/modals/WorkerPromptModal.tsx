// src/components/modals/WorkerPromptModal.tsx
import React, { useState, useEffect } from 'react';
import { Worker } from '../../types';
import { api, setCurrentWorkerName } from '../../services/api';
import { UserCheck, Plus, X } from 'lucide-react';

interface WorkerPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWorker: (name: string) => void;
}

export const WorkerPromptModal: React.FC<WorkerPromptModalProps> = ({
  isOpen,
  onClose,
  onSelectWorker,
}) => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchWorkers = async () => {
    try {
      const data = await api.getWorkers();
      setWorkers(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchWorkers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelect = (name: string) => {
    setCurrentWorkerName(name);
    onSelectWorker(name);
    onClose();
  };

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerName.trim()) return;
    setLoading(true);
    try {
      const created = await api.createWorker(newWorkerName.trim());
      await fetchWorkers();
      handleSelect(created.name);
    } catch (err: any) {
      alert(err.message || '작업자 추가 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-slate-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">접속자 선택</h2>
            <p className="text-xs text-slate-400">이 스케줄을 작성할 작업자를 선택하세요.</p>
          </div>
        </div>

        <div className="space-y-2 mb-6 max-h-60 overflow-y-auto custom-scrollbar">
          {workers.map((w) => (
            <button
              key={w.id}
              onClick={() => handleSelect(w.name)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-900 hover:bg-blue-950/60 border border-slate-700 hover:border-blue-500/50 rounded-xl text-sm font-semibold text-white transition group"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-600/30 text-blue-300 font-bold flex items-center justify-center text-xs">
                  {w.name[0]}
                </div>
                <span>{w.name}</span>
              </div>
              <span className="text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition">선택 →</span>
            </button>
          ))}
        </div>

        {isAdding ? (
          <form onSubmit={handleAddWorker} className="space-y-3 pt-3 border-t border-slate-700">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">신규 작업자 이름</label>
              <input
                type="text"
                required
                autoFocus
                placeholder="예: 홍길동"
                value={newWorkerName}
                onChange={(e) => setNewWorkerName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition"
              >
                {loading ? '추가 중...' : '작업자 추가 및 선택'}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex justify-between items-center pt-3 border-t border-slate-700">
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition"
            >
              <Plus className="w-4 h-4" />
              <span>새 작업자 등록</span>
            </button>

            <button
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 transition"
            >
              나중에 선택 (읽기 전용)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

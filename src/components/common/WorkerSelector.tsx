// src/components/common/WorkerSelector.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Worker } from '../../types';
import { api, getCurrentWorkerName, setCurrentWorkerName } from '../../services/api';
import { ChevronDown, Plus, Check, User } from 'lucide-react';

interface WorkerSelectorProps {
  currentWorker: string;
  onWorkerChange: (name: string) => void;
}

export const WorkerSelector: React.FC<WorkerSelectorProps> = ({ currentWorker, onWorkerChange }) => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchWorkers = async () => {
    try {
      const data = await api.getWorkers();
      setWorkers(data || []);

      const saved = getCurrentWorkerName();
      if (saved && saved !== currentWorker) {
        onWorkerChange(saved);
      }
    } catch (err) {
      console.error('Failed to load workers:', err);
    }
  };

  useEffect(() => {
    fetchWorkers();

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsAdding(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (name: string) => {
    setCurrentWorkerName(name);
    onWorkerChange(name);
    setIsOpen(false);
  };

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerName.trim()) return;
    try {
      const created = await api.createWorker(newWorkerName.trim());
      await fetchWorkers();
      handleSelect(created.name);
      setNewWorkerName('');
      setIsAdding(false);
    } catch (err: any) {
      alert(err.message || '작업자 추가 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="relative inline-block text-left shrink-0" ref={dropdownRef}>
      <div className="flex items-center gap-2">
        <span className="hidden xl:inline text-xs font-medium text-slate-400">현재 접속자</span>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="접속자 선택"
          className="h-9 px-3 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg text-xs font-semibold text-white shadow-sm transition flex items-center gap-2"
        >
          <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
            currentWorker
              ? 'bg-blue-600/30 border border-blue-500/50 text-blue-300'
              : 'bg-slate-700 border border-slate-600 text-slate-400'
          }`}>
            {currentWorker ? currentWorker[0] : <User className="w-3 h-3 text-slate-400" />}
          </div>
          <span className={`font-bold max-w-[90px] truncate ${currentWorker ? 'text-blue-300' : 'text-slate-400'}`}>
            {currentWorker || '선택 필요'}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-52 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden p-1.5 text-slate-200">
          <div className="px-3 py-1.5 border-b border-slate-700/60 mb-1 text-[11px] font-semibold text-slate-400">
            작업자 선택 (현재 접속자)
          </div>

          <div className="max-h-48 overflow-y-auto space-y-0.5 custom-scrollbar">
            {workers.map((w) => {
              const isSelected = currentWorker === w.name;
              return (
                <button
                  key={w.id}
                  onClick={() => handleSelect(w.name)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition ${
                    isSelected ? 'bg-blue-900/60 text-white font-bold' : 'hover:bg-slate-700/60 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <span className="truncate">{w.name}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Add Worker Inline Form */}
          <div className="border-t border-slate-700/60 pt-1.5 mt-1">
            {isAdding ? (
              <form onSubmit={handleAddWorker} className="p-1.5 space-y-2">
                <input
                  type="text"
                  autoFocus
                  placeholder="새 작업자 이름"
                  value={newWorkerName}
                  onChange={(e) => setNewWorkerName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="px-2 py-1 text-[11px] text-slate-400 hover:text-white"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] rounded shadow"
                  >
                    저장
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsAdding(true)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-blue-400 hover:bg-slate-700/50 rounded-lg transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>작업자 추가</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

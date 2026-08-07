// src/components/modals/ProjectWorkforceModal.tsx
import React, { useState, useEffect } from 'react';
import { Project, Worker, ProjectWorkerAllocation, Task } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { X, Users, Plus, Trash2, Save, RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';

interface ProjectWorkforceModalProps {
  isOpen: boolean;
  project: Project | null;
  workers: Worker[];
  tasks?: Task[];
  onClose: () => void;
  onSaved: () => void;
}

export const ProjectWorkforceModal: React.FC<ProjectWorkforceModalProps> = ({
  isOpen,
  project,
  workers,
  tasks = [],
  onClose,
  onSaved,
}) => {
  const { lang } = useI18n();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allocations, setAllocations] = useState<ProjectWorkerAllocation[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedWorkerToAdd, setSelectedWorkerToAdd] = useState<string>('');

  const activeEditors = workers.filter(
    (w) => Number(w.is_active) === 1 && w.access_role === 'EDITOR' && w.name !== 'CEO' && w.name !== 'COO'
  );

  useEffect(() => {
    if (isOpen && project) {
      fetchAllocations();
    }
  }, [isOpen, project]);

  const fetchAllocations = async () => {
    if (!project) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await api.getProjectWorkerAllocations(project.id);
      setAllocations(data || []);
    } catch (err: any) {
      console.error('Failed to fetch project allocations:', err);
      setErrorMsg(err.message || '투입 인력 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !project) return null;

  // Identify workers involved in project tasks (PIC or Support)
  const taskParticipantWorkerIds = new Set<string>();
  const picCountMap = new Map<string, number>();
  const supportCountMap = new Map<string, number>();

  for (const t of tasks) {
    if (t.project_id !== project.id) continue;
    const assignees = t.assignees || [];
    for (const a of assignees) {
      if (a.worker_id) {
        taskParticipantWorkerIds.add(a.worker_id);
        if (a.assignment_role === 'PRIMARY') {
          picCountMap.set(a.worker_id, (picCountMap.get(a.worker_id) || 0) + 1);
        } else {
          supportCountMap.set(a.worker_id, (supportCountMap.get(a.worker_id) || 0) + 1);
        }
      }
    }
    if (t.primary_worker_id) {
      taskParticipantWorkerIds.add(t.primary_worker_id);
      if (!picCountMap.has(t.primary_worker_id)) {
        picCountMap.set(t.primary_worker_id, 1);
      }
    }
  }

  const allocatedWorkerIds = new Set(allocations.map((a) => a.worker_id));
  const unsetParticipantIds = Array.from(taskParticipantWorkerIds).filter((wId) => !allocatedWorkerIds.has(wId));

  const totalPercentSum = allocations.reduce((sum, a) => sum + (Number(a.allocation_percent) || 0), 0);
  const totalFte = (totalPercentSum / 100).toFixed(1);

  const handleAllocationPercentChange = (workerId: string, val: number) => {
    const clamped = Math.max(0, Math.min(100, isNaN(val) ? 0 : val));
    setAllocations((prev) =>
      prev.map((a) => (a.worker_id === workerId ? { ...a, allocation_percent: clamped } : a))
    );
  };

  const handleNoteChange = (workerId: string, noteStr: string) => {
    setAllocations((prev) =>
      prev.map((a) => (a.worker_id === workerId ? { ...a, note: noteStr } : a))
    );
  };

  const handleAddWorker = (workerId: string) => {
    if (!workerId || allocatedWorkerIds.has(workerId)) return;
    const wObj = workers.find((w) => w.id === workerId);
    if (!wObj) return;

    setAllocations((prev) => [
      ...prev,
      {
        id: `pwa_${project.id}_${workerId}`,
        project_id: project.id,
        worker_id: workerId,
        worker_name: wObj.name,
        allocation_percent: 50,
        note: '',
      },
    ]);
    setSelectedWorkerToAdd('');
  };

  const handleRemoveWorker = (workerId: string) => {
    setAllocations((prev) => prev.filter((a) => a.worker_id !== workerId));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setErrorMsg(null);
      await api.updateProjectWorkerAllocations(
        project.id,
        allocations.map((a) => ({
          worker_id: a.worker_id,
          allocation_percent: Number(a.allocation_percent) || 0,
          note: a.note || '',
        }))
      );
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to save project allocations:', err);
      setErrorMsg(err.message || '투입 인력 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs select-none overflow-hidden"
    >
      <div
        data-testid="project-workforce-modal"
        className="w-full max-w-xl max-h-[calc(100dvh-24px)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden my-auto"
      >
        {/* Persistent Modal Header */}
        <header
          data-testid="project-workforce-header"
          className="shrink-0 px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800"
        >
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="font-bold text-base">{project.name_ko || project.name}</h3>
              <p className="text-xs text-slate-400 font-medium">
                {lang === 'vi' ? 'Phân bổ nhân lực dự án' : '프로젝트 투입 인력 관리'}
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="project-workforce-close-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Scrollable Body Container */}
        <div
          data-testid="project-workforce-scroll-body"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 space-y-5 text-xs"
        >
          {/* Summary Metric Header */}
          <div className="flex items-center justify-between p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-blue-900">
            <div>
              <span className="font-bold text-xs block text-slate-700">
                {lang === 'vi' ? 'Quy mô phân bổ kế hoạch' : '계획 투입 규모 (Planned Capacity)'}
              </span>
              <span className="text-[11px] text-blue-700">
                {allocations.length}명 참여 · 총 투입 비율 합계: {totalPercentSum}%
              </span>
            </div>
            <div className="text-right">
              <span className="text-xl font-extrabold text-blue-700">{totalFte} FTE</span>
            </div>
          </div>

          {/* Allocations Table */}
          {loading ? (
            <div className="py-8 text-center text-slate-500 font-medium flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>{lang === 'vi' ? 'Đang tải...' : '투입 인력 정보를 불러오는 중...'}</span>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block font-bold text-slate-800 text-xs">
                {lang === 'vi' ? 'Danh sách nhân sự phân bổ' : '프로젝트 투입 인력 및 비율 (%)'}
              </label>

              {allocations.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 font-medium">
                  {lang === 'vi' ? 'Chưa có thông tin phân bổ nhân lực (Chưa thiết lập)' : '투입률 미설정 (등록된 인력 투입 비율이 없습니다)'}
                </div>
              ) : (
                allocations.map((alloc) => {
                  const wObj = workers.find((w) => w.id === alloc.worker_id);
                  const picCount = picCountMap.get(alloc.worker_id) || 0;
                  const supportCount = supportCountMap.get(alloc.worker_id) || 0;

                  return (
                    <div
                      key={alloc.worker_id}
                      data-testid={`project-allocation-row-${alloc.worker_id}`}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">
                            {wObj?.name || alloc.worker_name || alloc.worker_id}
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {wObj?.country_code === 'VN' ? '🇻🇳 베트남' : '🇰🇷 한국'}
                          </span>
                          {(picCount > 0 || supportCount > 0) && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                              PIC {picCount} · 지원 {supportCount}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              data-testid={`project-allocation-input-${alloc.worker_id}`}
                              value={alloc.allocation_percent}
                              onChange={(e) =>
                                handleAllocationPercentChange(alloc.worker_id, parseInt(e.target.value))
                              }
                              className="w-16 h-8 px-2 border border-slate-300 rounded-lg text-center font-bold text-slate-900 focus:outline-none focus:border-blue-500 bg-white"
                            />
                            <span className="font-bold text-slate-600">%</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveWorker(alloc.worker_id)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded-lg transition"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Note Input */}
                      <input
                        type="text"
                        placeholder={lang === 'vi' ? 'Ghi chú phân bổ...' : '투입 메모 (선택사항)...'}
                        value={alloc.note || ''}
                        onChange={(e) => handleNoteChange(alloc.worker_id, e.target.value)}
                        className="w-full h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white focus:outline-none focus:border-blue-400"
                      />
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Unset Participants Section */}
          {unsetParticipantIds.length > 0 && (
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-amber-900 font-bold text-xs">
                <span className="flex items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>투입률 미설정 참여자 ({unsetParticipantIds.length}명)</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {unsetParticipantIds.map((wId) => {
                  const wObj = workers.find((w) => w.id === wId);
                  const picCount = picCountMap.get(wId) || 0;
                  const supportCount = supportCountMap.get(wId) || 0;
                  return (
                    <div
                      key={wId}
                      className="bg-white px-2.5 py-1 rounded-lg border border-amber-300 flex items-center gap-2 text-xs"
                    >
                      <span className="font-bold text-slate-900">{wObj?.name || wId}</span>
                      <span className="text-[10px] text-amber-700 font-bold">
                        PIC {picCount} · 지원 {supportCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddWorker(wId)}
                        className="text-[10px] font-extrabold text-blue-700 bg-blue-100 hover:bg-blue-200 px-1.5 py-0.5 rounded transition"
                      >
                        + 투입률 설정
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add Worker Selector */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            <select
              value={selectedWorkerToAdd}
              onChange={(e) => setSelectedWorkerToAdd(e.target.value)}
              className="flex-1 h-9 px-3 rounded-lg border border-slate-300 font-medium text-slate-700 bg-white"
            >
              <option value="">{lang === 'vi' ? '+ Thêm nhân sự vào dự án...' : '+ 작업자 추가...'}</option>
              {activeEditors
                .filter((w) => !allocatedWorkerIds.has(w.id))
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.country_code === 'VN' ? '베트남' : '한국'})
                  </option>
                ))}
            </select>
            <button
              type="button"
              data-testid="project-workforce-add-worker"
              onClick={() => handleAddWorker(selectedWorkerToAdd)}
              disabled={!selectedWorkerToAdd}
              className="h-9 px-3 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-1 transition"
            >
              <Plus className="w-4 h-4" />
              <span>{lang === 'vi' ? 'Thêm' : '추가'}</span>
            </button>
          </div>
        </div>

        {/* Persistent Error Banner */}
        {errorMsg && (
          <div className="shrink-0 px-6 py-2.5 bg-red-50 border-t border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Persistent Modal Footer */}
        <footer
          data-testid="project-workforce-footer"
          className="shrink-0 px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-end gap-3 shadow-xs"
        >
          <button
            type="button"
            data-testid="project-workforce-cancel-btn"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          >
            {lang === 'vi' ? 'Hủy' : '취소'}
          </button>
          <button
            type="button"
            data-testid="project-workforce-save-btn"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition flex items-center gap-1.5 shadow-xs"
          >
            {saving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{lang === 'vi' ? 'Đang lưu...' : '저장 중...'}</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>{lang === 'vi' ? 'Lưu' : '저장'}</span>
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
};

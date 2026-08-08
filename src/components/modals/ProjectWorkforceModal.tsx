// src/components/modals/ProjectWorkforceModal.tsx
import React, { useState, useEffect } from 'react';
import { Project, Worker, ProjectWorkerAllocation, Task } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { X, Users, Plus, Trash2, Save, RefreshCw, AlertCircle, Info, CheckCircle2, History, ArrowRight } from 'lucide-react';
import { api } from '../../services/api';
import { getWorkerOverlappingCapacityForProject } from '../../utils/capacityEngine';

interface ProjectWorkforceModalProps {
  isOpen: boolean;
  project: Project | null;
  workers: Worker[];
  tasks?: Task[];
  activeProjects?: Project[];
  onClose: () => void;
  onSaved: () => void;
}

export const ProjectWorkforceModal: React.FC<ProjectWorkforceModalProps> = ({
  isOpen,
  project,
  workers,
  tasks = [],
  activeProjects: passedActiveProjects,
  onClose,
  onSaved,
}) => {
  const { lang } = useI18n();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allocations, setAllocations] = useState<ProjectWorkerAllocation[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedWorkerToAdd, setSelectedWorkerToAdd] = useState<string>('');

  const [activeProjectsList, setActiveProjectsList] = useState<Project[]>(passedActiveProjects || []);
  const [allocationsMap, setAllocationsMap] = useState<Record<string, ProjectWorkerAllocation[]>>({});

  const [showHistoryView, setShowHistoryView] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (isOpen && project) {
      fetchAllocations();
      setShowHistoryView(false);
    }
  }, [isOpen, project]);

  const fetchProjectHistory = async () => {
    if (!project) return;
    try {
      setLoadingHistory(true);
      const data = await api.getProjectAllocationHistory(project.id);
      setHistoryLogs(data || []);
      setShowHistoryView(true);
    } catch (err) {
      console.error('Failed to fetch project allocation history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchAllocations = async () => {
    if (!project) return;
    try {
      setLoading(true);
      setErrorMsg(null);

      const [pAllocData, allProjects, allTasks] = await Promise.all([
        api.getProjectWorkerAllocations(project.id),
        passedActiveProjects ? Promise.resolve(passedActiveProjects) : api.getProjects('ACTIVE'),
        api.getTasks(),
      ]);

      setAllocations(pAllocData || []);
      setActiveProjectsList(allProjects || []);

      // Fetch allocations map for date overlap calculation
      const map: Record<string, ProjectWorkerAllocation[]> = {};
      await Promise.all(
        (allProjects || []).map(async (p) => {
          try {
            const pAlloc = p.id === project.id ? pAllocData : await api.getProjectWorkerAllocations(p.id);
            map[p.id] = pAlloc || [];
          } catch {
            map[p.id] = [];
          }
        })
      );
      setAllocationsMap(map);
    } catch (err: any) {
      console.error('Failed to fetch project allocations:', err);
      setErrorMsg(err.message || (lang === 'vi' ? 'Lỗi tải dữ liệu phân bổ.' : '투입 인력 정보를 불러오지 못했습니다.'));
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

  const handleStepperChange = (workerId: string, delta: number) => {
    setAllocations((prev) =>
      prev.map((a) => {
        if (a.worker_id === workerId) {
          const cur = Number(a.allocation_percent) || 0;
          const nextVal = Math.max(0, Math.min(100, cur + delta));
          return { ...a, allocation_percent: nextVal };
        }
        return a;
      })
    );
  };

  const handleNoteChange = (workerId: string, noteStr: string) => {
    setAllocations((prev) =>
      prev.map((a) => (a.worker_id === workerId ? { ...a, note: noteStr } : a))
    );
  };

  const handleAddWorker = (wId: string) => {
    if (!wId) return;
    const wObj = workers.find((w) => w.id === wId);
    if (!wObj) return;

    if (allocations.some((a) => a.worker_id === wId)) {
      setErrorMsg(lang === 'vi' ? 'Nhân sự này đã được thêm.' : '이미 투입 목록에 존재하는 작업자입니다.');
      return;
    }

    setAllocations((prev) => [
      ...prev,
      {
        id: `temp_${Date.now()}_${wId}`,
        project_id: project.id,
        worker_id: wId,
        worker_name: wObj.name,
        allocation_percent: undefined as any,
        note: '',
      },
    ]);
    setSelectedWorkerToAdd('');
    setErrorMsg(null);
  };

  const handleRemoveWorker = (wId: string) => {
    setAllocations((prev) => prev.filter((a) => a.worker_id !== wId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const unsetAlloc = allocations.find(
      (a) => a.allocation_percent === undefined || a.allocation_percent === null || (a.allocation_percent as any) === ''
    );
    if (unsetAlloc) {
      const wObj = workers.find((w) => w.id === unsetAlloc.worker_id);
      const name = wObj?.name || unsetAlloc.worker_name || '작업자';
      setErrorMsg(
        lang === 'vi'
          ? `Vui lòng nhập tỷ lệ phân bổ cho ${name}.`
          : `'${name}' 작업자의 투입 비율을 입력해 주세요. (투입 비율 미설정 저장 불가)`
      );
      return;
    }

    try {
      setSaving(true);
      await api.saveProjectWorkerAllocations(
        project.id,
        allocations.map((a) => ({
          worker_id: a.worker_id,
          allocation_percent: Number(a.allocation_percent),
          note: a.note || '',
        }))
      );
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to save project allocations:', err);
      setErrorMsg(err.message || (lang === 'vi' ? 'Lưu không thành công.' : '투입 인력 저장에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs select-none overflow-hidden">
      <div
        data-testid="project-workforce-modal"
        className="w-full max-w-2xl max-h-[calc(100dvh-24px)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden my-auto"
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
                {lang === 'vi' ? 'Phân bổ nhân lực dự án' : '프로젝트 투입 인력 및 비율 관리'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!showHistoryView ? (
              <button
                type="button"
                onClick={fetchProjectHistory}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                title="프로젝트 투입률 변경 이력 보기"
              >
                <History className="w-3.5 h-3.5 text-blue-400" />
                <span>{loadingHistory ? '...' : lang === 'vi' ? 'Lịch sử' : '변경 이력'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowHistoryView(false)}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>{lang === 'vi' ? 'Quay lại' : '투입 설정으로 돌아가기'}</span>
              </button>
            )}
            <button
              type="button"
              data-testid="project-workforce-close-btn"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Scrollable Body Container */}
        <div
          data-testid="project-workforce-scroll-body"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 space-y-4 text-xs"
        >
          {showHistoryView ? (
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0" />
                <span>본 프로젝트의 투입률 설정 변경 이력 원장입니다. (총 {historyLogs.length}건)</span>
              </div>
              {historyLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-400">기록된 투입률 변경 이력이 없습니다.</div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {historyLogs.map((log) => (
                    <div key={log.id} className="p-3 hover:bg-slate-50 transition flex items-center justify-between text-xs gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{log.worker_name || log.worker_id}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                            {log.change_type}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {log.changed_at} · {log.changed_by_name || 'System'} ({log.source || 'MANUAL'})
                        </div>
                      </div>
                      <div className="font-bold flex items-center gap-1.5 shrink-0">
                        <span className="text-slate-500">{log.old_allocation_percent !== null ? `${log.old_allocation_percent}%` : '없음'}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="text-blue-700">{log.new_allocation_percent !== null ? `${log.new_allocation_percent}%` : '삭제'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <React.Fragment>
              {/* Top Explanatory Banner Notice */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-xs">
                {lang === 'vi'
                  ? 'Mỗi tỷ lệ là phần trăm thời gian làm việc cá nhân dành cho dự án này.'
                  : '각 비율은 작업자 개인 근무시간 중 이 프로젝트에 투입되는 비율입니다.'}
              </p>
              <p className="text-[11px] text-blue-700">
                {lang === 'vi'
                  ? 'Tổng tỷ lệ của các thành viên không bắt buộc phải bằng 100%.'
                  : '프로젝트 참여자의 비율 합계는 100%일 필요가 없으며, 2.0 FTE(200%) 등도 정상적인 계획 수치입니다.'}
              </p>
            </div>
          </div>

          {/* FTE Summary Metric Banner */}
          <div className="flex items-center justify-between p-3.5 bg-slate-900 text-white rounded-xl shadow-xs">
            <div>
              <span className="font-bold text-xs block text-slate-300">
                {lang === 'vi' ? 'Quy mô phân bổ kế hoạch' : '계획 투입 규모 (Planned Capacity)'}
              </span>
              <span className="text-[11px] text-slate-400">
                {lang === 'vi'
                  ? `Quy mô ${totalFte} FTE · ${allocations.length} nhân sự`
                  : `계획 투입 규모 ${totalFte} FTE · 참여 작업자 ${allocations.length}명`}
              </span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-blue-400">{totalFte} FTE</span>
            </div>
          </div>

          {/* Unset Task Participants Banner */}
          {unsetParticipantIds.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-2">
              <div className="flex items-center justify-between font-bold text-xs">
                <span>
                  {lang === 'vi'
                    ? `Phát hiện ${unsetParticipantIds.length} nhân sự 작업 미설정`
                    : `세부 작업에 참여 중이나 프로젝트 투입 비율이 미설정된 작업자 (${unsetParticipantIds.length}명)`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {unsetParticipantIds.map((wId) => {
                  const wObj = workers.find((w) => w.id === wId);
                  return (
                    <button
                      key={wId}
                      type="button"
                      onClick={() => handleAddWorker(wId)}
                      className="px-2 py-1 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg text-[11px] font-bold text-amber-900 flex items-center gap-1 transition cursor-pointer"
                    >
                      <Plus className="w-3 h-3 text-amber-700" />
                      <span>{wObj?.name || wId}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Allocations Table Header */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 text-xs">
                {lang === 'vi' ? 'Danh sách nhân sự phân bổ' : '프로젝트 투입 인력 및 비율 (%)'}
              </label>

              {/* Add Worker Dropdown */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedWorkerToAdd}
                  onChange={(e) => setSelectedWorkerToAdd(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border border-slate-300 font-semibold text-slate-900 bg-white text-xs"
                >
                  <option value="">{lang === 'vi' ? '-- Chọn nhân sự thêm --' : '-- 추가할 작업자 선택 --'}</option>
                  {workers
                    .filter((w) => Number(w.is_active) === 1 && !allocatedWorkerIds.has(w.id))
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.country_code === 'VN' ? '베트남' : '한국'})
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedWorkerToAdd}
                  onClick={() => handleAddWorker(selectedWorkerToAdd)}
                  className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{lang === 'vi' ? 'Thêm' : '추가'}</span>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-8 text-center text-slate-500 font-medium flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>{lang === 'vi' ? 'Đang tải...' : '투입 인력 정보를 불러오는 중...'}</span>
              </div>
            ) : allocations.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 font-medium">
                {lang === 'vi' ? 'Chưa có thông tin phân bổ nhân lực' : '투입률 미설정 (등록된 인력 투입 비율이 없습니다)'}
              </div>
            ) : (
              allocations.map((alloc) => {
                const wObj = workers.find((w) => w.id === alloc.worker_id);
                const picCount = picCountMap.get(alloc.worker_id) || 0;
                const supportCount = supportCountMap.get(alloc.worker_id) || 0;

                const isUnset =
                  alloc.allocation_percent === undefined ||
                  alloc.allocation_percent === null ||
                  (alloc.allocation_percent as any) === '';
                const currentPercent = isUnset ? 0 : Number(alloc.allocation_percent);

                // Date Overlap Capacity Context Calculation
                const overlapInfo = getWorkerOverlappingCapacityForProject(
                  alloc.worker_id,
                  project.id,
                  project.start_date,
                  project.end_date,
                  activeProjectsList,
                  allocationsMap
                );

                const otherPercent = overlapInfo.otherOverlappingPercent;
                const hasUnsetOther = overlapInfo.hasUnsetOtherProject;
                const totalExpected = currentPercent + otherPercent;
                const remainingAvailable = Math.max(0, 100 - otherPercent);

                return (
                  <div
                    key={alloc.worker_id}
                    data-testid={`project-allocation-row-${alloc.worker_id}`}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5"
                  >
                    {/* Header Row: Worker Name & Delete Button */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">
                          {wObj?.name || alloc.worker_name || alloc.worker_id}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {wObj?.country_code === 'VN' ? '🇻🇳 베트남' : '🇰🇷 한국'}
                        </span>
                        {picCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-extrabold text-[10px]">
                            PIC {picCount}건
                          </span>
                        )}
                        {supportCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-bold text-[10px]">
                            지원 {supportCount}건
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveWorker(alloc.worker_id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title={lang === 'vi' ? 'Xóa khỏi dự án' : '프로젝트 투입 목록에서 삭제'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Date Overlap Capacity Context Panel */}
                    <div className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-600 font-medium">
                          {lang === 'vi'
                            ? `Dự án trùng lặp cùng thời gian: ${otherPercent}%${hasUnsetOther ? ' (+1 chưa 설정)' : ''}`
                            : `다른 겹치는 프로젝트: ${otherPercent}%${hasUnsetOther ? ' (+미설정 1개)' : ''}`}
                        </span>

                        <span className="font-extrabold flex items-center gap-1">
                          <span>{lang === 'vi' ? 'Dự kiến tổng:' : '저장 후 예상 총투입:'}</span>
                          {hasUnsetOther ? (
                            <span className="text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">판단 불가 (미설정 존재)</span>
                          ) : isUnset ? (
                            <span className="text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">투입률 미설정</span>
                          ) : totalExpected > 100 ? (
                            <span className="text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded font-black">
                              {totalExpected}% ({totalExpected - 100}% 과배정)
                            </span>
                          ) : (
                            <span className="text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-black">
                              {totalExpected}% (정상)
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Remaining Capacity Shortcut Button */}
                      {!hasUnsetOther && remainingAvailable > 0 && (
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => handleAllocationPercentChange(alloc.worker_id, remainingAvailable)}
                            className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700 rounded text-[10px] font-extrabold transition cursor-pointer"
                          >
                            {lang === 'vi'
                              ? `Sử dụng ${remainingAvailable}% khả dụng còn lại`
                              : `[남은 가용량 ${remainingAvailable}% 사용]`
                            }
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inputs & Quick Controls */}
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Direct Number Input & Steppers */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStepperChange(alloc.worker_id, -10)}
                          className="w-7 h-8 bg-slate-200 hover:bg-slate-300 rounded-l font-black text-slate-700 transition"
                        >
                          -10
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStepperChange(alloc.worker_id, -5)}
                          className="w-6 h-8 bg-slate-200 hover:bg-slate-300 font-bold text-slate-700 transition"
                        >
                          -5
                        </button>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="미설정"
                          value={isUnset ? '' : alloc.allocation_percent}
                          onChange={(e) =>
                            handleAllocationPercentChange(
                              alloc.worker_id,
                              e.target.value === '' ? (undefined as any) : parseInt(e.target.value, 10)
                            )
                          }
                          className="w-16 h-8 text-center font-black text-slate-900 bg-white border-y border-slate-300 focus:outline-none focus:border-blue-500 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => handleStepperChange(alloc.worker_id, 5)}
                          className="w-6 h-8 bg-slate-200 hover:bg-slate-300 font-bold text-slate-700 transition"
                        >
                          +5
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStepperChange(alloc.worker_id, 10)}
                          className="w-7 h-8 bg-slate-200 hover:bg-slate-300 rounded-r font-black text-slate-700 transition"
                        >
                          +10
                        </button>
                        <span className="font-extrabold text-slate-700 ml-1">%</span>
                      </div>

                      {/* Quick Presets */}
                      <div className="flex items-center gap-1">
                        {[10, 25, 50, 75, 100].map((presetVal) => (
                          <button
                            key={presetVal}
                            type="button"
                            onClick={() => handleAllocationPercentChange(alloc.worker_id, presetVal)}
                            className={`px-2 py-1 rounded text-[11px] font-bold border transition cursor-pointer ${
                              currentPercent === presetVal && !isUnset
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {presetVal}%
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </React.Fragment>
      )}
        </div>

        {/* Persistent Error Banner */}
        {errorMsg && (
          <div
            data-testid="project-workforce-error"
            className="shrink-0 px-6 py-2.5 bg-red-50 border-t border-red-200 text-red-700 text-xs font-bold flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Persistent Footer */}
        <footer
          data-testid="project-workforce-footer"
          className="shrink-0 px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between gap-3"
        >
          <div className="text-[11px] text-slate-500 font-medium">
            {lang === 'vi'
              ? 'Nhấp "Lưu" để cập nhật phân bổ nhân lực.'
              : '투입 비율 변경 후 [저장]을 눌러 서버에 저장하세요.'}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="project-workforce-cancel-btn"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              {lang === 'vi' ? 'Hủy' : '취소'}
            </button>
            <button
              type="button"
              data-testid="project-workforce-save-btn"
              disabled={saving}
              onClick={handleSubmit}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? '...' : lang === 'vi' ? 'Lưu' : '저장'}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

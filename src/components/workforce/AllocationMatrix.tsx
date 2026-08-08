// src/components/workforce/AllocationMatrix.tsx
import React, { useState } from 'react';
import { Project, Worker, ProjectWorkerAllocation, CapacityState } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { calculateWorkerCapacityForRange } from '../../utils/capacityEngine';
import { Save, RefreshCw, AlertTriangle, Check, X, Info } from 'lucide-react';
import { api } from '../../services/api';

interface AllocationMatrixProps {
  workers: Worker[];
  activeProjects: Project[];
  allocationsMap: Record<string, ProjectWorkerAllocation[]>;
  startDateStr: string;
  endDateStr: string;
  onSaved: () => void;
}

export const AllocationMatrix: React.FC<AllocationMatrixProps> = ({
  workers,
  activeProjects,
  allocationsMap: initialAllocationsMap,
  startDateStr,
  endDateStr,
  onSaved,
}) => {
  const { lang } = useI18n();

  // Local draft map: projectId -> array of ProjectWorkerAllocation
  const [draftAllocationsMap, setDraftAllocationsMap] = useState<Record<string, ProjectWorkerAllocation[]>>(
    JSON.parse(JSON.stringify(initialAllocationsMap))
  );

  // Active Editing Cell: { workerId, projectId }
  const [editingCell, setEditingCell] = useState<{ workerId: string; projectId: string } | null>(null);
  const [editingVal, setEditingVal] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Identify modified cells
  const modifiedCells: { projectId: string; workerId: string; before?: number | null; after?: number | null }[] = [];
  for (const prj of activeProjects) {
    const origList = initialAllocationsMap[prj.id] || [];
    const draftList = draftAllocationsMap[prj.id] || [];

    workers.forEach((w) => {
      const origAlloc = origList.find((a) => a.worker_id === w.id);
      const draftAlloc = draftList.find((a) => a.worker_id === w.id);

      const origVal = origAlloc?.allocation_percent;
      const draftVal = draftAlloc?.allocation_percent;

      if (origVal !== draftVal) {
        modifiedCells.push({
          projectId: prj.id,
          workerId: w.id,
          before: origVal,
          after: draftVal,
        });
      }
    });
  }

  const isDirty = modifiedCells.length > 0;

  const handleCellClick = (workerId: string, projectId: string, currentVal?: number | null) => {
    setEditingCell({ workerId, projectId });
    setEditingVal(currentVal !== undefined && currentVal !== null ? String(currentVal) : '');
  };

  const handleCellSave = (workerId: string, projectId: string, valStr: string) => {
    const pAllocations = draftAllocationsMap[projectId] || [];
    const existingIndex = pAllocations.findIndex((a) => a.worker_id === workerId);

    let newVal: number | null = null;
    if (valStr.trim() !== '') {
      const parsed = parseInt(valStr, 10);
      newVal = isNaN(parsed) ? null : Math.max(0, Math.min(100, parsed));
    }

    let nextList: ProjectWorkerAllocation[] = [...pAllocations];

    if (existingIndex >= 0) {
      if (newVal === null) {
        // Remove allocation row if set to empty
        nextList = nextList.filter((a) => a.worker_id !== workerId);
      } else {
        nextList[existingIndex] = { ...nextList[existingIndex], allocation_percent: newVal };
      }
    } else if (newVal !== null) {
      nextList.push({
        id: `temp_${Date.now()}_${workerId}`,
        project_id: projectId,
        worker_id: workerId,
        allocation_percent: newVal,
      });
    }

    setDraftAllocationsMap((prev) => ({ ...prev, [projectId]: nextList }));
    setEditingCell(null);
  };

  const handleResetDraft = () => {
    setDraftAllocationsMap(JSON.parse(JSON.stringify(initialAllocationsMap)));
    setEditingCell(null);
  };

  const handleBatchSave = async () => {
    try {
      setSaving(true);
      // Group dirty cells by projectId
      const projectIdsToSave = new Set(modifiedCells.map((c) => c.projectId));

      await Promise.all(
        Array.from(projectIdsToSave).map(async (pId) => {
          const list = draftAllocationsMap[pId] || [];
          await api.saveProjectWorkerAllocations(
            pId,
            list.map((a) => ({
              worker_id: a.worker_id,
              allocation_percent: Number(a.allocation_percent),
              note: a.note || '',
            }))
          );
        })
      );

      setIsPreviewOpen(false);
      onSaved();
    } catch (e: any) {
      alert(e.message || (lang === 'vi' ? 'Lỗi 저장.' : '저장 중 오류가 발생했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Matrix Header Banner */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            {lang === 'vi'
              ? 'Chỉnh sửa tỷ lệ phân bổ của tất cả dự án trong một bảng duy nhất.'
              : '전체 프로젝트의 투입 비율을 한 화면에서 편리하게 Matrix 편집할 수 있습니다.'}
          </span>
        </div>
        <div className="text-[11px] font-bold text-blue-700">
          {lang === 'vi' ? 'Nhấp vào ô để chỉnh sửa' : '셀을 클릭하여 투입률 수정'}
        </div>
      </div>

      {/* Allocation Matrix Grid */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto select-none">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white border-b border-slate-800 font-bold">
              <th className="p-3 w-40 sticky left-0 bg-slate-900 z-10">{lang === 'vi' ? 'Nhân sự' : '작업자 (Worker)'}</th>
              {activeProjects.map((prj) => (
                <th key={prj.id} className="p-3 text-center min-w-[130px] border-l border-slate-800">
                  <div className="font-extrabold truncate max-w-[150px]">{prj.name_ko || prj.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {prj.start_date} ~ {prj.end_date}
                  </div>
                </th>
              ))}
              <th className="p-3 text-center w-48 border-l border-slate-800 bg-slate-900 sticky right-0 z-10">
                {lang === 'vi' ? 'Công suất đỉnh / Trạng thái' : '선택기간 Peak / 상태'}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {workers
              .filter((w) => Number(w.is_active) === 1)
              .map((worker) => {
                // Compute Peak Capacity for this worker using draftAllocationsMap
                const rangeCap = calculateWorkerCapacityForRange(
                  worker,
                  startDateStr,
                  endDateStr,
                  activeProjects,
                  draftAllocationsMap
                );

                return (
                  <tr key={worker.id} className="hover:bg-slate-50/80 transition">
                    {/* Worker Name Column */}
                    <td className="p-3 font-bold text-slate-900 sticky left-0 bg-white border-r border-slate-200 z-10">
                      <div className="flex items-center gap-1.5">
                        <span>{worker.name}</span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {worker.country_code === 'VN' ? '🇻🇳' : '🇰🇷'}
                        </span>
                      </div>
                    </td>

                    {/* Active Project Cells */}
                    {activeProjects.map((prj) => {
                      const pAllocations = draftAllocationsMap[prj.id] || [];
                      const alloc = pAllocations.find((a) => a.worker_id === worker.id);
                      const isUnset =
                        !alloc ||
                        alloc.allocation_percent === undefined ||
                        alloc.allocation_percent === null ||
                        (alloc.allocation_percent as any) === '';

                      const currentVal = isUnset ? null : Number(alloc.allocation_percent);
                      const isEditing =
                        editingCell?.workerId === worker.id && editingCell?.projectId === prj.id;

                      return (
                        <td
                          key={prj.id}
                          onClick={() => !isEditing && handleCellClick(worker.id, prj.id, currentVal)}
                          className={`p-3 text-center border-l border-slate-200 cursor-pointer transition relative ${
                            isEditing ? 'bg-blue-50 ring-2 ring-blue-500 z-10' : 'hover:bg-blue-50/50'
                          }`}
                        >
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="number"
                                autoFocus
                                min="0"
                                max="100"
                                value={editingVal}
                                onChange={(e) => setEditingVal(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCellSave(worker.id, prj.id, editingVal);
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                className="w-14 h-7 text-center font-black text-slate-900 border border-blue-500 rounded bg-white text-xs focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleCellSave(worker.id, prj.id, editingVal)}
                                className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : isUnset ? (
                            <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-semibold text-[11px]">
                              — (미설정)
                            </span>
                          ) : (
                            <span className="font-extrabold text-slate-900 text-sm">{currentVal}%</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Summary Capacity Column */}
                    <td className="p-3 text-center border-l border-slate-200 sticky right-0 bg-white z-10">
                      <div className="space-y-0.5">
                        <div className="text-sm font-black text-slate-900">
                          Peak {rangeCap.peakPercent}%
                        </div>
                        {rangeCap.status === 'OVERALLOCATED' || rangeCap.overallocatedDaysCount > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-extrabold text-[10px] border border-rose-300">
                            과배정 {rangeCap.overallocatedDaysCount}일
                          </span>
                        ) : rangeCap.status === 'UNKNOWN' || rangeCap.unknownDaysCount > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px] border border-amber-300">
                            미설정 {rangeCap.unknownDaysCount}일
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-300">
                            정상
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Dirty Persistent Action Bar */}
      {isDirty && (
        <div
          data-testid="allocation-matrix-dirty-bar"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 text-xs animate-in slide-in-from-bottom-5 duration-200"
        >
          <span className="font-bold">
            {lang === 'vi'
              ? `Đã thay đổi ${modifiedCells.length} ô phân bổ`
              : `투입률 변경사항 ${modifiedCells.length}건 존재`}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetDraft}
              className="px-3 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-800 font-bold text-slate-300 transition"
            >
              {lang === 'vi' ? 'Hủy' : '취소'}
            </button>
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 font-extrabold text-white flex items-center gap-1 transition shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>{lang === 'vi' ? 'Xem trước & Lưu' : '미리보기 및 저장'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Save Preview Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs">
            <header className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">
                {lang === 'vi' ? 'Xem trước thay đổi phân bổ nhân lực' : '투입률 변경 및 영향 범위 미리보기'}
              </h3>
              <button type="button" onClick={() => setIsPreviewOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="p-5 space-y-3 max-h-80 overflow-y-auto">
              <p className="font-bold text-slate-800">
                {lang === 'vi'
                  ? `Tổng cộng ${modifiedCells.length} ô phân bổ sẽ được cập nhật.`
                  : `총 ${modifiedCells.length}건의 투입률 수정 내역이 서버에 저장됩니다.`}
              </p>

              <div className="space-y-2">
                {modifiedCells.map((c, idx) => {
                  const prj = activeProjects.find((p) => p.id === c.projectId);
                  const w = workers.find((w) => w.id === c.workerId);
                  return (
                    <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900 block">{w?.name}</span>
                        <span className="text-[11px] text-slate-500">{prj?.name}</span>
                      </div>
                      <div className="font-extrabold text-xs">
                        <span className="text-slate-400">{c.before !== undefined && c.before !== null ? `${c.before}%` : '미설정'}</span>
                        <span className="text-slate-400 mx-1.5">→</span>
                        <span className="text-blue-700">{c.after !== undefined && c.after !== null ? `${c.after}%` : '미설정'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <footer className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 font-bold text-slate-700 hover:bg-slate-100"
              >
                {lang === 'vi' ? 'Tiếp tục sửa' : '수정 계속'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleBatchSave}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{saving ? '...' : lang === 'vi' ? 'Lưu ngay' : '저장 확인'}</span>
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

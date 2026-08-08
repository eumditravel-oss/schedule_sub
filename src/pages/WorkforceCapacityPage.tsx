// src/pages/WorkforceCapacityPage.tsx
import React, { useState, useEffect } from 'react';
import { Worker, Project, ProjectWorkerAllocation, Task, CapacityState } from '../types';
import { api } from '../services/api';
import { useI18n } from '../hooks/useI18n';
import { Users, AlertTriangle, CheckCircle2, HelpCircle, Calendar, RefreshCw, Layers, ArrowLeft } from 'lucide-react';
import { ProjectWorkforceModal } from '../components/modals/ProjectWorkforceModal';
import { useNavigate } from 'react-router-dom';

export const WorkforceCapacityPage: React.FC = () => {
  const { lang } = useI18n();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allocationsMap, setAllocationsMap] = useState<Record<string, ProjectWorkerAllocation[]>>({});

  const [filterMode, setFilterMode] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>('TODAY');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('ALL');
  const [selectedModalProject, setSelectedModalProject] = useState<Project | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [wData, pData, tData] = await Promise.all([
        api.getWorkers(),
        api.getProjects(),
        api.getTasks(),
      ]);

      const activeEditors = (wData || []).filter(
        (w) => Number(w.is_active) === 1 && w.access_role === 'EDITOR' && w.name !== 'CEO' && w.name !== 'COO'
      );
      setWorkers(activeEditors);
      setProjects(pData || []);
      setTasks(tData || []);

      // Fetch project worker allocations for all active projects
      const activeProjects = (pData || []).filter((p) => p.status !== 'COMPLETED');
      const allocMap: Record<string, ProjectWorkerAllocation[]> = {};

      await Promise.all(
        activeProjects.map(async (p) => {
          try {
            const pAlloc = await api.getProjectWorkerAllocations(p.id);
            allocMap[p.id] = pAlloc || [];
          } catch (err) {
            allocMap[p.id] = [];
          }
        })
      );

      setAllocationsMap(allocMap);
    } catch (err) {
      console.error('Failed to load capacity board data:', err);
    } finally {
      setLoading(false);
    }
  };

  const activeProjects = projects.filter((p) => p.status !== 'COMPLETED');

  // Compute capacity data per worker
  const workerCapacityList = workers
    .filter((w) => selectedWorkerId === 'ALL' || w.id === selectedWorkerId)
    .map((w) => {
      const workerAllocations: { project: Project; allocation: ProjectWorkerAllocation | null; picCount: number; supportCount: number }[] = [];

      for (const p of activeProjects) {
        const pAllocList = allocationsMap[p.id] || [];
        const alloc = pAllocList.find((a) => a.worker_id === w.id) || null;

        // Check task involvement
        let picCount = 0;
        let supportCount = 0;

        for (const t of tasks) {
          if (t.project_id !== p.id) continue;
          const assignees = t.assignees || [];
          for (const a of assignees) {
            if (a.worker_id === w.id) {
              if (a.assignment_role === 'PRIMARY') picCount++;
              else supportCount++;
            }
          }
          if (t.primary_worker_id === w.id && assignees.length === 0) {
            picCount++;
          }
        }

        if (alloc || picCount > 0 || supportCount > 0) {
          workerAllocations.push({
            project: p,
            allocation: alloc,
            picCount,
            supportCount,
          });
        }
      }

      const hasUnset = workerAllocations.some(
        (item) => !item.allocation || item.allocation.allocation_percent === undefined || item.allocation.allocation_percent === null || (item.allocation.allocation_percent as any) === ''
      );

      const knownTotalSum = workerAllocations.reduce((sum, item) => {
        if (item.allocation && item.allocation.allocation_percent !== undefined && item.allocation.allocation_percent !== null && (item.allocation.allocation_percent as any) !== '') {
          return sum + Number(item.allocation.allocation_percent);
        }
        return sum;
      }, 0);

      let capacityState: CapacityState = 'NORMAL';
      if (knownTotalSum > 100) {
        capacityState = 'OVERALLOCATED';
      } else if (hasUnset) {
        capacityState = 'UNKNOWN';
      }

      return {
        worker: w,
        allocations: workerAllocations,
        hasUnset,
        knownTotalSum,
        capacityState,
      };
    });

  const overallocatedCount = workerCapacityList.filter((item) => item.capacityState === 'OVERALLOCATED').length;
  const unknownCount = workerCapacityList.filter((item) => item.capacityState === 'UNKNOWN').length;
  const normalCount = workerCapacityList.filter((item) => item.capacityState === 'NORMAL').length;

  return (
    <div data-testid="workforce-capacity-page" className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">
      {/* Header */}
      <header className="bg-slate-900 text-white px-6 py-4 border-b border-slate-800 shadow-md">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="back-to-projects-btn"
              onClick={() => navigate('/projects')}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="프로젝트 목록으로 돌아가기"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-400" />
              <div>
                <h1 className="font-extrabold text-lg tracking-tight">
                  {lang === 'vi' ? 'Bảng công suất nhân lực (Workforce Capacity Board)' : '작업자 투입 현황 및 인력 수급 모니터링'}
                </h1>
                <p className="text-xs text-slate-400 font-medium">
                  {lang === 'vi' ? 'Quản lý tỷ lệ phân bổ nhân sự và phát hiện quá tải công việc' : '프로젝트별 인력 투입 비율 (FTE) 및 과배정 실시간 감지'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter Mode */}
            <div className="flex items-center p-0.5 bg-slate-800 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFilterMode('TODAY')}
                className={`px-3 py-1.5 rounded-md transition font-bold ${filterMode === 'TODAY' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                오늘
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('WEEK')}
                className={`px-3 py-1.5 rounded-md transition font-bold ${filterMode === 'WEEK' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                이번 주
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('MONTH')}
                className={`px-3 py-1.5 rounded-md transition font-bold ${filterMode === 'MONTH' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                30일
              </button>
            </div>

            {/* Worker Filter */}
            <select
              value={selectedWorkerId}
              onChange={(e) => setSelectedWorkerId(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-700 bg-slate-800 text-white text-xs font-bold focus:outline-none"
            >
              <option value="ALL">전체 작업자 ({workers.length}명)</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.country_code === 'VN' ? '베트남' : '한국'})
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 font-bold block">전체 모니터링 인원</span>
              <span className="text-2xl font-extrabold text-slate-900">{workers.length}명</span>
            </div>
            <Users className="w-8 h-8 text-blue-600 opacity-80" />
          </div>

          <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs text-emerald-700 font-bold block">정상 적정 배정 (100% 이하)</span>
              <span className="text-2xl font-extrabold text-emerald-700">{normalCount}명</span>
            </div>
            <CheckCircle2 className="w-8 h-8 text-emerald-600 opacity-80" />
          </div>

          <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs text-rose-700 font-bold block">초과 과배정 (100% 초과)</span>
              <span className="text-2xl font-extrabold text-rose-700">{overallocatedCount}명</span>
            </div>
            <AlertTriangle className="w-8 h-8 text-rose-600 opacity-80" />
          </div>

          <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs text-amber-800 font-bold block">투입률 미설정 참여자</span>
              <span className="text-2xl font-extrabold text-amber-800">{unknownCount}명</span>
            </div>
            <HelpCircle className="w-8 h-8 text-amber-600 opacity-80" />
          </div>
        </div>

        {/* Capacity Board */}
        {loading ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center font-bold text-slate-500 flex items-center justify-center gap-3 shadow-2xs">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
            <span>작업자 투입 현황 데이터를 조회 중입니다...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {workerCapacityList.map((item) => {
              const { worker, allocations, hasUnset, knownTotalSum, capacityState } = item;

              let cardBg = 'bg-white border-slate-200';
              let badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
              let badgeText = `정상 (${knownTotalSum}%)`;

              if (capacityState === 'OVERALLOCATED') {
                cardBg = 'bg-rose-50/40 border-rose-300';
                badgeColor = 'bg-rose-100 text-rose-800 border-rose-300';
                badgeText = `과배정 (${knownTotalSum}%)`;
              } else if (capacityState === 'UNKNOWN') {
                cardBg = 'bg-amber-50/40 border-amber-300';
                badgeColor = 'bg-amber-100 text-amber-900 border-amber-300';
                badgeText = `투입률 미설정 (${knownTotalSum}% + 미설정)`;
              }

              return (
                <div
                  key={worker.id}
                  data-testid={`capacity-worker-card-${worker.id}`}
                  className={`p-5 rounded-2xl border shadow-2xs space-y-4 transition ${cardBg}`}
                >
                  {/* Worker Header Row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-900 text-white font-extrabold text-sm flex items-center justify-center shadow-xs">
                        {worker.name.slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-base text-slate-900">{worker.name}</h3>
                          <span className="text-xs text-slate-500 font-bold">
                            {worker.country_code === 'VN' ? '🇻🇳 베트남' : '🇰🇷 한국'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          참여 활성 프로젝트 {allocations.length}개
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Visual Heatmap Bar */}
                      <div className="w-48 bg-slate-200 h-4 rounded-full overflow-hidden flex shadow-inner border border-slate-300">
                        <div
                          style={{ width: `${Math.min(100, knownTotalSum)}%` }}
                          className={`h-full ${capacityState === 'OVERALLOCATED' ? 'bg-rose-600' : hasUnset ? 'bg-amber-500' : 'bg-emerald-600'}`}
                        />
                        {knownTotalSum > 100 && (
                          <div
                            style={{ width: `${Math.min(100, knownTotalSum - 100)}%` }}
                            className="h-full bg-rose-800 animate-pulse"
                          />
                        )}
                      </div>

                      <span className={`px-3 py-1 rounded-lg border text-xs font-extrabold ${badgeColor}`}>
                        {badgeText}
                      </span>
                    </div>
                  </div>

                  {/* Project Allocations Detail Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                    {allocations.length === 0 ? (
                      <div className="col-span-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 font-medium text-xs">
                        현재 참여 중인 활성 프로젝트가 없습니다.
                      </div>
                    ) : (
                      allocations.map((itemObj) => {
                        const { project, allocation, picCount, supportCount } = itemObj;
                        const isUnsetAlloc = !allocation || allocation.allocation_percent === undefined || allocation.allocation_percent === null || (allocation.allocation_percent as any) === '';

                        return (
                          <div
                            key={project.id}
                            data-testid={`worker-allocation-tile-${worker.id}-${project.id}`}
                            onClick={() => setSelectedModalProject(project)}
                            className="p-3 bg-white rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition cursor-pointer space-y-2 group"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-xs text-slate-900 group-hover:text-blue-600 transition truncate max-w-[180px]">
                                {project.name_ko || project.name}
                              </span>
                              <span
                                className={`text-xs font-extrabold px-2 py-0.5 rounded ${
                                  isUnsetAlloc
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {isUnsetAlloc ? '미설정' : `${allocation?.allocation_percent}%`}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                              <span>
                                {project.start_date} ~ {project.end_date}
                              </span>
                              {(picCount > 0 || supportCount > 0) && (
                                <span className="font-bold text-blue-700">
                                  PIC {picCount} · 지원 {supportCount}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Project Workforce Capacity Edit Modal Drilldown */}
      {selectedModalProject && (
        <ProjectWorkforceModal
          isOpen={Boolean(selectedModalProject)}
          project={selectedModalProject}
          workers={workers}
          tasks={tasks}
          onClose={() => setSelectedModalProject(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
};

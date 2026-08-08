// src/pages/WorkforceCapacityPage.tsx
import React, { useState, useEffect } from 'react';
import { Worker, Project, ProjectWorkerAllocation, Task, CountryHoliday, CalendarOverride } from '../types';
import { api } from '../services/api';
import { useI18n } from '../hooks/useI18n';
import { Users, AlertTriangle, CheckCircle2, HelpCircle, Calendar, RefreshCw, ArrowLeft, Grid, LayoutList } from 'lucide-react';
import { ProjectWorkforceModal } from '../components/modals/ProjectWorkforceModal';
import { AllocationMatrix } from '../components/workforce/AllocationMatrix';
import { AllocationHistoryView } from '../components/workforce/AllocationHistoryView';
import { useNavigate } from 'react-router-dom';
import { calculateWorkerCapacityForRange, WorkerRangeCapacityResult } from '../utils/capacityEngine';
import { getKoreaDateString } from '../utils/dateUtils';
import { History } from 'lucide-react';

export const WorkforceCapacityPage: React.FC = () => {
  const { lang } = useI18n();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allocationsMap, setAllocationsMap] = useState<Record<string, ProjectWorkerAllocation[]>>({});
  const [holidays, setHolidays] = useState<CountryHoliday[]>([]);
  const [overrides, setOverrides] = useState<CalendarOverride[]>([]);

  const [viewMode, setViewMode] = useState<'BOARD' | 'MATRIX' | 'HISTORY'>('BOARD');
  const [filterMode, setFilterMode] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>('TODAY');

  const todayStr = getKoreaDateString();
  const [customStartDate, setCustomStartDate] = useState<string>(todayStr);
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    const d = new Date(`${todayStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('ALL');
  const [selectedModalProject, setSelectedModalProject] = useState<Project | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [wData, pData, tData, hData, oData] = await Promise.all([
        api.getWorkers(),
        api.getProjects('ACTIVE'),
        api.getTasks(),
        api.getManualCountryHolidays(),
        api.getCalendarOverrides(),
      ]);

      const activeEditors = (wData || []).filter(
        (w) => Number(w.is_active) === 1 && w.access_role === 'EDITOR' && w.name !== 'CEO' && w.name !== 'COO'
      );
      setWorkers(activeEditors);
      setProjects(pData || []);
      setTasks(tData || []);
      setHolidays(hData || []);
      setOverrides(oData || []);

      // Fetch allocations for active projects
      const allocMap: Record<string, ProjectWorkerAllocation[]> = {};
      await Promise.all(
        (pData || []).map(async (p) => {
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

  const activeProjects = projects.filter((p) => p.status === 'ACTIVE');

  // Determine Range Start & End Dates based on Filter Mode
  let rangeStartDateStr = todayStr;
  let rangeEndDateStr = todayStr;

  if (filterMode === 'TODAY') {
    rangeStartDateStr = todayStr;
    rangeEndDateStr = todayStr;
  } else if (filterMode === 'WEEK') {
    const cur = new Date(`${todayStr}T00:00:00Z`);
    const day = cur.getUTCDay();
    const diffToMon = cur.getUTCDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(cur.setDate(diffToMon));
    const sun = new Date(mon);
    sun.setUTCDate(sun.getUTCDate() + 6);

    rangeStartDateStr = mon.toISOString().slice(0, 10);
    rangeEndDateStr = sun.toISOString().slice(0, 10);
  } else if (filterMode === 'MONTH') {
    rangeStartDateStr = todayStr;
    const endD = new Date(`${todayStr}T00:00:00Z`);
    endD.setUTCDate(endD.getUTCDate() + 30);
    rangeEndDateStr = endD.toISOString().slice(0, 10);
  } else if (filterMode === 'CUSTOM') {
    rangeStartDateStr = customStartDate || todayStr;
    rangeEndDateStr = customEndDate || todayStr;
  }

  // Compute Daily Date-Based Capacity for Each Worker
  const workerCapacityList: { worker: Worker; capacityResult: WorkerRangeCapacityResult }[] = workers
    .filter((w) => selectedWorkerId === 'ALL' || w.id === selectedWorkerId)
    .map((w) => {
      const capacityResult = calculateWorkerCapacityForRange(
        w,
        rangeStartDateStr,
        rangeEndDateStr,
        activeProjects,
        allocationsMap,
        holidays,
        overrides
      );
      return { worker: w, capacityResult };
    });

  const overallocatedWorkerCount = workerCapacityList.filter(
    (item) => item.capacityResult.status === 'OVERALLOCATED' || item.capacityResult.overallocatedDaysCount > 0
  ).length;

  const unknownWorkerCount = workerCapacityList.filter(
    (item) => item.capacityResult.status === 'UNKNOWN' || item.capacityResult.unknownDaysCount > 0
  ).length;

  const normalWorkerCount = workerCapacityList.filter(
    (item) => item.capacityResult.status === 'NORMAL' && item.capacityResult.overallocatedDaysCount === 0 && item.capacityResult.unknownDaysCount === 0
  ).length;

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
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              title="프로젝트 목록으로 돌아가기"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-400" />
              <div>
                <h1 className="font-extrabold text-lg tracking-tight">
                  {lang === 'vi' ? 'Phân bổ nhân lực' : '인력 투입 현황'}
                </h1>
                <p className="text-xs text-slate-400 font-medium">
                  {lang === 'vi' ? 'Kiểm tra tỷ lệ phân bổ và quá tải theo dự án' : '프로젝트별 투입률과 과배정 확인'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Switcher (Board vs Matrix) */}
            <div className="flex items-center p-0.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold">
              <button
                type="button"
                data-testid="view-mode-board-btn"
                onClick={() => setViewMode('BOARD')}
                className={`px-3 py-1.5 rounded-md transition font-bold flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'BOARD' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutList className="w-4 h-4" />
                <span>{lang === 'vi' ? 'Bảng' : '인력 현황 보드'}</span>
              </button>
              <button
                type="button"
                data-testid="view-mode-matrix-btn"
                onClick={() => setViewMode('MATRIX')}
                className={`px-3 py-1.5 rounded-md transition font-bold flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'MATRIX' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Grid className="w-4 h-4" />
                <span>{lang === 'vi' ? 'Ma trận (Matrix)' : '투입률 편집 Matrix'}</span>
              </button>
              <button
                type="button"
                data-testid="view-mode-history-btn"
                onClick={() => setViewMode('HISTORY')}
                className={`px-3 py-1.5 rounded-md transition font-bold flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'HISTORY' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <History className="w-4 h-4" />
                <span>{lang === 'vi' ? 'Lịch sử' : '변경 이력 (History)'}</span>
              </button>
            </div>

            {/* Filter Mode Switcher */}
            <div className="flex items-center p-0.5 bg-slate-800 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFilterMode('TODAY')}
                className={`px-3 py-1.5 rounded-md transition font-bold cursor-pointer ${
                  filterMode === 'TODAY' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {lang === 'vi' ? 'Hôm nay' : '오늘'}
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('WEEK')}
                className={`px-3 py-1.5 rounded-md transition font-bold cursor-pointer ${
                  filterMode === 'WEEK' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {lang === 'vi' ? 'Tuần này' : '이번 주'}
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('MONTH')}
                className={`px-3 py-1.5 rounded-md transition font-bold cursor-pointer ${
                  filterMode === 'MONTH' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {lang === 'vi' ? '30 ngày' : '30일'}
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('CUSTOM')}
                className={`px-3 py-1.5 rounded-md transition font-bold cursor-pointer ${
                  filterMode === 'CUSTOM' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {lang === 'vi' ? 'Tùy chỉnh' : '사용자 지정'}
              </button>
            </div>

            {/* Worker Filter Dropdown */}
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

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Custom Date Range Controls */}
        {filterMode === 'CUSTOM' && (
          <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center gap-4 text-xs font-bold text-slate-700">
            <span>{lang === 'vi' ? 'Khoảng thời gian:' : '사용자 지정 날짜 범위:'}</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-8 px-2.5 rounded-lg border border-slate-300 font-semibold bg-white text-slate-900"
              />
              <span>~</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-8 px-2.5 rounded-lg border border-slate-300 font-semibold bg-white text-slate-900"
              />
            </div>
            <span className="text-[11px] text-slate-500 font-normal">
              ({rangeStartDateStr} ~ {rangeEndDateStr})
            </span>
          </div>
        )}

        {/* Top Summary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-1">
            <div className="text-xs text-slate-500 font-bold flex items-center gap-1.5">
              <Users className="w-4 h-4 text-blue-600" />
              <span>전체 점검 대상</span>
            </div>
            <div className="text-2xl font-black text-slate-900">{workerCapacityList.length}명</div>
          </div>

          <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200 shadow-xs space-y-1">
            <div className="text-xs text-emerald-800 font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>정상 투입</span>
            </div>
            <div className="text-2xl font-black text-emerald-900">{normalWorkerCount}명</div>
          </div>

          <div className="p-4 bg-rose-50/70 rounded-xl border border-rose-200 shadow-xs space-y-1">
            <div className="text-xs text-rose-800 font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>과배정 (Peak &gt; 100%)</span>
            </div>
            <div className="text-2xl font-black text-rose-900">{overallocatedWorkerCount}명</div>
          </div>

          <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200 shadow-xs space-y-1">
            <div className="text-xs text-amber-900 font-bold flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-amber-600" />
              <span>투입률 미설정 항목 보유</span>
            </div>
            <div className="text-2xl font-black text-amber-900">{unknownWorkerCount}명</div>
          </div>
        </div>

        {/* Content View Modes */}
        {loading ? (
          <div className="py-16 text-center text-slate-500 font-medium flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
            <span>{lang === 'vi' ? 'Đang tải dữ liệu...' : '인력 투입 현황 데이터를 분석하는 중...'}</span>
          </div>
        ) : viewMode === 'HISTORY' ? (
          <AllocationHistoryView workers={workers} projects={projects} />
        ) : viewMode === 'MATRIX' ? (
          <AllocationMatrix
            workers={workers}
            activeProjects={activeProjects}
            allocationsMap={allocationsMap}
            startDateStr={rangeStartDateStr}
            endDateStr={rangeEndDateStr}
            onSaved={fetchData}
          />
        ) : (
          /* BOARD MODE */
          <div className="space-y-4">
            {workerCapacityList.map(({ worker, capacityResult }) => {
              const statusColor =
                capacityResult.status === 'OVERALLOCATED' || capacityResult.overallocatedDaysCount > 0
                  ? 'bg-rose-50 border-rose-200'
                  : capacityResult.status === 'UNKNOWN' || capacityResult.unknownDaysCount > 0
                  ? 'bg-amber-50/50 border-amber-200'
                  : 'bg-white border-slate-200';

              return (
                <div
                  key={worker.id}
                  data-testid={`worker-capacity-card-${worker.id}`}
                  className={`p-5 rounded-2xl border shadow-xs transition space-y-4 ${statusColor}`}
                >
                  {/* Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-extrabold text-sm flex items-center justify-center shadow-xs">
                        {worker.name.slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-slate-900 text-base">{worker.name}</h3>
                          <span className="text-xs text-slate-500 font-medium">
                            {worker.country_code === 'VN' ? '🇻🇳 베트남' : '🇰🇷 한국'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          조회 기간: {rangeStartDateStr} ~ {rangeEndDateStr}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Peak Capacity Metric */}
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-500 block">선택기간 Peak</span>
                        <span
                          className={`text-xl font-black ${
                            capacityResult.peakPercent > 100 ? 'text-rose-700' : 'text-slate-900'
                          }`}
                        >
                          {capacityResult.peakPercent}%
                        </span>
                      </div>

                      {/* Status Badge */}
                      {capacityResult.overallocatedDaysCount > 0 ? (
                        <div className="px-3 py-1 rounded-lg bg-rose-100 border border-rose-300 text-rose-800 font-extrabold text-xs flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                          <span>과배정 ({capacityResult.overallocatedDaysCount}일)</span>
                        </div>
                      ) : capacityResult.unknownDaysCount > 0 ? (
                        <div className="px-3 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 font-bold text-xs flex items-center gap-1">
                          <HelpCircle className="w-4 h-4 text-amber-600" />
                          <span>미설정 ({capacityResult.unknownDaysCount}일)</span>
                        </div>
                      ) : (
                        <div className="px-3 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>정상</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Compressed Date Period Cards */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      {lang === 'vi' ? 'Các khoảng thời gian phân bổ thực tế' : '날짜 중첩 기준 실제 투입 구간 (Period Compression)'}
                    </label>

                    {capacityResult.compressedPeriods.length === 0 ? (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 text-xs font-medium">
                        선택한 기간 동안 진행 중인 프로젝트가 없습니다. (0%)
                      </div>
                    ) : (
                      capacityResult.compressedPeriods.map((period, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-3 ${
                            period.status === 'OVERALLOCATED'
                              ? 'bg-rose-100/70 border-rose-300 text-rose-900'
                              : period.status === 'UNKNOWN'
                              ? 'bg-amber-100/70 border-amber-300 text-amber-900'
                              : 'bg-slate-50 border-slate-200 text-slate-900'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 font-bold">
                              <Calendar className="w-3.5 h-3.5 text-slate-600" />
                              <span>
                                {period.startDate} ~ {period.endDate}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2 text-[11px] font-medium">
                              {period.overlappingProjects.map((pInfo) => {
                                const prjObj = activeProjects.find((p) => p.id === pInfo.projectId);
                                return (
                                  <button
                                    key={pInfo.projectId}
                                    type="button"
                                    onClick={() => setSelectedModalProject(prjObj || null)}
                                    className="px-2 py-0.5 rounded bg-white border border-slate-300 hover:bg-blue-50 hover:border-blue-300 font-bold text-slate-800 transition cursor-pointer"
                                  >
                                    {pInfo.projectName}: {pInfo.allocationPercent !== null ? `${pInfo.allocationPercent}%` : '미설정'}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="font-extrabold text-sm block">
                              {period.peakPercent}%
                            </span>
                            <span className="text-[10px] font-bold">
                              {period.status === 'OVERALLOCATED'
                                ? '과배정'
                                : period.status === 'UNKNOWN'
                                ? '미설정 포함'
                                : '정상'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Project Workforce Modal */}
      {selectedModalProject && (
        <ProjectWorkforceModal
          isOpen={Boolean(selectedModalProject)}
          project={selectedModalProject}
          workers={workers}
          tasks={tasks}
          activeProjects={activeProjects}
          onClose={() => setSelectedModalProject(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
};

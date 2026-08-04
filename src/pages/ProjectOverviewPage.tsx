// src/pages/ProjectOverviewPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project, GanttDateColumn } from '../types';
import { api, getCurrentWorkerName } from '../services/api';
import { generateDateColumns, groupColumnsByMonth } from '../utils/dateUtils';
import { ProjectModal } from '../components/modals/ProjectModal';
import { WorkerSelector } from '../components/common/WorkerSelector';
import { WorkerPromptModal } from '../components/modals/WorkerPromptModal';
import { Plus, Calendar, Edit2, Trash2, ChevronRight } from 'lucide-react';

export const ProjectOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Worker State
  const [currentWorker, setCurrentWorker] = useState<string>(getCurrentWorkerName());
  const [isWorkerPromptOpen, setIsWorkerPromptOpen] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Timeline Range
  const [startDate, setStartDate] = useState(new Date('2026-07-01'));
  const [endDate, setEndDate] = useState(new Date('2026-09-30'));

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await api.getProjects();
      setProjects(data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    const saved = getCurrentWorkerName();
    if (saved) setCurrentWorker(saved);
  }, []);

  const dateColumns: GanttDateColumn[] = generateDateColumns(startDate, endDate);
  const monthGroups = groupColumnsByMonth(dateColumns);

  const requireWorkerSelection = (): boolean => {
    const active = currentWorker || getCurrentWorkerName();
    if (!active) {
      setIsWorkerPromptOpen(true);
      return false;
    }
    return true;
  };

  const handleGoToToday = () => {
    const today = new Date();
    const start = new Date(today.getTime() - 15 * 86400000);
    const end = new Date(today.getTime() + 45 * 86400000);
    setStartDate(start);
    setEndDate(end);

    setTimeout(() => {
      if (scrollContainerRef.current) {
        const todayEl = scrollContainerRef.current.querySelector('.today-column');
        if (todayEl) {
          todayEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      }
    }, 100);
  };

  const handleOpenAddModal = () => {
    if (!requireWorkerSelection()) return;
    setSelectedProject(null);
    setIsModalOpen(true);
  };

  const handleSaveProject = async (data: Partial<Project>) => {
    if (!requireWorkerSelection()) return;
    if (selectedProject) {
      await api.updateProject(selectedProject.id, data);
    } else {
      await api.createProject(data);
    }
    await fetchProjects();
  };

  const handleDeleteProject = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!requireWorkerSelection()) return;
    if (!window.confirm(`'${name}' 프로젝트를 삭제하시겠습니까?`)) return;
    await api.deleteProject(id);
    await fetchProjects();
  };

  const handleEditProject = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    if (!requireWorkerSelection()) return;
    setSelectedProject(project);
    setIsModalOpen(true);
  };

  const getGanttSpan = (pStartStr: string, pEndStr: string) => {
    const pStart = new Date(pStartStr).getTime();
    const pEnd = new Date(pEndStr).getTime();
    const firstColDate = dateColumns[0]?.date.getTime() || pStart;

    const startDiffDays = Math.max(0, Math.floor((pStart - firstColDate) / 86400000));
    const durationDays = Math.max(1, Math.floor((pEnd - pStart) / 86400000) + 1);

    return { startIndex: startDiffDays, durationDays };
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* 1. Header Toolbar */}
      <header className="sticky top-0 z-30 bg-slate-850 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold text-lg">
            C
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">CON-COST 개발팀 프로젝트 스케줄러</h1>
            <p className="text-xs text-slate-400">전체 프로젝트 공정 현황 간트 차트</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Worker Selector UI */}
          <WorkerSelector
            currentWorker={currentWorker}
            onWorkerChange={(name) => setCurrentWorker(name)}
          />

          <button
            onClick={handleGoToToday}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg shadow-sm transition"
          >
            <Calendar className="w-4 h-4 text-blue-400" />
            <span>오늘 날짜로 이동</span>
          </button>
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>프로젝트 추가</span>
          </button>
        </div>
      </header>

      {/* 2. Main Gantt Table Container */}
      <main className="flex-1 p-6 overflow-hidden flex flex-col">
        <div
          ref={scrollContainerRef}
          className="flex-1 bg-slate-850 border border-slate-800 rounded-2xl shadow-2xl overflow-auto custom-scrollbar relative"
        >
          <table className="w-full border-collapse text-left min-w-max">
            {/* Header Rows */}
            <thead className="sticky top-0 z-20 bg-slate-800 text-xs uppercase tracking-wider text-slate-300">
              <tr className="border-b border-slate-700/80">
                <th
                  rowSpan={2}
                  className="sticky left-0 z-30 bg-slate-800 px-4 py-3 font-semibold text-slate-200 border-r border-slate-700 shadow-md min-w-[280px] max-w-[280px]"
                >
                  <div className="flex justify-between items-center text-sm font-bold text-white">
                    <span>프로젝트 정보</span>
                    <span className="text-[11px] text-slate-400 font-normal">공정률 / 기간</span>
                  </div>
                </th>
                {monthGroups.map((mg, idx) => (
                  <th
                    key={idx}
                    colSpan={mg.span}
                    className="text-center font-bold py-2 border-r border-slate-700/60 bg-slate-800/90 text-blue-300 text-xs"
                  >
                    {mg.monthStr}
                  </th>
                ))}
              </tr>

              <tr className="border-b border-slate-700">
                {dateColumns.map((col, idx) => (
                  <th
                    key={idx}
                    className={`w-[36px] min-w-[36px] max-w-[36px] text-center py-2 border-r border-slate-700/40 text-[11px] font-medium ${
                      col.isToday
                        ? 'bg-blue-900/60 text-blue-200 font-bold today-column'
                        : col.isWeekend
                        ? 'bg-slate-900/60 text-slate-500'
                        : 'text-slate-400'
                    }`}
                  >
                    <div>{col.dayNum}</div>
                    <div className="text-[10px] scale-90">{col.dayName}</div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-800 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={dateColumns.length + 1} className="py-12 text-center text-slate-400">
                    프로젝트 데이터를 불러오는 중입니다...
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={dateColumns.length + 1} className="py-12 text-center text-slate-400">
                    등록된 프로젝트가 없습니다. 상단의 '+ 프로젝트 추가' 버튼을 눌러보세요.
                  </td>
                </tr>
              ) : (
                projects.map((project) => {
                  const { startIndex, durationDays } = getGanttSpan(project.start_date, project.end_date);

                  return (
                    <tr
                      key={project.id}
                      onClick={() => navigate(`/projects/${project.id}`)}
                      className="hover:bg-slate-800/50 transition cursor-pointer group"
                    >
                      {/* Fixed Left Column */}
                      <td className="sticky left-0 z-10 bg-slate-850 group-hover:bg-slate-800 px-4 py-3.5 border-r border-slate-700 shadow-md min-w-[280px] max-w-[280px] align-middle">
                        <div className="flex items-center justify-between">
                          <div className="pr-2 overflow-hidden">
                            <div className="font-bold text-white group-hover:text-blue-400 transition truncate flex items-center gap-1.5">
                              <span>{project.name}</span>
                              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:translate-x-0.5 transition" />
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                              <span>{project.start_date} ~ {project.end_date}</span>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                              {project.progress}%
                            </span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                              <button
                                onClick={(e) => handleEditProject(e, project)}
                                className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                                title="수정"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => handleDeleteProject(e, project.id, project.name)}
                                className="p-1 hover:bg-red-950 rounded text-slate-400 hover:text-red-400"
                                title="삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Right Gantt Bar Columns */}
                      {dateColumns.map((col, cIdx) => {
                        const isBarStart = cIdx === startIndex;
                        const isInBar = cIdx >= startIndex && cIdx < startIndex + durationDays;

                        return (
                          <td
                            key={cIdx}
                            className={`w-[36px] min-w-[36px] max-w-[36px] p-0 relative border-r border-slate-800/40 align-middle ${
                              col.isToday
                                ? 'bg-blue-950/20'
                                : col.isWeekend
                                ? 'bg-slate-900/40'
                                : ''
                            }`}
                          >
                            {col.isToday && (
                              <div className="absolute inset-y-0 left-1/2 w-0.5 bg-blue-500 z-10 opacity-75 pointer-events-none" />
                            )}

                            {isBarStart && (
                              <div
                                style={{ width: `calc(${durationDays * 36}px - 4px)` }}
                                className="absolute top-1/2 -translate-y-1/2 left-0.5 h-8 bg-slate-700/80 border border-slate-600 rounded-lg overflow-hidden z-10 shadow-md group-hover:border-blue-400 transition"
                              >
                                <div
                                  style={{ width: `${project.progress}%` }}
                                  className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 rounded-l-lg transition-all duration-300"
                                />
                                <div className="absolute inset-0 flex items-center justify-between px-3 text-xs font-bold text-white drop-shadow whitespace-nowrap overflow-hidden">
                                  <span className="truncate">{project.name}</span>
                                  <span className="ml-2 text-[11px] font-semibold text-cyan-200">{project.progress}%</span>
                                </div>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modals */}
      <ProjectModal
        isOpen={isModalOpen}
        project={selectedProject}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProject}
      />

      <WorkerPromptModal
        isOpen={isWorkerPromptOpen}
        onClose={() => setIsWorkerPromptOpen(false)}
        onSelectWorker={(name) => setCurrentWorker(name)}
      />
    </div>
  );
};

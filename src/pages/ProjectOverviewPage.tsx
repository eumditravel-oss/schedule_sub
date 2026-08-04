// src/pages/ProjectOverviewPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project } from '../types';
import { api, getCurrentWorkerName } from '../services/api';
import { calculateVisibleGanttSpan } from '../utils/dateUtils';
import { useGanttDateRange } from '../hooks/useGanttDateRange';
import {
  GANTT_DAY_WIDTH_PX,
  GANTT_BAR_TEXT_THRESHOLD_PX,
  GANTT_BAR_FULL_THRESHOLD_PX,
  PRIMARY_BUTTON_H36_CLASS,
} from '../constants/gantt';
import { ProjectModal } from '../components/modals/ProjectModal';
import { WorkerSelector } from '../components/common/WorkerSelector';
import { WorkerPromptModal } from '../components/modals/WorkerPromptModal';
import { GanttViewControls } from '../components/common/GanttViewControls';
import { Plus, Edit2, Trash2, ChevronRight } from 'lucide-react';

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

  // Date Range Hook
  const {
    viewMode,
    startDate,
    endDate,
    dateColumns,
    monthGroups,
    rangeTitle,
    changeViewMode,
    goPrevious,
    goNext,
    goToday,
  } = useGanttDateRange();

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

  const requireWorkerSelection = (): boolean => {
    const active = currentWorker || getCurrentWorkerName();
    if (!active) {
      setIsWorkerPromptOpen(true);
      return false;
    }
    return true;
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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Row A: Main App Header */}
      <header className="sticky top-0 z-30 bg-slate-850 border-b border-slate-800 px-5 h-16 flex items-center justify-between gap-4 shadow-lg shrink-0 flex-nowrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold text-base shrink-0">
            C
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-white truncate">
              CON-COST 개발팀 프로젝트 스케줄러
            </h1>
            <p className="hidden md:block text-[11px] text-slate-400 truncate">
              전체 프로젝트 공정 현황 간트 차트
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <WorkerSelector
            currentWorker={currentWorker}
            onWorkerChange={(name) => setCurrentWorker(name)}
          />

          <button onClick={handleOpenAddModal} className={PRIMARY_BUTTON_H36_CLASS}>
            <Plus className="w-4 h-4" />
            <span>프로젝트 추가</span>
          </button>
        </div>
      </header>

      {/* Row B: Gantt Toolbar (View Toggles & Date Navigation) */}
      <GanttViewControls
        viewMode={viewMode}
        rangeTitle={rangeTitle}
        onViewModeChange={changeViewMode}
        onPrevious={goPrevious}
        onNext={goNext}
        onToday={goToday}
      />

      {/* Main Gantt Table Area */}
      <main className="flex-1 p-4 2xl:p-6 overflow-hidden flex flex-col">
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
                  className="sticky left-0 z-30 bg-slate-800 px-3 py-2.5 font-semibold text-slate-200 border-r border-slate-700 shadow-md w-[270px] min-w-[270px] max-w-[270px]"
                >
                  <div className="flex justify-between items-center text-xs font-bold text-white">
                    <span>프로젝트 정보</span>
                    <span className="text-[10px] text-slate-400 font-normal">공정률 / 기간</span>
                  </div>
                </th>
                {monthGroups.map((mg, idx) => (
                  <th
                    key={idx}
                    colSpan={mg.span}
                    className="text-center font-bold py-1.5 border-r border-slate-700/60 bg-slate-800/90 text-blue-300 text-xs"
                  >
                    {mg.monthStr}
                  </th>
                ))}
              </tr>

              <tr className="border-b border-slate-700">
                {dateColumns.map((col, idx) => (
                  <th
                    key={idx}
                    style={{ width: `${GANTT_DAY_WIDTH_PX}px`, minWidth: `${GANTT_DAY_WIDTH_PX}px`, maxWidth: `${GANTT_DAY_WIDTH_PX}px` }}
                    className={`text-center py-1.5 border-r border-slate-700/40 text-[11px] font-medium ${
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
                  const { isVisible, startIndex, durationDays } = calculateVisibleGanttSpan(
                    project.start_date,
                    project.end_date,
                    startDate,
                    endDate
                  );
                  const barWidthPx = durationDays * GANTT_DAY_WIDTH_PX - 4;

                  return (
                    <tr
                      key={project.id}
                      onClick={() => navigate(`/projects/${project.id}`)}
                      className="hover:bg-slate-800/50 transition cursor-pointer group"
                    >
                      {/* Fixed Left Column */}
                      <td className="sticky left-0 z-10 bg-slate-850 group-hover:bg-slate-800 px-3 py-3 border-r border-slate-700 shadow-md w-[270px] min-w-[270px] max-w-[270px] align-middle">
                        <div className="flex items-center justify-between">
                          <div className="pr-1 overflow-hidden min-w-0">
                            <div className="font-bold text-white group-hover:text-blue-400 transition truncate flex items-center gap-1 text-xs" title={project.name}>
                              <span className="truncate">{project.name}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            </div>
                            <div className="mt-0.5 text-[10px] text-slate-400 truncate">
                              {project.start_date} ~ {project.end_date}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                              {project.progress}%
                            </span>
                            {/* Actions visible with opacity-60 by default */}
                            <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100 focus:opacity-100 transition">
                              <button
                                type="button"
                                onClick={(e) => handleEditProject(e, project)}
                                aria-label="프로젝트 수정"
                                title="프로젝트 수정"
                                className="w-7 h-7 flex items-center justify-center hover:bg-slate-700 rounded text-slate-300 hover:text-white transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteProject(e, project.id, project.name)}
                                aria-label="프로젝트 삭제"
                                title="프로젝트 삭제"
                                className="w-7 h-7 flex items-center justify-center hover:bg-red-950 rounded text-slate-300 hover:text-red-400 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Right Gantt Bar Columns */}
                      {dateColumns.map((col, cIdx) => {
                        const isBarStart = isVisible && cIdx === startIndex;

                        return (
                          <td
                            key={cIdx}
                            style={{ width: `${GANTT_DAY_WIDTH_PX}px`, minWidth: `${GANTT_DAY_WIDTH_PX}px`, maxWidth: `${GANTT_DAY_WIDTH_PX}px` }}
                            className={`p-0 relative border-r border-slate-800/40 align-middle ${
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
                                title={`${project.name} (${project.start_date} ~ ${project.end_date}) / 공정률 ${project.progress}%`}
                                style={{ width: `${barWidthPx}px` }}
                                className="absolute top-1/2 -translate-y-1/2 left-0.5 h-7 bg-slate-700/80 border border-slate-600 rounded-lg overflow-hidden z-10 shadow-md group-hover:border-blue-400 transition"
                              >
                                <div
                                  style={{ width: `${project.progress}%` }}
                                  className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 rounded-l-lg transition-all duration-300"
                                />
                                {barWidthPx >= GANTT_BAR_TEXT_THRESHOLD_PX && (
                                  <div className="absolute inset-0 flex items-center justify-between px-2 text-xs font-bold text-white drop-shadow whitespace-nowrap overflow-hidden">
                                    <span className="truncate">{project.name}</span>
                                    {barWidthPx >= GANTT_BAR_FULL_THRESHOLD_PX && (
                                      <span className="ml-1 text-[11px] font-semibold text-cyan-200">{project.progress}%</span>
                                    )}
                                  </div>
                                )}
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

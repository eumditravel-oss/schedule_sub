// src/pages/ProjectOverviewPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project } from '../types';
import { api, getCurrentWorkerName } from '../services/api';
import { calculateVisibleGanttSpan } from '../utils/dateUtils';
import { useGanttDateRange } from '../hooks/useGanttDateRange';
import { useI18n } from '../hooks/useI18n';
import { getLocalizedErrorMessage } from '../i18n';
import {
  GANTT_DAY_WIDTH_PX,
  GANTT_BAR_TEXT_THRESHOLD_PX,
  GANTT_BAR_FULL_THRESHOLD_PX,
  PRIMARY_BUTTON_H36_CLASS,
} from '../constants/gantt';
import { ProjectModal } from '../components/modals/ProjectModal';
import { WorkerSelector } from '../components/common/WorkerSelector';
import { LanguageSelector } from '../components/common/LanguageSelector';
import { WorkerPromptModal } from '../components/modals/WorkerPromptModal';
import { GanttViewControls } from '../components/common/GanttViewControls';
import { Plus, Edit2, Trash2, ChevronRight, CheckCircle, Eye } from 'lucide-react';

export const ProjectOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, lang } = useI18n();

  const currentYearStr = new Date().getFullYear().toString();

  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');
  const [selectedYear, setSelectedYear] = useState<string>(currentYearStr);
  const [completedYears, setCompletedYears] = useState<string[]>([currentYearStr]);
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

  const fetchCompletedYears = async () => {
    try {
      const years = await api.getCompletedYears();
      if (years && years.length > 0) {
        setCompletedYears(years);
        if (!years.includes(selectedYear)) {
          setSelectedYear(years[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch completed years:', err);
    }
  };

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await api.getProjects(activeTab, activeTab === 'COMPLETED' ? selectedYear : undefined);
      setProjects(data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompletedYears();
  }, []);

  useEffect(() => {
    fetchProjects();
    const saved = getCurrentWorkerName();
    if (saved) setCurrentWorker(saved);
  }, [activeTab, selectedYear]);

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
    try {
      if (selectedProject) {
        await api.updateProject(selectedProject.id, data);
      } else {
        await api.createProject(data);
      }
      await fetchProjects();
      await fetchCompletedYears();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleDeleteProject = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!requireWorkerSelection()) return;
    if (!window.confirm(`'${name}' ${t('deleteConfirm')}`)) return;
    try {
      await api.deleteProject(id);
      await fetchProjects();
      await fetchCompletedYears();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleEditProject = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    if (!requireWorkerSelection()) return;
    setSelectedProject(project);
    setIsModalOpen(true);
  };

  const handleCompleteProject = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    if (!requireWorkerSelection()) return;
    const displayName = getDisplayName(project);
    const confirmMsg = t('completeConfirmMsg', { name: displayName });
    if (!window.confirm(confirmMsg)) return;

    try {
      await api.completeProject(project.id);
      await fetchProjects();
      await fetchCompletedYears();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const getDisplayName = (project: Project): string => {
    if (lang === 'vi') {
      return project.name_vi || project.name;
    }
    return project.name_ko || project.name;
  };

  const isFallbackOriginal = (project: Project): boolean => {
    if (lang === 'vi') return !project.name_vi;
    return !project.name_ko;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Row A: Main App Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-5 h-16 flex items-center justify-between gap-4 shadow-sm shrink-0 flex-nowrap">
        <div className="flex items-center gap-3.5 min-w-0">
          {/* Integrated Logo Container */}
          <div className="flex items-center shrink-0">
            <img src="/logo3.png" alt="CON-COST × VIETQS" className="h-8 md:h-9 object-contain max-w-[210px]" />
          </div>

          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-slate-900 truncate">
              {t('headerTitle')}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Language Selector */}
          <LanguageSelector />

          {/* Worker Selector */}
          <WorkerSelector
            currentWorker={currentWorker}
            onWorkerChange={(name) => setCurrentWorker(name)}
          />

          {activeTab === 'ACTIVE' && (
            <button onClick={handleOpenAddModal} className={PRIMARY_BUTTON_H36_CLASS}>
              <Plus className="w-4 h-4" />
              <span>{t('addProject')}</span>
            </button>
          )}
        </div>
      </header>

      {/* Row B: Tabs & Gantt Toolbar */}
      <div className="bg-slate-50 border-b border-slate-200 px-5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Tabs */}
        <div className="flex items-center gap-2 py-2">
          <button
            type="button"
            onClick={() => setActiveTab('ACTIVE')}
            className={`h-9 px-4 rounded-lg font-bold text-xs transition ${
              activeTab === 'ACTIVE'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-300'
            }`}
          >
            {t('activeProjectsTab')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('COMPLETED')}
            className={`h-9 px-4 rounded-lg font-bold text-xs transition ${
              activeTab === 'COMPLETED'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-300'
            }`}
          >
            {t('completedProjectsYear', { year: selectedYear })}
          </button>
        </div>

        {/* Dynamic Controls based on tab */}
        {activeTab === 'ACTIVE' ? (
          <div className="flex-1">
            <GanttViewControls
              viewMode={viewMode}
              rangeTitle={rangeTitle}
              onViewModeChange={changeViewMode}
              onPrevious={goPrevious}
              onNext={goNext}
              onToday={goToday}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 py-2 text-xs font-semibold text-slate-700">
            <span>{t('yearSelect')}:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-900 font-bold focus:outline-none focus:border-emerald-500 shadow-sm"
            >
              {completedYears.map((yr) => (
                <option key={yr} value={yr}>
                  {t('yearOption', { year: yr })}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-4 2xl:p-6 overflow-hidden flex flex-col">
        {activeTab === 'ACTIVE' ? (
          /* Gantt Chart Table for Active Projects */
          <div
            ref={scrollContainerRef}
            className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-auto custom-scrollbar relative"
          >
            <table className="w-full border-collapse text-left min-w-max">
              <thead className="sticky top-0 z-20 bg-slate-100 text-xs uppercase tracking-wider text-slate-700">
                <tr className="border-b border-slate-200">
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-30 bg-slate-100 px-3 py-2.5 font-bold text-slate-800 border-r border-slate-200 w-[270px] min-w-[270px] max-w-[270px]"
                  >
                    <div className="flex justify-between items-center text-xs font-bold text-slate-900">
                      <span>{t('projectInfo')}</span>
                      <span className="text-[10px] text-slate-500 font-normal">{t('progress')} / {t('startDate')}</span>
                    </div>
                  </th>
                  {monthGroups.map((mg, idx) => (
                    <th
                      key={idx}
                      colSpan={mg.span}
                      className="text-center font-bold py-1.5 border-r border-slate-200 bg-slate-100 text-blue-700 text-xs"
                    >
                      {mg.monthStr}
                    </th>
                  ))}
                </tr>

                <tr className="border-b border-slate-200">
                  {dateColumns.map((col, idx) => (
                    <th
                      key={idx}
                      style={{ width: `${GANTT_DAY_WIDTH_PX}px`, minWidth: `${GANTT_DAY_WIDTH_PX}px`, maxWidth: `${GANTT_DAY_WIDTH_PX}px` }}
                      className={`text-center py-1.5 border-r border-slate-200 text-[11px] font-medium ${
                        col.isToday
                          ? 'bg-blue-100 text-blue-800 font-bold'
                          : col.isWeekend
                          ? 'bg-slate-50 text-slate-400'
                          : 'bg-white text-slate-600'
                      }`}
                    >
                      <div>{col.dayNum}</div>
                      <div className="text-[10px] scale-90">{col.dayName}</div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={dateColumns.length + 1} className="py-12 text-center text-slate-500 font-medium">
                      {t('loading')}
                    </td>
                  </tr>
                ) : projects.length === 0 ? (
                  <tr>
                    <td colSpan={dateColumns.length + 1} className="py-12 text-center text-slate-500 font-medium">
                      {t('noData')}
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
                    const displayName = getDisplayName(project);
                    const isFallback = isFallbackOriginal(project);

                    return (
                      <tr
                        key={project.id}
                        onClick={() => navigate(`/projects/${project.id}`)}
                        className="hover:bg-blue-50/50 transition cursor-pointer group"
                      >
                        {/* Fixed Left Column */}
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/50 px-3 py-3 border-r border-slate-200 w-[270px] min-w-[270px] max-w-[270px] align-middle">
                          <div className="flex items-center justify-between">
                            <div className="pr-1 overflow-hidden min-w-0">
                              <div className="font-bold text-slate-900 group-hover:text-blue-600 transition truncate flex items-center gap-1 text-xs" title={displayName}>
                                <span className="truncate">{displayName}</span>
                                {isFallback && (
                                  <span className="text-[9px] text-slate-500 bg-slate-100 px-1 rounded shrink-0 border border-slate-200 font-normal">
                                    {t('originalTag')}
                                  </span>
                                )}
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              </div>
                              <div className="mt-0.5 text-[10px] text-slate-500 truncate">
                                {project.start_date} ~ {project.end_date}
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                {project.progress}%
                              </span>
                              <div className="flex items-center gap-0.5 opacity-80 hover:opacity-100 transition">
                                <button
                                  type="button"
                                  onClick={(e) => handleCompleteProject(e, project)}
                                  aria-label={t('completeProject')}
                                  title={t('completeProject')}
                                  className="w-7 h-7 flex items-center justify-center hover:bg-emerald-50 rounded text-emerald-600 transition"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleEditProject(e, project)}
                                  aria-label={t('editProject')}
                                  title={t('editProject')}
                                  className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 rounded text-slate-600 hover:text-blue-600 transition"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteProject(e, project.id, displayName)}
                                  aria-label={t('deleteProject')}
                                  title={t('deleteProject')}
                                  className="w-7 h-7 flex items-center justify-center hover:bg-red-50 rounded text-slate-600 hover:text-red-600 transition"
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
                              className={`p-0 relative border-r border-slate-200 align-middle ${
                                col.isToday
                                  ? 'bg-blue-50/70'
                                  : col.isWeekend
                                  ? 'bg-slate-50/60'
                                  : ''
                              }`}
                            >
                              {col.isToday && (
                                <div className="absolute inset-y-0 left-1/2 w-0.5 bg-blue-500 z-10 opacity-75 pointer-events-none" />
                              )}

                              {isBarStart && (
                                <div
                                  title={`${displayName} (${project.start_date} ~ ${project.end_date}) / ${t('progress')} ${project.progress}%`}
                                  style={{ width: `${barWidthPx}px` }}
                                  className="absolute top-1/2 -translate-y-1/2 left-0.5 h-7 bg-slate-200 border border-slate-300 rounded-lg overflow-hidden z-10 shadow-sm group-hover:border-blue-400 transition"
                                >
                                  <div
                                    style={{ width: `${project.progress}%` }}
                                    className="h-full bg-gradient-to-r from-blue-600 to-cyan-600 rounded-l-lg transition-all duration-300"
                                  />
                                  {barWidthPx >= GANTT_BAR_TEXT_THRESHOLD_PX && (
                                    <div className="absolute inset-0 flex items-center justify-between px-2 text-xs font-bold text-white drop-shadow-sm whitespace-nowrap overflow-hidden">
                                      <span className="truncate">{displayName}</span>
                                      {barWidthPx >= GANTT_BAR_FULL_THRESHOLD_PX && (
                                        <span className="ml-1 text-[11px] font-semibold text-cyan-100">{project.progress}%</span>
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
        ) : (
          /* Archive Table for Completed Projects */
          <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-auto custom-scrollbar p-4">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 bg-slate-100 font-semibold">
                  <th className="py-3 px-4">{t('projectInfo')}</th>
                  <th className="py-3 px-4">{t('startDate')}</th>
                  <th className="py-3 px-4">{t('endDate')}</th>
                  <th className="py-3 px-4">{t('completedDate')}</th>
                  <th className="py-3 px-4">{t('completedBy')}</th>
                  <th className="py-3 px-4">{t('participatingWorkers')}</th>
                  <th className="py-3 px-4 text-center">{t('progress')}</th>
                  <th className="py-3 px-4 text-right">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500 font-medium">
                      {t('loading')}
                    </td>
                  </tr>
                ) : projects.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500 font-medium">
                      {t('noData')}
                    </td>
                  </tr>
                ) : (
                  projects.map((prj) => {
                    const displayName = getDisplayName(prj);
                    const workersList = prj.participating_workers || [];

                    return (
                      <tr key={prj.id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 font-bold text-slate-900 max-w-[240px] truncate">
                          <div className="flex items-center gap-1.5">
                            <span>{displayName}</span>
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded font-bold">
                              {t('statusCompleted')}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{prj.start_date}</td>
                        <td className="py-3 px-4 text-slate-600">{prj.end_date}</td>
                        <td className="py-3 px-4 text-emerald-700 font-semibold">{prj.completed_at || '-'}</td>
                        <td className="py-3 px-4 text-slate-700">{prj.completed_by_name || '-'}</td>
                        <td className="py-3 px-4 text-slate-700 max-w-[200px] truncate">
                          {workersList.length > 0 ? workersList.join(', ') : '-'}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-emerald-700">100%</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => navigate(`/projects/${prj.id}`)}
                            className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded text-xs font-semibold shadow-sm transition inline-flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            <span>{t('detailView')}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
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

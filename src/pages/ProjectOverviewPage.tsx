// src/pages/ProjectOverviewPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project } from '../types';
import { api, getCurrentWorkerName } from '../services/api';
import { calculateVisibleGanttSpan } from '../utils/dateUtils';
import { useGanttDateRange } from '../hooks/useGanttDateRange';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
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
import { MobileAppHeader } from '../components/mobile/MobileAppHeader';
import { MobileWorkerSheet } from '../components/mobile/MobileWorkerSheet';
import { MobileProjectCard } from '../components/mobile/MobileProjectCard';
import { Plus, Edit2, Trash2, ChevronRight, CheckCircle, Eye, Calendar, ChevronLeft } from 'lucide-react';

export type MobileViewMode = 'SUMMARY' | 'WEEK' | 'GANTT';

export const ProjectOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { isMobile, isTabletFold } = useResponsiveLayout();

  const currentYearStr = new Date().getFullYear().toString();

  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');
  const [selectedYear, setSelectedYear] = useState<string>(currentYearStr);
  const [completedYears, setCompletedYears] = useState<string[]>([currentYearStr]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Mobile View Mode state stored in localStorage
  const [mobileViewMode, setMobileViewMode] = useState<MobileViewMode>(() => {
    try {
      const saved = localStorage.getItem('schedule_mobile_view_mode');
      if (saved === 'WEEK' || saved === 'GANTT') return saved;
    } catch {}
    return 'SUMMARY';
  });

  const handleMobileViewChange = (mode: MobileViewMode) => {
    setMobileViewMode(mode);
    try {
      localStorage.setItem('schedule_mobile_view_mode', mode);
    } catch {}
  };

  // Worker State
  const [currentWorker, setCurrentWorker] = useState<string>(getCurrentWorkerName());
  const [isWorkerPromptOpen, setIsWorkerPromptOpen] = useState(false);
  const [isMobileWorkerSheetOpen, setIsMobileWorkerSheetOpen] = useState(false);

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
      if (isMobile) {
        setIsMobileWorkerSheetOpen(true);
      } else {
        setIsWorkerPromptOpen(true);
      }
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

  const handleDeleteProject = async (project: Project) => {
    if (!requireWorkerSelection()) return;
    const displayName = getDisplayName(project);
    if (!window.confirm(`'${displayName}' ${t('deleteConfirm')}`)) return;
    try {
      await api.deleteProject(project.id);
      await fetchProjects();
      await fetchCompletedYears();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const handleEditProject = (project: Project) => {
    if (!requireWorkerSelection()) return;
    setSelectedProject(project);
    setIsModalOpen(true);
  };

  const handleCompleteProject = async (project: Project) => {
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans max-w-full overflow-x-hidden">
      {/* 1. Header Component */}
      {isMobile ? (
        <MobileAppHeader
          currentWorker={currentWorker}
          onOpenWorkerSheet={() => setIsMobileWorkerSheetOpen(true)}
        />
      ) : (
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-5 h-16 flex items-center justify-between gap-4 shadow-sm shrink-0 flex-nowrap">
          <div className="flex items-center gap-3.5 min-w-0">
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
            <LanguageSelector />
            <WorkerSelector
              currentWorker={currentWorker}
              onWorkerChange={(name) => setCurrentWorker(name)}
            />
            {activeTab === 'ACTIVE' && (
              <button
                type="button"
                data-testid="add-project-btn"
                onClick={handleOpenAddModal}
                className={PRIMARY_BUTTON_H36_CLASS}
              >
                <Plus className="w-4 h-4" />
                <span>{t('addProject')}</span>
              </button>
            )}
          </div>
        </header>
      )}

      {/* 2. Tabs & Controls Toolbar */}
      <div className="bg-slate-50 border-b border-slate-200 px-3 md:px-5 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0 w-full">
        {/* Row 1: Active vs Completed Tabs */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            data-testid="active-tab-btn"
            onClick={() => setActiveTab('ACTIVE')}
            className={`flex-1 sm:flex-none h-9 px-4 rounded-lg font-bold text-xs transition ${
              activeTab === 'ACTIVE'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-300'
            }`}
          >
            {t('activeProjectsTab')}
          </button>
          <button
            type="button"
            data-testid="completed-tab-btn"
            onClick={() => setActiveTab('COMPLETED')}
            className={`flex-1 sm:flex-none h-9 px-4 rounded-lg font-bold text-xs transition ${
              activeTab === 'COMPLETED'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-300'
            }`}
          >
            {t('completedProjectsYear', { year: selectedYear })}
          </button>
        </div>

        {/* Row 2: Mobile View Mode & Navigation / Desktop Gantt Controls */}
        {isMobile ? (
          <div className="flex flex-col gap-2 w-full">
            {/* View Modes: [요약] [7일] [30일] */}
            {activeTab === 'ACTIVE' && (
              <div className="flex items-center p-0.5 bg-slate-200/80 rounded-lg text-xs font-semibold w-full">
                <button
                  type="button"
                  data-testid="mobile-view-summary-btn"
                  onClick={() => handleMobileViewChange('SUMMARY')}
                  className={`flex-1 h-8 rounded-md transition font-bold ${
                    mobileViewMode === 'SUMMARY'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  {t('summaryView')}
                </button>
                <button
                  type="button"
                  data-testid="mobile-view-week-btn"
                  onClick={() => handleMobileViewChange('WEEK')}
                  className={`flex-1 h-8 rounded-md transition font-bold ${
                    mobileViewMode === 'WEEK'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  {t('week7View')}
                </button>
                <button
                  type="button"
                  data-testid="mobile-view-gantt-btn"
                  onClick={() => handleMobileViewChange('GANTT')}
                  className={`flex-1 h-8 rounded-md transition font-bold ${
                    mobileViewMode === 'GANTT'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  {t('gantt30View')}
                </button>
              </div>
            )}

            {/* Range Navigation Controls for Mobile */}
            {activeTab === 'ACTIVE' && (
              <div className="flex items-center justify-between bg-white border border-slate-300 rounded-lg h-9 px-2 text-xs">
                <button
                  type="button"
                  data-testid="nav-prev-btn"
                  onClick={goPrevious}
                  className="h-7 px-2 rounded hover:bg-slate-100 text-slate-700 font-semibold transition flex items-center gap-0.5"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-500" />
                  <span>{t('prev')}</span>
                </button>
                <button
                  type="button"
                  data-testid="nav-today-btn"
                  onClick={goToday}
                  className="h-7 px-3 bg-blue-50 text-blue-700 font-bold rounded border border-blue-200"
                >
                  {t('today')}
                </button>
                <button
                  type="button"
                  data-testid="nav-next-btn"
                  onClick={goNext}
                  className="h-7 px-2 rounded hover:bg-slate-100 text-slate-700 font-semibold transition flex items-center gap-0.5"
                >
                  <span>{t('next')}</span>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
                <span className="font-bold text-slate-800 text-[11px] truncate max-w-[130px] ml-1">
                  {rangeTitle}
                </span>
              </div>
            )}

            {/* Year Selector for Completed Tab */}
            {activeTab === 'COMPLETED' && (
              <div className="flex items-center justify-between bg-white border border-slate-300 rounded-lg h-9 px-3 text-xs font-semibold text-slate-700">
                <span>{t('yearSelect')}:</span>
                <select
                  data-testid="year-select"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="bg-transparent text-slate-900 font-bold focus:outline-none"
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
        ) : (
          /* Desktop / Tablet Controls */
          activeTab === 'ACTIVE' ? (
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
                data-testid="year-select"
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
          )
        )}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-3 md:p-5 overflow-x-hidden flex flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {/* MOBILE VIEW (width < 768px and SUMMARY or WEEK mode) */}
        {isMobile && (mobileViewMode === 'SUMMARY' || mobileViewMode === 'WEEK' || activeTab === 'COMPLETED') ? (
          <div className="space-y-3 w-full">
            {loading ? (
              <div className="py-12 text-center text-slate-500 font-medium text-xs">
                {t('loading')}
              </div>
            ) : projects.length === 0 ? (
              <div className="py-12 text-center text-slate-500 font-medium text-xs bg-white rounded-xl border border-slate-200 p-6">
                {activeTab === 'ACTIVE' ? t('noActiveProjects') : t('noCompletedProjects')}
              </div>
            ) : (
              <div className={isTabletFold ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
                {projects.map((prj) => (
                  <MobileProjectCard
                    key={prj.id}
                    project={prj}
                    isCompletedTab={activeTab === 'COMPLETED'}
                    onClick={() => navigate(`/projects/${prj.id}`)}
                    onEdit={(p) => handleEditProject(p)}
                    onComplete={(p) => handleCompleteProject(p)}
                    onDelete={(p) => handleDeleteProject(p)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* GANTT VIEW (Desktop / Tablet / Mobile 30-Day Gantt Tab) */
          activeTab === 'ACTIVE' ? (
            <div
              ref={scrollContainerRef}
              className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto overflow-y-auto custom-scrollbar relative max-w-full"
              style={{ touchAction: 'pan-x pan-y', overscrollBehaviorX: 'contain' }}
            >
              <table className="w-full border-collapse text-left min-w-max">
                <thead className="sticky top-0 z-20 bg-slate-100 text-xs uppercase tracking-wider text-slate-700">
                  <tr className="border-b border-slate-200">
                    <th
                      rowSpan={2}
                      className="sticky left-0 z-30 bg-slate-100 px-3 py-2.5 font-bold text-slate-800 border-r border-slate-200 w-[160px] md:w-[270px] min-w-[160px] md:min-w-[270px] max-w-[270px]"
                    >
                      <div className="flex justify-between items-center text-xs font-bold text-slate-900">
                        <span>{t('projectInfo')}</span>
                        <span className="hidden md:inline text-[10px] text-slate-500 font-normal">{t('progress')}</span>
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
                          data-testid={`project-row-${project.id}`}
                          onClick={() => navigate(`/projects/${project.id}`)}
                          className="hover:bg-blue-50/50 transition cursor-pointer group"
                        >
                          {/* Fixed Left Column */}
                          <td className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/50 px-3 py-3 border-r border-slate-200 w-[160px] md:w-[270px] min-w-[160px] md:min-w-[270px] max-w-[270px] align-middle">
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
            /* Archive Table for Completed Projects (Desktop) */
            <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-auto custom-scrollbar p-4 max-w-full">
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
                              data-testid={`view-detail-btn-${prj.id}`}
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
          )
        )}
      </main>

      {/* Floating Action Button (FAB) for Mobile Add Project */}
      {isMobile && activeTab === 'ACTIVE' && (
        <button
          type="button"
          data-testid="mobile-fab-btn"
          onClick={handleOpenAddModal}
          aria-label={t('addProject')}
          style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
          className="fixed right-5 z-40 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center transition active:scale-95"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

      {/* Modals & Bottom Sheets */}
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

      <MobileWorkerSheet
        isOpen={isMobileWorkerSheetOpen}
        currentWorker={currentWorker}
        onClose={() => setIsMobileWorkerSheetOpen(false)}
        onSelectWorker={(name) => setCurrentWorker(name)}
      />
    </div>
  );
};

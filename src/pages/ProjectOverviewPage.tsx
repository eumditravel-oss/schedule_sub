// src/pages/ProjectOverviewPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project, Worker, CountryHoliday, CalendarOverride, isExecutiveViewer, isEditableWorker } from '../types';
import { api, getCurrentWorkerId, setCurrentWorker as setCurrentWorkerApi } from '../services/api';
import { calculateVisibleGanttSpan } from '../utils/dateUtils';
import { getCountryOffState } from '../utils/workCalendar';
import { getCalendarVisualStyle, CalendarVisualState, buildCalendarHatchPattern } from '../utils/calendarVisualTokens';
import { useGanttDateRange } from '../hooks/useGanttDateRange';
import { useGanttGeometry } from '../hooks/useGanttGeometry';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useI18n } from '../hooks/useI18n';
import { getLocalizedErrorMessage } from '../i18n';
import {
  GANTT_DAY_WIDTH_PX,
  PRIMARY_BUTTON_H36_CLASS,
  GANTT_MONTH_HEADER_HEIGHT_PX,
  GANTT_DATE_HEADER_HEIGHT_PX,
  GANTT_HEADER_TOTAL_HEIGHT_PX,
} from '../constants/gantt';
import { GANTT_Z } from '../constants/ganttLayers';
import { detectWorkerCapacityConflicts, CapacityConflictGroup } from '../utils/capacityConflictDetector';
import { WorkerConflictSummaryModal } from '../components/modals/WorkerConflictSummaryModal';
import { ProjectModal } from '../components/modals/ProjectModal';
import { WorkerSelector } from '../components/common/WorkerSelector';
import { WorkerPromptModal } from '../components/modals/WorkerPromptModal';
import { GanttViewControls } from '../components/common/GanttViewControls';
import { MobileAppHeader } from '../components/mobile/MobileAppHeader';
import { MobileWorkerSheet } from '../components/mobile/MobileWorkerSheet';
import { CalendarManagerModal } from '../components/modals/CalendarManagerModal';
import { MobileSummaryView } from '../components/mobile/MobileSummaryView';
import { MobileWeekView } from '../components/mobile/MobileWeekView';
import { MobileThirtyDayGanttView } from '../components/mobile/MobileThirtyDayGanttView';
import { CalendarLegend } from '../components/common/CalendarLegend';
import { DateHeaderInfoPanel } from '../components/modals/DateHeaderInfoPanel';
import { TodaySummaryCard } from '../components/common/TodaySummaryCard';
import { BuildVersionIndicator } from '../components/common/BuildVersionIndicator';
import { ScheduleBar } from '../components/gantt/ScheduleBar';
import { ProjectCalendarHatchOverlay } from '../components/gantt/ProjectCalendarHatchOverlay';
import { TodayColumnOverlay } from '../components/gantt/TodayColumnOverlay';
import { getGanttSpanColumns } from '../utils/ganttOverlay';
import { calculateTaskWorkdayBreakdown } from '../utils/workCalendar';
import { ProjectDeleteConfirmModal } from '../components/modals/ProjectDeleteConfirmModal';
import { Plus, ChevronRight, ChevronLeft, Calendar, Lock, Pencil, Trash2 } from 'lucide-react';

export type MobileViewMode = 'SUMMARY' | 'WEEK' | 'GANTT';

export const ProjectOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, lang, setLanguage } = useI18n();
  const { isMobile, isTabletFold } = useResponsiveLayout();
  const isMobileView = isMobile || isTabletFold;

  const currentYearStr = new Date().getFullYear().toString();

  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');
  const [selectedYear, setSelectedYear] = useState<string>(currentYearStr);
  const [completedYears, setCompletedYears] = useState<string[]>([currentYearStr]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [krHolidays, setKrHolidays] = useState<CountryHoliday[]>([]);
  const [vnHolidays, setVnHolidays] = useState<CountryHoliday[]>([]);
  const [calendarOverrides, setCalendarOverrides] = useState<CalendarOverride[]>([]);
  const [loading, setLoading] = useState(true);

  // Mobile View Mode state
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

  // Worker & Modal States
  const [currentWorker, setCurrentWorker] = useState<Worker | null>(null);
  const [isWorkerPromptOpen, setIsWorkerPromptOpen] = useState(false);
  const [isMobileWorkerSheetOpen, setIsMobileWorkerSheetOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [headerInfoState, setHeaderInfoState] = useState<{
    isOpen: boolean;
    dateStr: string;
    dayName: string;
  }>({
    isOpen: false,
    dateStr: '',
    dayName: '',
  });

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
  const OVERVIEW_LEFT_WIDTH = 300;

  const {
    timelineWidth,
    dateGridTemplate,
  } = useGanttGeometry({
    containerRef: scrollContainerRef,
    leftPanelWidth: OVERVIEW_LEFT_WIDTH,
    dateCount: dateColumns.length,
    minDayWidthPx: GANTT_DAY_WIDTH_PX,
  });

  const [conflictModalState, setConflictModalState] = useState<{
    isOpen: boolean;
    projectName?: string;
    conflicts: CapacityConflictGroup[];
  }>({
    isOpen: false,
    projectName: '',
    conflicts: [],
  });

  const handleOpenConflictModal = async (e: React.MouseEvent, prj: Project) => {
    e.stopPropagation();
    try {
      const res = await api.getProjectConflicts(prj.id);
      if (res && res.groups) {
        setConflictModalState({
          isOpen: true,
          projectName: prj.name_ko || prj.name,
          conflicts: res.groups,
        });
      }
    } catch (err) {
      console.error('Failed to fetch project conflicts:', err);
    }
  };

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

  const fetchCalendarData = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const [wData, krData, vnData, ovrData] = await Promise.all([
        api.getWorkers(),
        api.getHolidays('KR', currentYear),
        api.getHolidays('VN', currentYear),
        api.getOverrides(),
      ]);
      const workerList = wData || [];
      setWorkers(workerList);
      setKrHolidays(krData || []);
      setVnHolidays(vnData || []);
      setCalendarOverrides(ovrData || []);

      // Auto resolve worker language & check pending schedule decisions
      const savedId = getCurrentWorkerId();
      const found = workerList.find((w) => w.id === savedId || w.name === savedId);
      if (found) {
        setCurrentWorker(found);
        setLanguage(found.ui_language || (found.country_code === 'VN' ? 'vi' : 'ko'));
        if (!isExecutiveViewer(found)) {
          api.getPendingScheduleDecisions().then((pds) => {
            if (pds && pds.length > 0) {
              setIsCalendarModalOpen(true);
            }
          }).catch(() => {});
        }
      } else {
        setIsWorkerPromptOpen(true);
      }
    } catch (err) {
      console.error('Failed to fetch calendar data:', err);
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
    fetchCalendarData();
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [activeTab, selectedYear]);

  const handleSelectWorkerProfile = (w: Worker) => {
    setCurrentWorker(w);
    setCurrentWorkerApi(w);
    const targetLang = w.ui_language || (w.country_code === 'VN' ? 'vi' : 'ko');
    setLanguage(targetLang);
  };

  const requireWorkerSelection = (): boolean => {
    if (!currentWorker) {
      if (isMobileView) {
        setIsMobileWorkerSheetOpen(true);
      } else {
        setIsWorkerPromptOpen(true);
      }
      return false;
    }
    return true;
  };

  const handleOpenAddModal = () => {
    if (isExecutiveViewer(currentWorker)) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (!requireWorkerSelection()) return;
    setSelectedProject(null);
    setIsModalOpen(true);
  };

  const handleSaveProject = async (data: Partial<Project>) => {
    if (isExecutiveViewer(currentWorker)) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (!requireWorkerSelection()) return;
    try {
      let res;
      if (selectedProject) {
        res = await api.updateProject(selectedProject.id, data);
      } else {
        res = await api.createProject(data);
      }
      await fetchProjects();
      await fetchCompletedYears();
      return res;
    } catch (err: any) {
      if (err && err.code === 'PROJECT_SCHEDULE_CASCADE_CONFIRMATION_REQUIRED') {
        throw err;
      }
      return { success: false, error: err };
    }
  };

  const getDisplayName = (project: Project): string => {
    const currentLang = currentWorker?.ui_language || lang;
    if (currentLang === 'vi') {
      return project.name_vi || project.name_ko || project.name;
    }
    return project.name_ko || project.name_vi || project.name;
  };

  const isFallbackOriginal = (project: Project): boolean => {
    const currentLang = currentWorker?.ui_language || lang;
    if (currentLang === 'vi') return !project.name_vi;
    return !project.name_ko;
  };

  const handleCompleteProject = async (project: Project) => {
    if (isExecutiveViewer(currentWorker)) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (!requireWorkerSelection()) return;
    if (!confirm(t('completeConfirmText'))) return;
    try {
      await api.completeProject(project.id);
      await fetchProjects();
      await fetchCompletedYears();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
  };

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);

  const handleEditProject = (project: Project) => {
    if (isExecutiveViewer(currentWorker)) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (!requireWorkerSelection()) return;
    setSelectedProject(project);
    setIsModalOpen(true);
  };

  const handleOpenDeleteModal = (project: Project) => {
    if (isExecutiveViewer(currentWorker)) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (!requireWorkerSelection()) return;
    setDeletingProject(project);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDeleteProject = async (project: Project) => {
    await api.deleteProject(project.id);
    await fetchProjects();
    await fetchCompletedYears();
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">
      {/* Mobile App Header */}
      {isMobileView ? (
        <MobileAppHeader
          currentWorker={currentWorker}
          onOpenWorkerSheet={() => setIsMobileWorkerSheetOpen(true)}
        />
      ) : (
        /* Desktop App Header */
        <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <img
              src="/logo3-mobile-cropped.png"
              alt="Logo"
              className="h-8 object-contain"
            />
            <div>
              <h1 className="font-extrabold text-base md:text-lg text-slate-900 tracking-tight leading-none">
                {t('appTitle')}
              </h1>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {t('appSubtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isExecutiveViewer(currentWorker) ? (
              <div
                data-testid="viewer-readonly-badge"
                className="h-9 px-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-extrabold flex items-center gap-1.5 shrink-0 shadow-xs"
              >
                <Lock className="w-4 h-4 text-red-600" />
                <span>{lang === 'vi' ? 'Chỉ xem' : '보기 전용'}</span>
              </div>
            ) : (
              <button
                type="button"
                data-testid="desktop-manage-calendar-btn"
                onClick={() => setIsCalendarModalOpen(true)}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition shadow-xs"
              >
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>{t('manageHolidays')}</span>
              </button>
            )}

            <WorkerSelector
              currentWorker={currentWorker}
              onWorkerChange={handleSelectWorkerProfile}
            />

            {!isExecutiveViewer(currentWorker) && (
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

      {/* Desktop Toolbar & Navigation Controls */}
      {isMobileView ? (
        <div className="bg-white border-b border-slate-200 p-3 flex flex-col gap-2 w-full shadow-2xs">
          <div className="flex items-center justify-between">
            <div role="tablist" aria-label="Mobile View Modes" className="flex items-center p-0.5 bg-slate-200/80 rounded-lg text-xs font-semibold flex-1 mr-2">
              <button
                type="button"
                role="tab"
                aria-selected={mobileViewMode === 'SUMMARY'}
                data-testid="mobile-view-summary-btn"
                onClick={() => handleMobileViewChange('SUMMARY')}
                className={`flex-1 h-8 rounded-md transition font-bold ${
                  mobileViewMode === 'SUMMARY'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t('summaryView')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileViewMode === 'WEEK'}
                data-testid="mobile-view-week-btn"
                onClick={() => handleMobileViewChange('WEEK')}
                className={`flex-1 h-8 rounded-md transition font-bold ${
                  mobileViewMode === 'WEEK'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t('week7View')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileViewMode === 'GANTT'}
                data-testid="mobile-view-gantt-btn"
                onClick={() => handleMobileViewChange('GANTT')}
                className={`flex-1 h-8 rounded-md transition font-bold ${
                  mobileViewMode === 'GANTT'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t('gantt30View')}
              </button>
            </div>

            <CalendarLegend isMobileView={true} />
          </div>
        </div>
      ) : (
        <section data-testid="desktop-schedule-toolbar" className="bg-white border-b border-slate-200 px-4 md:px-6 py-2.5 space-y-2 text-slate-900 shadow-2xs">
          {/* Toolbar Main Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: Active vs Completed Tabs */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs font-semibold">
                <button
                  type="button"
                  data-testid="active-tab-btn"
                  onClick={() => setActiveTab('ACTIVE')}
                  className={`px-3 py-1.5 rounded-md transition font-bold ${
                    activeTab === 'ACTIVE'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('activeProjects')}
                </button>
                <button
                  type="button"
                  data-testid="completed-tab-btn"
                  onClick={() => setActiveTab('COMPLETED')}
                  className={`px-3 py-1.5 rounded-md transition font-bold ${
                    activeTab === 'COMPLETED'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('completedProjects')}
                </button>
              </div>

              {activeTab === 'COMPLETED' && (
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="h-8 text-xs font-bold bg-white border border-slate-200 rounded-lg px-2 text-slate-700 shadow-2xs focus:ring-1 focus:ring-blue-500"
                >
                  {completedYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}{lang === 'vi' ? '' : '년'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Center: View Mode Toggle & Date Range Badge */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs font-semibold">
                <button
                  type="button"
                  data-testid="view-30days-btn"
                  data-state={viewMode === 'THIRTY_DAYS' ? 'active' : 'inactive'}
                  aria-pressed={viewMode === 'THIRTY_DAYS'}
                  onClick={() => changeViewMode('THIRTY_DAYS')}
                  className={`px-3 py-1.5 rounded-md transition font-bold ${
                    viewMode === 'THIRTY_DAYS'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('gantt30View')}
                </button>
                <button
                  type="button"
                  data-testid="view-month-btn"
                  data-state={viewMode === 'MONTH' ? 'active' : 'inactive'}
                  aria-pressed={viewMode === 'MONTH'}
                  onClick={() => changeViewMode('MONTH')}
                  className={`px-3 py-1.5 rounded-md transition font-bold ${
                    viewMode === 'MONTH'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('viewMonth')}
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-extrabold text-slate-800 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>{rangeTitle}</span>
              </div>
            </div>

            {/* Right: Navigation Controls (Prev / Today / Next) */}
            <div className="flex items-center gap-1 bg-white border border-slate-300 p-0.5 rounded-lg shadow-2xs shrink-0">
              <button
                type="button"
                data-testid="nav-prev-btn"
                onClick={goPrevious}
                className="h-7 px-2.5 rounded hover:bg-slate-100 text-slate-700 font-bold text-xs transition flex items-center gap-1"
                aria-label={t('prev')}
              >
                <ChevronLeft className="w-4 h-4 text-slate-500" />
                <span>{t('prev')}</span>
              </button>

              <button
                type="button"
                data-testid="nav-today-btn"
                onClick={goToday}
                className="h-7 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded text-xs transition border border-blue-200"
              >
                {t('today')}
              </button>

              <button
                type="button"
                data-testid="nav-next-btn"
                onClick={goNext}
                className="h-7 px-2.5 rounded hover:bg-slate-100 text-slate-700 font-bold text-xs transition flex items-center gap-1"
                aria-label={t('next')}
              >
                <span>{t('next')}</span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Legend Row */}
          <div className="pt-1.5 border-t border-slate-100">
            <CalendarLegend isMobileView={false} />
          </div>
        </section>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-3 md:p-5 overflow-x-hidden flex flex-col">
        {isMobileView ? (
          /* Dedicated Mutually Exclusive Mobile & Fold Views */
          <div className="w-full flex-1 flex flex-col">
            {mobileViewMode === 'SUMMARY' && (
              <MobileSummaryView
                mode="OVERVIEW"
                projects={projects}
                isCompletedTab={activeTab === 'COMPLETED'}
                onProjectClick={(p) => navigate(`/projects/${p.id}`)}
                onEditProject={handleEditProject}
                onCompleteProject={handleCompleteProject}
                onDeleteProject={handleOpenDeleteModal}
                isReadOnly={isExecutiveViewer(currentWorker)}
              />
            )}
            {mobileViewMode === 'WEEK' && (
              <MobileWeekView
                mode="OVERVIEW"
                projects={projects}
                onProjectClick={(p) => navigate(`/projects/${p.id}`)}
              />
            )}
            {mobileViewMode === 'GANTT' && (
              <MobileThirtyDayGanttView
                mode="OVERVIEW"
                projects={projects}
                dateColumns={dateColumns}
                onProjectClick={(p) => navigate(`/projects/${p.id}`)}
              />
            )}
          </div>
        ) : (
          /* Desktop Table View */
          <div className="space-y-3 flex-1 flex flex-col">
            <TodaySummaryCard
              currentWorker={currentWorker}
              tasks={projects.flatMap((p: any) => p.tasks || [])}
              projects={projects}
              holidays={[...krHolidays, ...vnHolidays]}
              overrides={calendarOverrides}
            />

            {/* Outer Gantt Scroll Container */}
            <div
              ref={scrollContainerRef}
              data-testid="desktop-gantt-scroll"
              style={{ position: 'relative', isolation: 'isolate' }}
              className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto overflow-y-auto custom-scrollbar relative max-w-full isolate"
            >
              {/* Inner Gantt Canvas */}
              <div
                data-testid="desktop-gantt-canvas"
                style={{
                  width: `${OVERVIEW_LEFT_WIDTH + timelineWidth}px`,
                  minWidth: `${OVERVIEW_LEFT_WIDTH + timelineWidth}px`,
                }}
                role="table"
                className="flex flex-col text-left"
              >
                {/* 1. Header Container Grid (72px Total Height) */}
                <div
                  role="row"
                  data-testid="overview-gantt-header-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `${OVERVIEW_LEFT_WIDTH}px ${timelineWidth}px`,
                    gridTemplateRows: `${GANTT_MONTH_HEADER_HEIGHT_PX}px ${GANTT_DATE_HEADER_HEIGHT_PX}px`,
                    width: `${OVERVIEW_LEFT_WIDTH + timelineWidth}px`,
                    minWidth: `${OVERVIEW_LEFT_WIDTH + timelineWidth}px`,
                    height: `${GANTT_HEADER_TOTAL_HEIGHT_PX}px`,
                    minHeight: `${GANTT_HEADER_TOTAL_HEIGHT_PX}px`,
                    maxHeight: `${GANTT_HEADER_TOTAL_HEIGHT_PX}px`,
                    position: 'sticky',
                    top: 0,
                    zIndex: GANTT_Z.STICKY_TOP_HEADER,
                  }}
                  className="sticky top-0 bg-slate-100 text-xs uppercase tracking-wider text-slate-700 border-b border-slate-200"
                >
                  {/* Left Header Corner (Spans 2 Header Rows, 72px Height) */}
                  <div
                    role="columnheader"
                    data-testid="overview-sticky-corner"
                    style={{
                      gridColumn: '1',
                      gridRow: '1 / span 2',
                      height: `${GANTT_HEADER_TOTAL_HEIGHT_PX}px`,
                      minHeight: `${GANTT_HEADER_TOTAL_HEIGHT_PX}px`,
                      maxHeight: `${GANTT_HEADER_TOTAL_HEIGHT_PX}px`,
                      position: 'sticky',
                      left: 0,
                      top: 0,
                      zIndex: GANTT_Z.STICKY_TOP_LEFT_CORNER,
                      backgroundColor: '#f1f5f9',
                      backgroundClip: 'padding-box',
                      isolation: 'isolate',
                      opacity: 1,
                      alignSelf: 'stretch',
                    }}
                    className="sticky left-0 top-0 bg-slate-100 px-3 font-bold text-slate-800 border-r border-slate-200 shrink-0 flex items-center justify-between relative"
                  >
                    <span>{t('projectInfo')}</span>
                    <span className="hidden md:inline text-[10px] text-slate-500 font-normal">{t('progress')}</span>
                    <div
                      data-testid="gantt-sticky-occlusion-rail"
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: '-1px',
                        bottom: 0,
                        height: `${GANTT_HEADER_TOTAL_HEIGHT_PX}px`,
                        width: '2px',
                        backgroundColor: '#f1f5f9',
                        pointerEvents: 'none',
                        zIndex: GANTT_Z.STICKY_OCCLUSION_RAIL,
                        boxShadow: '4px 0 8px rgba(15, 23, 42, 0.08)',
                      }}
                    />
                  </div>

                  {/* Month Header Row (Row 1, 28px) */}
                  <div
                    data-testid="overview-month-header"
                    style={{
                      gridColumn: '2',
                      gridRow: '1',
                      height: `${GANTT_MONTH_HEADER_HEIGHT_PX}px`,
                      minHeight: `${GANTT_MONTH_HEADER_HEIGHT_PX}px`,
                      maxHeight: `${GANTT_MONTH_HEADER_HEIGHT_PX}px`,
                      display: 'grid',
                      gridTemplateColumns: dateGridTemplate,
                    }}
                    className="w-full bg-slate-100 border-b border-slate-200 text-center font-bold text-blue-700 text-xs items-center"
                  >
                    {monthGroups.map((mg, idx) => (
                      <div
                        key={idx}
                        style={{ gridColumn: `${mg.startIndex + 1} / span ${mg.span}` }}
                        className="border-r border-slate-200 truncate px-1 flex items-center justify-center h-full"
                      >
                        {mg.monthStr}
                      </div>
                    ))}
                  </div>

                  {/* Date Header Row (Row 2, 44px) */}
                  <div
                    data-testid="overview-date-header"
                    style={{
                      gridColumn: '2',
                      gridRow: '2',
                      height: `${GANTT_DATE_HEADER_HEIGHT_PX}px`,
                      minHeight: `${GANTT_DATE_HEADER_HEIGHT_PX}px`,
                      maxHeight: `${GANTT_DATE_HEADER_HEIGHT_PX}px`,
                      display: 'grid',
                      gridTemplateColumns: dateGridTemplate,
                    }}
                    className="w-full h-[44px]"
                  >
                    {dateColumns.map((col, idx) => {
                      const offInfo = getCountryOffState(col.dateStr, calendarOverrides, krHolidays.concat(vnHolidays));
                      const token = getCalendarVisualStyle(offInfo.state === 'BOTH_WORK' ? 'WORKDAY' : (offInfo.state as CalendarVisualState));
                      const pattern = buildCalendarHatchPattern(token, 0.60);
                      const headerHatchStyle: React.CSSProperties = pattern ? { backgroundImage: pattern } : {};

                      const todayStyle = col.isToday ? 'shadow-[inset_0_2px_0_rgba(59,130,246,0.9)] text-blue-700 font-extrabold' : '';

                      let ariaText = `${col.dateStr} (${col.dayName})`;
                      if (offInfo.krHolidayName && offInfo.vnHolidayName) ariaText += `, 한국과 베트남 모두 공휴일 (${offInfo.krHolidayName})`;
                      else if (offInfo.krHolidayName) ariaText += `, 한국 공휴일 (${offInfo.krHolidayName}), 베트남 정상 근무`;
                      else if (offInfo.vnHolidayName) ariaText += `, 베트남 공휴일 (${offInfo.vnHolidayName}), 한국 정상 근무`;

                      const hasHoliday = !!offInfo.krHolidayName || !!offInfo.vnHolidayName;

                      return (
                        <div
                          key={idx}
                          role="columnheader"
                          data-testid={`gantt-date-header-${col.dateStr}`}
                          data-date={col.dateStr}
                          data-country-off-state={offInfo.state}
                          data-calendar-surface="HEADER"
                          data-calendar-visual-state={token.visualState}
                          data-calendar-hatch-type={token.hatch.type}
                          data-calendar-hatch-angle={token.hatch.angle}
                          aria-label={ariaText}
                          onClick={() => setHeaderInfoState({ isOpen: true, dateStr: col.dateStr, dayName: col.dayName })}
                          style={{ boxSizing: 'border-box' }}
                          className={`relative text-center p-0 border-r text-[11px] font-medium cursor-pointer transition select-none flex flex-col items-center justify-center h-full overflow-hidden ${token.headerClass} ${todayStyle}`}
                        >
                          {pattern && (
                            <div className="absolute inset-0 pointer-events-none opacity-100" style={headerHatchStyle} />
                          )}
                          {hasHoliday && (
                            <div
                              className={`absolute top-0 left-0 right-0 h-[2px] z-10 ${
                                offInfo.krHolidayName && offInfo.vnHolidayName
                                  ? 'bg-rose-600'
                                  : offInfo.krHolidayName
                                  ? 'bg-orange-500'
                                  : 'bg-sky-500'
                              }`}
                            />
                          )}
                          <div>{col.dayNum}</div>
                          <div className="text-[10px] opacity-85">{col.dayName}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Body Container */}
                <div className="divide-y divide-slate-200 text-sm flex flex-col">
                  {loading ? (
                    <div className="py-12 text-center text-slate-500 font-medium w-full">
                      {t('loading')}
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 font-medium w-full">
                      {t('noData')}
                    </div>
                  ) : (
                    projects.map((project) => {
                      const displayName = getDisplayName(project);
                      const isFallback = isFallbackOriginal(project);

                      return (
                        <div
                          key={project.id}
                          role="row"
                          data-testid={`project-row-${project.id}`}
                          onClick={() => navigate(`/projects/${project.id}`)}
                          style={{ position: 'relative', isolation: 'isolate' }}
                          className="flex hover:bg-blue-50/50 transition cursor-pointer group h-[60px]"
                        >
                          {/* Left Sticky Info Cell */}
                          <div
                            role="cell"
                            data-testid={`project-left-panel-${project.id}`}
                            style={{
                              width: `${OVERVIEW_LEFT_WIDTH}px`,
                              minWidth: `${OVERVIEW_LEFT_WIDTH}px`,
                              maxWidth: `${OVERVIEW_LEFT_WIDTH}px`,
                              position: 'sticky',
                              left: 0,
                              zIndex: GANTT_Z.STICKY_LEFT_BODY,
                              backgroundColor: '#ffffff',
                              backgroundClip: 'padding-box',
                              isolation: 'isolate',
                            }}
                            className="sticky left-0 bg-white group-hover:!bg-[#f8fafc] px-3 py-2 border-r border-slate-200 shrink-0 flex items-center h-full relative"
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="pr-1 overflow-hidden min-w-0 flex-1">
                                <div className="font-bold text-slate-900 group-hover:text-blue-600 transition truncate flex items-center gap-1 text-xs" title={displayName}>
                                  <span className="truncate">{displayName}</span>
                                  {isFallback && (
                                    <span className="text-[9px] text-slate-500 bg-slate-100 px-1 rounded shrink-0 border border-slate-200 font-normal">
                                      {t('originalTag')}
                                    </span>
                                  )}
                                  {project.conflict_count && project.conflict_count > 0 ? (
                                    <button
                                      type="button"
                                      data-testid={`project-conflict-badge-${project.id}`}
                                      onClick={(e) => handleOpenConflictModal(e, project)}
                                      className="shrink-0 text-[9px] font-extrabold text-rose-700 bg-rose-100 hover:bg-rose-200 px-1 py-0.5 rounded border border-rose-300 transition cursor-pointer"
                                      title={lang === 'vi' ? `Xem chi tiết xung đột lịch (${project.conflict_count})` : `일정 충돌 상세 보기 (${project.conflict_count}건)`}
                                    >
                                      {lang === 'vi' ? `Trùng ${project.conflict_count}` : `⚠ 충돌 ${project.conflict_count}건`}
                                    </button>
                                  ) : null}
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                </div>
                                <div className="mt-0.5 text-[10px] text-slate-500 truncate">
                                  {project.start_date} ~ {project.end_date}
                                </div>
                              </div>

                              <div
                                data-testid={`project-action-group-${project.id}`}
                                className="w-[132px] shrink-0 flex flex-col items-end justify-center gap-0.5"
                              >
                                <div
                                  data-testid={`project-action-top-row-${project.id}`}
                                  className="flex items-center justify-end gap-1 w-full whitespace-nowrap"
                                >
                                  {activeTab === 'ACTIVE' && !isExecutiveViewer(currentWorker) && (
                                    <>
                                      <button
                                        type="button"
                                        data-testid={`project-edit-btn-${project.id}`}
                                        aria-label={lang === 'vi' ? 'Chỉnh sửa dự án' : '프로젝트 수정'}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleEditProject(project);
                                        }}
                                        className="w-6 h-6 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 flex items-center justify-center transition shadow-2xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        data-testid={`project-delete-btn-${project.id}`}
                                        aria-label={lang === 'vi' ? 'Xóa dự án' : '프로젝트 삭제'}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenDeleteModal(project);
                                        }}
                                        className="w-6 h-6 rounded-md border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-slate-500 hover:text-rose-600 flex items-center justify-center transition shadow-2xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-rose-500"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                  <span
                                    data-testid={`project-status-badge-${project.id}`}
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border cursor-default select-none whitespace-nowrap ${
                                      project.schedule_state === 'DELAYED'
                                        ? 'bg-rose-100 text-rose-800 border-rose-200'
                                        : project.schedule_state === 'COMPLETED'
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                        : project.schedule_state === 'IN_PROGRESS'
                                        ? 'bg-blue-100 text-blue-800 border-blue-200'
                                        : 'bg-slate-100 text-slate-700 border-slate-200'
                                    }`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {project.schedule_state === 'DELAYED'
                                      ? (lang === 'vi' ? 'Chậm' : '지연')
                                      : project.schedule_state === 'COMPLETED'
                                      ? (lang === 'vi' ? 'Xong' : '완료')
                                      : project.schedule_state === 'IN_PROGRESS'
                                      ? (lang === 'vi' ? '진행' : '진행 중')
                                      : (lang === 'vi' ? 'Sắp' : '예정')}
                                  </span>
                                </div>

                                <div
                                  data-testid={`project-progress-summary-${project.id}`}
                                  className="text-[9px] font-semibold text-slate-600 flex items-center gap-1 select-none whitespace-nowrap"
                                >
                                  <span>{lang === 'vi' ? 'KH' : '예정'} {project.planned_progress ?? project.progress ?? 0}%</span>
                                  <span>/</span>
                                  <span className="font-extrabold text-emerald-700">{lang === 'vi' ? 'TT' : '실제'} {project.actual_progress ?? project.progress ?? 0}%</span>
                                </div>
                              </div>
                            </div>
                            <div
                              data-testid="gantt-sticky-occlusion-rail"
                              style={{
                                position: 'absolute',
                                top: 0,
                                right: '-1px',
                                bottom: 0,
                                width: '2px',
                                backgroundColor: 'inherit',
                                pointerEvents: 'none',
                                zIndex: 1,
                                boxShadow: '4px 0 8px rgba(15, 23, 42, 0.08)',
                              }}
                            />
                          </div>

                          {/* Right Timeline Cell */}
                          <div role="cell" data-testid={`project-timeline-${project.id}`} style={{ width: `${timelineWidth}px`, minWidth: `${timelineWidth}px` }} className="relative h-full shrink-0">
                            {/* Layer 0: Day Grid */}
                            <div className="grid w-full h-full" style={{ gridTemplateColumns: dateGridTemplate }}>
                              {dateColumns.map((col, cIdx) => (
                                <div
                                  key={cIdx}
                                  data-testid={`gantt-task-cell-overview-${project.id}-${col.dateStr}`}
                                  style={{ boxSizing: 'border-box' }}
                                  className={`h-full border-r border-slate-200 ${col.isWeekend ? 'bg-slate-50/70' : 'bg-white'}`}
                                />
                              ))}
                            </div>

                            {/* Layer 5: Today Overlay */}
                            <TodayColumnOverlay dateColumns={dateColumns} dayWidthPx={timelineWidth / dateColumns.length} />

                            {/* Layer 10: ScheduleBar */}
                            {(() => {
                              const spanInfo = getGanttSpanColumns(project.start_date, project.end_date, dateColumns);
                              if (!spanInfo) return null;

                              const prjBreakdown = calculateTaskWorkdayBreakdown(
                                currentWorker,
                                project.start_date,
                                project.end_date,
                                [...krHolidays, ...vnHolidays],
                                calendarOverrides
                              );

                              return (
                                <div
                                  className="absolute inset-0 grid pointer-events-none z-10 w-full h-full"
                                  style={{ gridTemplateColumns: dateGridTemplate }}
                                >
                                  <div
                                    data-testid={`gantt-schedule-bar-track-${project.id}`}
                                    style={{ gridColumn: `${spanInfo.startIndex + 1} / span ${spanInfo.spanCount}` }}
                                    className="flex items-center h-full w-full min-w-0 pointer-events-auto"
                                  >
                                    <ScheduleBar
                                      title={displayName}
                                      startDate={project.start_date}
                                      endDate={project.end_date}
                                      calendarSpanDays={prjBreakdown.calendar_span_days}
                                      plannedWorkingDays={prjBreakdown.planned_working_days}
                                      plannedProgress={project.planned_progress ?? project.progress ?? 0}
                                      actualProgress={project.actual_progress ?? project.progress ?? 0}
                                      status={project.schedule_state || 'UPCOMING'}
                                    />
                                  </div>
                                </div>
                              );
                            })()}

                            {/* 3. Country Off Hatch Grid Overlay Layer (z-20 pointer-events-none) */}
                            <ProjectCalendarHatchOverlay
                              projectId={project.id}
                              startDate={project.start_date}
                              endDate={project.end_date}
                              dateColumns={dateColumns}
                              calendarOverrides={calendarOverrides}
                              countryHolidays={[...krHolidays, ...vnHolidays]}
                              dayWidthPx={timelineWidth / dateColumns.length}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <ProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProject}
        project={selectedProject}
        currentWorker={currentWorker}
      />

      <WorkerPromptModal
        isOpen={isWorkerPromptOpen}
        onClose={() => setIsWorkerPromptOpen(false)}
        onSelectWorker={handleSelectWorkerProfile}
      />

      <MobileWorkerSheet
        isOpen={isMobileWorkerSheetOpen}
        onClose={() => setIsMobileWorkerSheetOpen(false)}
        currentWorker={currentWorker}
        onSelectWorker={handleSelectWorkerProfile}
      />

      <CalendarManagerModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        workers={workers}
        currentWorker={currentWorker}
        onRefreshCalendar={fetchCalendarData}
      />

      {/* Date Header Info Panel */}
      <DateHeaderInfoPanel
        isOpen={headerInfoState.isOpen}
        onClose={() => setHeaderInfoState((prev) => ({ ...prev, isOpen: false }))}
        dateStr={headerInfoState.dateStr}
        dayName={headerInfoState.dayName}
        holidays={[...krHolidays, ...vnHolidays]}
        currentWorker={currentWorker}
        onRefreshHolidays={fetchCalendarData}
      />

      <WorkerConflictSummaryModal
        isOpen={conflictModalState.isOpen}
        onClose={() => setConflictModalState({ isOpen: false, conflicts: [] })}
        projectName={conflictModalState.projectName}
        conflicts={conflictModalState.conflicts}
        onNavigateToTask={(pId, tId) => {
          navigate(`/projects/${pId}?focusTask=${tId}`);
        }}
      />

      <ProjectDeleteConfirmModal
        isOpen={isDeleteModalOpen}
        project={deletingProject}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingProject(null);
        }}
        onConfirm={handleConfirmDeleteProject}
      />

      {/* Build Version Indicator */}
      <BuildVersionIndicator />
    </div>
  );
};

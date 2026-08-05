// src/pages/ProjectOverviewPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project, Worker, CountryHoliday, CalendarOverride, isExecutiveViewer, isEditableWorker } from '../types';
import { api, getCurrentWorkerId, setCurrentWorker as setCurrentWorkerApi } from '../services/api';
import { calculateVisibleGanttSpan } from '../utils/dateUtils';
import { useGanttDateRange } from '../hooks/useGanttDateRange';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useI18n } from '../hooks/useI18n';
import { getLocalizedErrorMessage } from '../i18n';
import {
  GANTT_DAY_WIDTH_PX,
  PRIMARY_BUTTON_H36_CLASS,
} from '../constants/gantt';
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
                data-testid="manage-holidays-btn"
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

            <div
              ref={scrollContainerRef}
              className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto overflow-y-auto custom-scrollbar relative max-w-full"
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
                  {dateColumns.map((col, idx) => {
                    const isSun = col.date.getDay() === 0;
                    const isSat = col.date.getDay() === 6;
                    const krHol = krHolidays.find((h) => h.holiday_date === col.dateStr);
                    const vnHol = vnHolidays.find((h) => h.holiday_date === col.dateStr);

                    return (
                      <th
                        key={idx}
                        data-testid="calendar-date-header"
                        onClick={() => setHeaderInfoState({ isOpen: true, dateStr: col.dateStr, dayName: col.dayName })}
                        style={{ width: `${GANTT_DAY_WIDTH_PX}px`, minWidth: `${GANTT_DAY_WIDTH_PX}px`, maxWidth: `${GANTT_DAY_WIDTH_PX}px` }}
                        className={`text-center py-1 border-r border-slate-200 text-[11px] font-medium cursor-pointer transition select-none ${
                          col.isToday
                            ? 'ring-2 ring-blue-500 ring-inset bg-blue-100/80 text-blue-900 font-bold'
                            : krHol || vnHol
                            ? 'bg-rose-50/80 text-rose-800 font-bold'
                            : isSun
                            ? 'bg-slate-100 text-slate-500 font-medium'
                            : isSat
                            ? 'bg-slate-50 text-slate-700 font-semibold'
                            : 'bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div>{col.dayNum}</div>
                        <div className="text-[9px] scale-90">{col.dayName}</div>
                        {isSat && (
                          <div className="text-[8px] font-bold text-slate-500 scale-75 whitespace-nowrap mt-0.5">
                            KR OFF / VN WORK
                          </div>
                        )}
                        {isSun && (
                          <div className="text-[8px] font-bold text-slate-400 scale-75 whitespace-nowrap mt-0.5">
                            OFF
                          </div>
                        )}
                        {(krHol || vnHol) && (
                          <div className="flex items-center justify-center gap-0.5 mt-0.5">
                            {krHol && <span className="text-[8px] font-extrabold px-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">KR</span>}
                            {vnHol && <span className="text-[8px] font-extrabold px-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">VN</span>}
                          </div>
                        )}
                      </th>
                    );
                  })}
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
                    const displayName = getDisplayName(project);
                    const isFallback = isFallbackOriginal(project);

                    return (
                      <tr
                        key={project.id}
                        data-testid={`project-row-${project.id}`}
                        onClick={() => navigate(`/projects/${project.id}`)}
                        className="hover:bg-blue-50/50 transition cursor-pointer group"
                      >
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/50 px-3 py-2 border-r border-slate-200 w-[160px] md:w-[270px] min-w-[160px] md:min-w-[270px] max-w-[270px] align-middle h-[72px] min-h-[72px]">
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

                            <div
                              data-testid={`project-action-group-${project.id}`}
                              className="w-[108px] xl:w-[128px] shrink-0 flex flex-col items-end justify-center gap-1 min-h-[52px]"
                            >
                              {/* Top Row: Status Badge & Conflicts */}
                              <div className="flex items-center gap-1">
                                {project.conflict_count && project.conflict_count > 0 ? (
                                  <span className="text-[9px] font-extrabold text-rose-700 bg-rose-100 px-1 py-0.5 rounded border border-rose-200" title="일정 충돌 발생">
                                    {lang === 'vi' ? `Trùng ${project.conflict_count}` : `충돌 ${project.conflict_count}건`}
                                  </span>
                                ) : null}

                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded border cursor-default select-none ${
                                  project.schedule_state === 'DELAYED'
                                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                                    : project.schedule_state === 'COMPLETED'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : project.schedule_state === 'IN_PROGRESS'
                                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}>
                                  {project.schedule_state === 'DELAYED'
                                    ? (lang === 'vi' ? 'Chậm tiến độ' : '지연')
                                    : project.schedule_state === 'COMPLETED'
                                    ? (lang === 'vi' ? 'Hoàn thành' : '완료')
                                    : project.schedule_state === 'IN_PROGRESS'
                                    ? (lang === 'vi' ? 'Đang thực hiện' : '진행 중')
                                    : (lang === 'vi' ? 'Sắp tới' : '예정')}
                                </span>
                              </div>

                              {/* Middle Row: Edit and Delete Buttons (ACTIVE projects & EDITOR only) */}
                              {activeTab === 'ACTIVE' && !isExecutiveViewer(currentWorker) && (
                                <div className="flex items-center gap-1 my-0.5">
                                  <button
                                    type="button"
                                    data-testid={`project-edit-btn-${project.id}`}
                                    aria-label={lang === 'vi' ? 'Chỉnh sửa dự án' : '프로젝트 수정'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditProject(project);
                                    }}
                                    className="w-7 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 flex items-center justify-center transition shadow-2xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`project-delete-btn-${project.id}`}
                                    aria-label={lang === 'vi' ? 'Xóa dự án' : '프로젝트 삭제'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenDeleteModal(project);
                                    }}
                                    className="w-7 h-7 rounded-md border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-slate-500 hover:text-rose-600 flex items-center justify-center transition shadow-2xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-rose-500"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}

                              {/* Bottom Row: Progress Summary */}
                              <div className="text-[10px] font-semibold text-slate-600 flex items-center gap-1 select-none">
                                <span>{lang === 'vi' ? 'Kế hoạch' : '예정'} {project.planned_progress ?? project.progress ?? 0}%</span>
                                <span>/</span>
                                <span className="font-extrabold text-emerald-700">{lang === 'vi' ? 'Thực tế' : '실제'} {project.actual_progress ?? project.progress ?? 0}%</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td colSpan={dateColumns.length} className="p-0 border-0 relative">
                          <div
                            className="relative h-14"
                            style={{ minWidth: `${dateColumns.length * GANTT_DAY_WIDTH_PX}px` }}
                          >
                            {/* 1. Date Cells Background Layer */}
                            <div
                              className="grid w-full h-full"
                              style={{
                                gridTemplateColumns: `repeat(${dateColumns.length}, minmax(${GANTT_DAY_WIDTH_PX}px, 1fr))`,
                              }}
                            >
                              {dateColumns.map((col, cIdx) => (
                                <div
                                  key={cIdx}
                                  style={{ minWidth: `${GANTT_DAY_WIDTH_PX}px` }}
                                  className={`h-full border-r border-slate-200 ${
                                    col.isToday
                                      ? 'bg-blue-50/70'
                                      : col.isWeekend
                                      ? 'bg-slate-50/70'
                                      : 'bg-white'
                                  }`}
                                />
                              ))}
                            </div>

                            {/* 2. CSS Grid Overlay Layer for Continuous Schedule Bar */}
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
                                  style={{
                                    gridTemplateColumns: `repeat(${dateColumns.length}, minmax(${GANTT_DAY_WIDTH_PX}px, 1fr))`,
                                  }}
                                >
                                  <div
                                    style={{
                                      gridColumn: `${spanInfo.startIndex + 1} / span ${spanInfo.spanCount}`,
                                    }}
                                    className="px-0.5 flex items-center h-full w-full min-w-0 pointer-events-auto"
                                  >
                                    <ScheduleBar
                                      title={displayName}
                                      startDate={project.start_date}
                                      endDate={project.end_date}
                                      calendarSpanDays={prjBreakdown.calendar_span_days}
                                      plannedWorkingDays={prjBreakdown.planned_working_days}
                                      plannedProgress={project.planned_progress ?? project.progress ?? 0}
                                      actualProgress={project.actual_progress ?? project.progress ?? 0}
                                      status={project.schedule_state || (project.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS')}
                                      onClick={() => navigate(`/projects/${project.id}`)}
                                    />
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
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

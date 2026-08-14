// src/pages/ProjectOverviewPage.tsx
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project, Task, Worker, CountryHoliday, CalendarOverride, isExecutiveViewer, isEditableWorker } from '../types';
import { api } from '../services/api';
import { calculateVisibleGanttSpan } from '../utils/dateUtils';
import { getCountryOffState } from '../utils/workCalendar';
import { getCalendarVisualStyle, CalendarVisualState, buildCalendarHatchPattern } from '../utils/calendarVisualTokens';
import { useGanttDateRange } from '../hooks/useGanttDateRange';
import { useGanttGeometry } from '../hooks/useGanttGeometry';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useI18n } from '../hooks/useI18n';
import { getLocalizedErrorMessage } from '../i18n';
import { TestActorModeBadge } from '../components/common/TestActorModeBadge';
import {
  GANTT_DAY_WIDTH_PX,
  PRIMARY_BUTTON_H36_CLASS,
  GANTT_MONTH_HEADER_HEIGHT_PX,
  GANTT_DATE_HEADER_HEIGHT_PX,
  GANTT_HEADER_TOTAL_HEIGHT_PX,
} from '../constants/gantt';
import { GANTT_Z } from '../constants/ganttLayers';
import { detectCrossProjectWorkerConflicts, CrossProjectConflictGroup } from '../utils/crossProjectConflictDetector';
import { WorkerConflictSummaryModal } from '../components/modals/WorkerConflictSummaryModal';
import { ProjectModal } from '../components/modals/ProjectModal';
import { ProjectWorkforceModal } from '../components/modals/ProjectWorkforceModal';
import { ProjectReadinessPopover } from '../components/common/ProjectReadinessPopover';
import { calculateProjectReadiness } from '../utils/projectReadiness';
import { compareProjectsByStartDateDesc } from '../utils/projectSorting';
import { GanttViewControls } from '../components/common/GanttViewControls';
import { MobileAppHeader } from '../components/mobile/MobileAppHeader';
import { CalendarManagerModal } from '../components/modals/CalendarManagerModal';
import { MobileSummaryView } from '../components/mobile/MobileSummaryView';
import { MobileWeekView } from '../components/mobile/MobileWeekView';
import { MobileThirtyDayGanttView } from '../components/mobile/MobileThirtyDayGanttView';
import { CalendarLegend } from '../components/common/CalendarLegend';
import { DateHeaderInfoPanel } from '../components/modals/DateHeaderInfoPanel';
import { TodaySummaryCard } from '../components/common/TodaySummaryCard';
import { IntegrationManagerModal } from '../components/modals/IntegrationManagerModal';
import { Plus, ChevronRight, ChevronLeft, Calendar, Lock, Pencil, Trash2, KeyRound, Users } from 'lucide-react';
import { BuildVersionIndicator } from '../components/common/BuildVersionIndicator';
import { ScheduleBar } from '../components/gantt/ScheduleBar';
import { ProjectCalendarHatchOverlay } from '../components/gantt/ProjectCalendarHatchOverlay';
import { TodayColumnOverlay } from '../components/gantt/TodayColumnOverlay';
import { GanttMonthBoundaryOverlay } from '../components/gantt/GanttMonthBoundaryOverlay';
import { getGanttSpanColumns } from '../utils/ganttOverlay';
import { calculateTaskWorkdayBreakdown } from '../utils/workCalendar';
import { ProjectDeleteConfirmModal } from '../components/modals/ProjectDeleteConfirmModal';
import { ProjectCompleteConfirmModal } from '../components/modals/ProjectCompleteConfirmModal';
import { PrintDropdownMenu } from '../components/print/PrintDropdownMenu';
import { TodayWorklogNavButton } from '../components/worklog/TodayWorklogNavButton';
import { usePilotAuth } from '../auth/PilotAuthContext';

export type MobileViewMode = 'SUMMARY' | 'WEEK' | 'GANTT';

export const ProjectOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, lang, setLanguage } = useI18n();
  const { session } = usePilotAuth();
  const { isMobile, isTabletFold } = useResponsiveLayout();
  const isMobileView = isMobile || isTabletFold;

  const currentYearStr = new Date().getFullYear().toString();

  const [activeTab, setActiveTab] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ACTIVE');
  const [selectedYear, setSelectedYear] = useState<string>(currentYearStr);
  const [completedYears, setCompletedYears] = useState<string[]>([currentYearStr]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [krHolidays, setKrHolidays] = useState<CountryHoliday[]>([]);
  const [vnHolidays, setVnHolidays] = useState<CountryHoliday[]>([]);
  const [calendarOverrides, setCalendarOverrides] = useState<CalendarOverride[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAllocationsLoading, setIsAllocationsLoading] = useState(false);

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
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isIntegrationModalOpen, setIsIntegrationModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allocationsMap, setAllocationsMap] = useState<Record<string, any[]>>({});
  const [isWorkforceModalOpen, setIsWorkforceModalOpen] = useState(false);
  const [selectedWorkforceProject, setSelectedWorkforceProject] = useState<Project | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const handleOpenWorkforceModal = (p: Project) => {
    setSelectedWorkforceProject(p);
    setIsWorkforceModalOpen(true);
  };

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
  const OVERVIEW_LEFT_WIDTH = 350;

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
    projectId?: string;
    projectName?: string;
    conflicts: CrossProjectConflictGroup[];
  }>({
    isOpen: false,
    projectId: '',
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
          projectId: prj.id,
          projectName: prj.name_ko || prj.name,
          conflicts: res.groups,
        });
      }
    } catch (err) {
      console.error('Failed to fetch project conflicts:', err);
    }
  };

  const fetchCompletedYears = useCallback(async () => {
    try {
      const years = await api.getCompletedYears();
      if (years && years.length > 0) {
        setCompletedYears(years);
        setSelectedYear((current) => (years.includes(current) ? current : years[0]));
      }
    } catch (err) {
      console.error('Failed to fetch completed years:', err);
    }
  }, []);

  const fetchCalendarData = useCallback(async () => {
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
      const found = workerList.find((w) => w.id === session?.actor.employeeId);
      if (found) {
        setCurrentWorker(found);
        setLanguage(found.ui_language || (found.country_code === 'VN' ? 'vi' : 'ko'));
        if (!hasAppliedRoleDefaultRef.current) {
          hasAppliedRoleDefaultRef.current = true;
          if (isExecutiveViewer(found)) {
            setActiveTab('ALL');
          } else {
            setActiveTab('ACTIVE');
          }
        }
        if (!isExecutiveViewer(found)) {
          api.getPendingScheduleDecisions().then((pds) => {
            if (pds && pds.length > 0) {
              setIsCalendarModalOpen(true);
            }
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Failed to fetch calendar data:', err);
    }
  }, [session?.actor.employeeId, setLanguage]);

  const fetchRequestIdRef = useRef(0);

  const fetchProjects = useCallback(async () => {
    const requestId = ++fetchRequestIdRef.current;
    try {
      setLoading(true);
      setAllocationsMap({});
      setIsAllocationsLoading(true);
      const [data, tasksData] = await Promise.all([
        api.getProjects(activeTab, activeTab === 'COMPLETED' ? selectedYear : undefined),
        api.getTasks(),
      ]);
      if (requestId !== fetchRequestIdRef.current) return;

      const projectList = (data || []).slice().sort(compareProjectsByStartDateDesc);
      setProjects(projectList);
      setAllTasks(tasksData || []);

      // Load allocations asynchronously in background without blocking table rendering
      const allocMap: Record<string, any[]> = {};
      const activeOnly = projectList.filter((p) => p.status === 'ACTIVE');
      Promise.all(
        activeOnly.map(async (p) => {
          try {
            const pAlloc = await api.getProjectWorkerAllocations(p.id);
            allocMap[p.id] = pAlloc || [];
          } catch {
            allocMap[p.id] = [];
          }
        })
      ).then(() => {
        if (requestId === fetchRequestIdRef.current) {
          setAllocationsMap(allocMap);
          setIsAllocationsLoading(false);
        }
      }).catch(() => {
        if (requestId === fetchRequestIdRef.current) {
          setIsAllocationsLoading(false);
        }
      });
    } catch (err: any) {
      console.error(err);
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [activeTab, selectedYear]);

  const hasAppliedRoleDefaultRef = useRef(false);

  useEffect(() => {
    fetchCompletedYears();
    fetchCalendarData();
  }, [fetchCalendarData, fetchCompletedYears]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const requireWorkerSelection = (): boolean => Boolean(currentWorker);

  const handleOpenAddModal = () => {
    if (isExecutiveViewer(currentWorker)) {
      showToast(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (!requireWorkerSelection()) return;
    setSelectedProject(null);
    setIsModalOpen(true);
  };

  const handleSaveProject = async (data: Partial<Project>) => {
    if (isExecutiveViewer(currentWorker)) {
      showToast(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
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

  const [completeModalState, setCompleteModalState] = useState<{
    isOpen: boolean;
    project: Project | null;
    incompleteTasks: Task[];
  }>({
    isOpen: false,
    project: null,
    incompleteTasks: [],
  });

  const handleCompleteProject = async (project: Project) => {
    if (isExecutiveViewer(currentWorker)) {
      showToast(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (!requireWorkerSelection()) return;

    const incomplete = allTasks.filter(
      (t) => t.project_id === project.id && (t.actual_progress ?? t.progress ?? 0) < 100 && Number(t.completion_confirmed) !== 1
    );

    setCompleteModalState({
      isOpen: true,
      project,
      incompleteTasks: incomplete,
    });
  };

  const refreshOverviewData = async () => {
    await Promise.all([
      fetchProjects(),
      fetchCompletedYears(),
      fetchCalendarData(),
    ]);
  };

  const handleConfirmBatchCompleteProject = async (completedDate: string) => {
    if (!completeModalState.project) return;
    const pId = completeModalState.project.id;
    await api.completeProject(pId, 'COMPLETE_ALL', completedDate);
    await refreshOverviewData();
  };

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);

  const handleEditProject = (project: Project) => {
    if (isExecutiveViewer(currentWorker)) {
      showToast(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (!requireWorkerSelection()) return;
    setSelectedProject(project);
    setIsModalOpen(true);
  };

  const handleOpenDeleteModal = (project: Project) => {
    if (isExecutiveViewer(currentWorker)) {
      showToast(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
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
          onOpenWorklog={() => navigate('/worklog/today')}
        />
      ) : (
        /* Desktop App Header — Status Tabs가 Header 우측에 통합됨 (1024px 반응형 컴팩트 가로폭) */
        <header
          data-testid="desktop-app-header"
          className="bg-white border-b border-slate-200 px-3 md:px-5 py-2 flex items-center justify-between shadow-2xs gap-1.5 w-full max-w-full overflow-x-hidden"
        >
          {/* Brand Area */}
          <div data-testid="overview-brand-area" className="flex items-center gap-2 shrink-0">
            <img
              src="/logo3-mobile-cropped.png"
              alt="Logo"
              className="h-8 object-contain"
            />
            <div>
              <h1 className="font-extrabold text-xs md:text-sm text-slate-900 tracking-tight leading-none whitespace-nowrap">
                {t('appTitle')}
              </h1>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5 hidden xl:block">
                {t('appSubtitle')}
              </p>
            </div>
          </div>

          {/* Flexible Spacer */}
          <div className="flex-1 min-w-1" />

          {/* Header Actions: Open API | Status Tabs (ALL / ACTIVE / COMPLETED) | Calendar | Worker | Add */}
          <div
            data-testid="overview-header-actions"
            className="flex items-center gap-1.5 shrink-0"
          >
            {/* [0] Open API Button */}
            <button
              type="button"
              data-testid="open-integration-api-btn"
              onClick={() => setIsIntegrationModalOpen(true)}
              title={lang === 'vi' ? 'Kết nối lịch trình với công cụ phát triển bên ngoài' : '외부 개발도구 일정 연동'}
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 hover:text-blue-700 font-bold text-xs flex items-center gap-1.5 transition shadow-2xs shrink-0 whitespace-nowrap"
            >
              <KeyRound className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Open API</span>
            </button>

            {/* [0.5] Workforce Capacity Board Button */}
            <button
              type="button"
              data-testid="workforce-capacity-nav-btn"
              onClick={() => navigate('/workforce-capacity')}
              title={lang === 'vi' ? 'Xem công suất nhân lực' : '작업자 투입 현황 모니터링'}
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 hover:text-blue-700 font-bold text-xs flex items-center gap-1.5 transition shadow-2xs shrink-0 whitespace-nowrap"
            >
              <Users className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>{lang === 'vi' ? 'Công suất' : '인력 현황'}</span>
            </button>

            <TodayWorklogNavButton worker={currentWorker} language={lang === 'vi' ? 'vi' : 'ko'} onOpen={() => navigate('/worklog/today')} />

            {/* [0.6] Print Output System Dropdown */}
            <PrintDropdownMenu
              selectedProjectIds={selectedProjectIds}
              lang={lang}
            />

            {/* [1] Project Status Tabs — Open API 바로 오른쪽 */}
            <div
              data-testid="overview-project-status-tabs"
              className="flex items-center gap-1 shrink-0"
            >
              <div className="flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs font-semibold shrink-0" role="tablist" aria-label="Project Status Tabs">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'ALL'}
                  aria-pressed={activeTab === 'ALL'}
                  data-testid="all-tab-btn"
                  onClick={() => setActiveTab('ALL')}
                  className={`px-2 py-1 rounded-md transition font-bold whitespace-nowrap text-xs ${
                    activeTab === 'ALL'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="hidden xl:inline">{t('allProjectsTab')}</span>
                  <span className="xl:hidden">{t('allTabCompact')}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'ACTIVE'}
                  aria-pressed={activeTab === 'ACTIVE'}
                  data-testid="active-tab-btn"
                  onClick={() => setActiveTab('ACTIVE')}
                  className={`px-2 py-1 rounded-md transition font-bold whitespace-nowrap text-xs ${
                    activeTab === 'ACTIVE'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="hidden xl:inline">{t('activeProjects')}</span>
                  <span className="xl:hidden">{t('activeTabCompact')}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'COMPLETED'}
                  aria-pressed={activeTab === 'COMPLETED'}
                  data-testid="completed-tab-btn"
                  onClick={() => setActiveTab('COMPLETED')}
                  className={`px-2 py-1 rounded-md transition font-bold whitespace-nowrap text-xs ${
                    activeTab === 'COMPLETED'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="hidden xl:inline">{t('completedProjects')}</span>
                  <span className="xl:hidden">{t('completedTabCompact')}</span>
                </button>
              </div>
              {activeTab === 'COMPLETED' && (
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="h-7 text-xs font-bold bg-white border border-slate-200 rounded-lg px-1 text-slate-700 shadow-2xs focus:ring-1 focus:ring-blue-500 shrink-0"
                >
                  {completedYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}{lang === 'vi' ? '' : '년'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* [2] Calendar Manager / Readonly Badge */}
            {isExecutiveViewer(currentWorker) ? (
              <div
                data-testid="viewer-readonly-badge"
                className="h-8 px-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-extrabold flex items-center gap-1.5 shrink-0 shadow-xs"
              >
                <Lock className="w-3.5 h-3.5 text-red-600" />
                <span className="hidden sm:inline">{lang === 'vi' ? 'Chỉ xem' : '보기 전용'}</span>
              </div>
            ) : (
              <button
                type="button"
                data-testid="desktop-manage-calendar-btn"
                onClick={() => setIsCalendarModalOpen(true)}
                className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition shadow-xs shrink-0"
              >
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">{t('manageHolidays')}</span>
              </button>
            )}

            {/* [3] Worker Selector */}
            <TestActorModeBadge />
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700">{session?.actor.displayName || '-'}</span>

            {/* [4] Add Project */}
            {!isExecutiveViewer(currentWorker) && (
              <button
                type="button"
                data-testid="add-project-btn"
                onClick={handleOpenAddModal}
                className="h-8 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 transition shadow-xs shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('addProject')}</span>
              </button>
            )}
          </div>
        </header>
      )}

      {/* Mobile Toolbar Controls */}
      {isMobileView && (
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
      )}

      {/* Desktop Calendar Legend Row */}
      {!isMobileView && (
        <div
          data-testid="overview-legend-row"
          className="bg-white border-b border-slate-200 px-4 md:px-5 py-2 flex items-center justify-between gap-3 overflow-x-hidden"
        >
          <CalendarLegend isMobileView={false} />
        </div>
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
                holidays={[...krHolidays, ...vnHolidays]}
                overrides={calendarOverrides}
                onProjectClick={(p) => navigate(`/projects/${p.id}`)}
              />
            )}
            {mobileViewMode === 'GANTT' && (
              <MobileThirtyDayGanttView
                mode="OVERVIEW"
                projects={projects}
                dateColumns={dateColumns}
                holidays={[...krHolidays, ...vnHolidays]}
                overrides={calendarOverrides}
                onProjectClick={(p) => navigate(`/projects/${p.id}`)}
              />
            )}
          </div>
        ) : (
          /* Desktop Table View */
          <div className="space-y-3 flex-1 flex flex-col">
            {/* Today Summary Card */}
            <TodaySummaryCard
              currentWorker={currentWorker}
              holidays={[...krHolidays, ...vnHolidays]}
              overrides={calendarOverrides}
            />

            {/* Desktop Dedicated Gantt Control Row (Grid Centered Controls & Right Navigation) */}
            <div
              data-testid="overview-gantt-control-row"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
                alignItems: 'center',
              }}
              className="w-full px-1 py-1 text-slate-900 h-9 shrink-0"
            >
              {/* Left Empty Expansion Space */}
              <div className="min-w-0" />

              {/* Center View Controls & Date Range Badge */}
              <div
                data-testid="overview-gantt-view-controls"
                className="flex items-center gap-2 justify-center shrink-0"
              >
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

                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-extrabold text-slate-800 shrink-0 whitespace-nowrap">
                  <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>{rangeTitle}</span>
                </div>
              </div>

              {/* Right Navigation Controls */}
              <div
                data-testid="overview-gantt-navigation"
                className="justify-self-end flex items-center gap-1 bg-white border border-slate-300 p-0.5 rounded-lg shadow-2xs shrink-0"
              >
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
                  position: 'relative',
                  isolation: 'isolate',
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

                  {/* Month Header Row (Row 1, 28px)
                      idx > 0인 Month Group에 2px Slate Separator 적용 (box-sizing:border-box 유지로 Width 무변) */}
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
                        data-month-group={mg.monthStr}
                        style={{
                          gridColumn: `${mg.startIndex + 1} / span ${mg.span}`,
                          boxSizing: 'border-box',
                          // 첫 번째 Month Group 제외: idx > 0이면 2px Slate Separator
                          borderLeft: idx > 0 ? '2px solid rgba(100,116,139,0.32)' : undefined,
                        }}
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

                      // Month Boundary: idx > 0이고 이전 col과 월(YYYY-MM)이 다를 때
                      const isMonthStart = idx > 0 && col.dateStr.slice(0, 7) !== dateColumns[idx - 1].dateStr.slice(0, 7);

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
                          data-month-boundary={isMonthStart ? 'true' : undefined}
                          aria-label={ariaText}
                          onClick={() => setHeaderInfoState({ isOpen: true, dateStr: col.dateStr, dayName: col.dayName })}
                          style={{
                            boxSizing: 'border-box',
                            // Month Start: 2px Slate Separator (box-sizing:border-box → Column Width 변화 없음)
                            borderLeft: isMonthStart ? '2px solid rgba(100,116,139,0.32)' : undefined,
                          }}
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
                <div className="divide-y divide-slate-200 text-sm flex flex-col relative isolate">
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
                          data-project-start={project.start_date}
                          data-project-end={project.end_date}
                          onClick={() => navigate(`/projects/${project.id}`)}
                          style={{ position: 'relative', isolation: 'isolate', minHeight: '72px', height: 'auto' }}
                          className="flex items-stretch hover:bg-blue-50/50 transition cursor-pointer group"
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
                            className="sticky left-0 self-stretch bg-white group-hover:!bg-[#f8fafc] px-3 py-2 border-r border-slate-200 shrink-0 flex items-center relative"
                          >
                            <div className="flex items-start justify-between w-full h-full gap-2 py-1">
                              {/* Selection Checkbox for A3 Combined Print */}
                              <input
                                type="checkbox"
                                data-testid={`project-select-checkbox-${project.id}`}
                                checked={selectedProjectIds.includes(project.id)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  if (e.target.checked) {
                                    if (selectedProjectIds.length >= 3) {
                                      alert(lang === 'vi' ? 'Chỉ được chọn tối đa 3 dự án' : 'A3 통합 일정표는 최대 3개 프로젝트까지만 선택 가능합니다.');
                                      return;
                                    }
                                    setSelectedProjectIds([...selectedProjectIds, project.id]);
                                  } else {
                                    setSelectedProjectIds(selectedProjectIds.filter((id) => id !== project.id));
                                  }
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0 mt-0.5"
                                title={lang === 'vi' ? 'Chọn dự án để in kết hợp A3' : 'A3 통합 일정표 출력을 위한 프로젝트 선택 (2~3개)'}
                              />
                              <div className="pr-1 overflow-hidden min-w-0 flex-1 flex flex-col justify-center gap-1">
                                {/* Line 1: Dedicated Project Name & Top Action Group */}
                                <div className="flex items-start justify-between gap-1.5 w-full min-w-0">
                                  <div
                                    data-testid={`project-name-row-${project.id}`}
                                    className="font-bold text-slate-900 group-hover:text-blue-600 transition flex items-center gap-1 text-xs min-w-0 flex-1"
                                    title={displayName}
                                  >
                                    <span className="line-clamp-2 leading-tight min-w-0 shrink break-words">{displayName}</span>
                                    {isFallback && (
                                      <span className="text-[9px] text-slate-500 bg-slate-100 px-1 rounded shrink-0 border border-slate-200 font-normal">
                                        {t('originalTag')}
                                      </span>
                                    )}
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  </div>

                                  <div
                                    data-testid={`project-action-group-${project.id}`}
                                    className="shrink-0 flex items-center gap-1 whitespace-nowrap"
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
                                          className="w-5 h-5 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 flex items-center justify-center transition shadow-2xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        >
                                          <Pencil className="w-2.5 h-2.5" />
                                        </button>
                                        <button
                                          type="button"
                                          data-testid={`project-delete-btn-${project.id}`}
                                          aria-label={lang === 'vi' ? 'Xóa dự án' : '프로젝트 삭제'}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenDeleteModal(project);
                                          }}
                                          className="w-5 h-5 rounded-md border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-slate-500 hover:text-rose-600 flex items-center justify-center transition shadow-2xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-rose-500"
                                        >
                                          <Trash2 className="w-2.5 h-2.5" />
                                        </button>
                                      </>
                                    )}
                                    {(() => {
                                      const isLifecycleCompleted = project.status === 'COMPLETED';
                                      const isPendingCompletion = project.status === 'ACTIVE' && project.schedule_state === 'COMPLETED';
                                      const isDelayed = project.status === 'ACTIVE' && project.schedule_state === 'DELAYED';
                                      const isInProgress = project.status === 'ACTIVE' && project.schedule_state === 'IN_PROGRESS';

                                      return (
                                        <span
                                          data-testid={`project-status-badge-${project.id}`}
                                          title={
                                            isPendingCompletion
                                              ? (lang === 'vi'
                                                  ? 'Tiến độ đã đạt 100% nhưng dự án chưa được xác nhận hoàn thành.'
                                                  : '예정된 일정과 세부 작업은 100% 완료되었지만, 프로젝트 완료 확정이 아직 처리되지 않았습니다.')
                                              : undefined
                                          }
                                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border select-none whitespace-nowrap ${
                                            isLifecycleCompleted
                                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200 cursor-default'
                                              : isPendingCompletion
                                              ? 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold cursor-pointer hover:bg-amber-200'
                                              : isDelayed
                                              ? 'bg-rose-100 text-rose-800 border-rose-200 cursor-default'
                                              : isInProgress
                                              ? 'bg-blue-100 text-blue-800 border-blue-200 cursor-default'
                                              : 'bg-slate-100 text-slate-700 border-slate-200 cursor-default'
                                          }`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (isPendingCompletion && !isExecutiveViewer(currentWorker)) {
                                              handleCompleteProject(project);
                                            }
                                          }}
                                        >
                                          {isLifecycleCompleted
                                            ? (lang === 'vi' ? 'Hoàn thành' : '완료')
                                            : isPendingCompletion
                                            ? (lang === 'vi' ? 'Cần xác nhận' : '완료 확인 필요')
                                            : isDelayed
                                            ? (lang === 'vi' ? 'Chậm' : '지연')
                                            : isInProgress
                                            ? (lang === 'vi' ? '진행' : '진행 중')
                                            : (lang === 'vi' ? 'Sắp' : '예정')}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </div>

                                {/* Line 2: Baseline / Forecast */}
                                <div
                                  data-testid={`project-foundation-dates-${project.id}`}
                                  className="text-[9px] text-slate-500 font-medium leading-tight whitespace-nowrap"
                                >
                                  {lang === 'vi' ? 'Cơ sở' : '기준'} {(project.baseline_end_date || project.end_date)?.slice(5)}
                                  <span className="mx-1">·</span>
                                  {lang === 'vi' ? 'Dự kiến' : '예상'} {(project.current_forecast_end_date || project.end_date)?.slice(5)}
                                  <span className="mx-1">·</span>
                                  {lang === 'vi' ? 'Chênh' : '변동'} {project.schedule_variance_workdays ?? 0}{lang === 'vi' ? ' ngày' : '일'}
                                </div>

                                {/* Line 3: Foundation Progress */}
                                <div
                                  data-testid={`project-progress-summary-${project.id}`}
                                  className="text-[9px] font-semibold text-slate-600 flex items-center gap-1 select-none whitespace-nowrap leading-tight"
                                >
                                  <span>{lang === 'vi' ? 'KH' : '계획'} {project.baseline_planned_progress_as_of_today ?? project.planned_progress ?? project.progress ?? 0}%</span>
                                  <span>·</span>
                                  <span className="font-extrabold text-emerald-700">{lang === 'vi' ? 'TT' : '실제'} {project.current_actual_overall_progress ?? project.actual_progress ?? project.progress ?? 0}%</span>
                                  <span>·</span>
                                  <span className={(project.progress_variance_percentage_point ?? 0) < 0 ? 'text-rose-700' : 'text-blue-700'}>
                                    {lang === 'vi' ? 'Δ' : '편차'} {(project.progress_variance_percentage_point ?? 0) > 0 ? '+' : ''}{project.progress_variance_percentage_point ?? 0}%p
                                  </span>
                                </div>

                                {/* Line 4: Warning Badges (Flex-Wrap) */}
                                <div
                                  data-testid={`project-meta-row-${project.id}`}
                                  className="flex items-center gap-1.5 flex-wrap min-w-0 mt-0.5"
                                >
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
                                  {project.progress_confidence === 'PROVISIONAL' && (
                                    <span
                                      data-testid={`project-progress-confidence-${project.id}`}
                                      title={project.difference_reason || ''}
                                      className="shrink-0 text-[9px] font-extrabold text-amber-800 bg-amber-50 px-1 py-0.5 rounded border border-amber-300"
                                    >
                                      {lang === 'vi' ? 'Tạm tính' : '임시 산정'}
                                    </span>
                                  )}
                                  {project.has_legacy_bootstrap && (
                                    <span
                                      data-testid={`project-legacy-bootstrap-${project.id}`}
                                      title={lang === 'vi' ? 'Dữ liệu do hệ thống tạo tại thời điểm chuyển đổi; không phải nhật ký công việc của nhân viên.' : '시스템이 전환 시 생성한 기준 데이터이며 직원 업무일지가 아닙니다.'}
                                      className="shrink-0 text-[9px] font-bold text-violet-700 bg-violet-50 px-1 py-0.5 rounded border border-violet-200"
                                    >
                                      {lang === 'vi' ? 'Cơ sở chuyển đổi' : '전환 기준 데이터'}
                                    </span>
                                  )}
                                  {project.shadow_status === 'STALE' && (
                                    <span data-testid={`project-shadow-stale-${project.id}`} className="shrink-0 text-[9px] font-extrabold text-amber-800 bg-amber-50 px-1 py-0.5 rounded border border-amber-300">{lang === 'vi' ? 'Shadow cũ' : 'Shadow 재계산 필요'}</span>
                                  )}
                                  {project.shadow_is_fresh && project.shadow_forecast_end_date && (
                                    <span data-testid={`project-shadow-fresh-${project.id}`} className="shrink-0 text-[9px] font-extrabold text-violet-700 bg-violet-50 px-1 py-0.5 rounded border border-violet-200">{lang === 'vi' ? `Shadow ${project.shadow_forecast_end_date.slice(5)}` : `Shadow ${project.shadow_forecast_end_date.slice(5)}`}</span>
                                  )}
                                  {!isAllocationsLoading ? (
                                    <ProjectReadinessPopover
                                      readiness={calculateProjectReadiness(project, allTasks, allocationsMap[project.id] || [], workers, [...krHolidays, ...vnHolidays], calendarOverrides)}
                                      projectName={displayName}
                                      hideIfReady={true}
                                      onOpenWorkforceModal={() => handleOpenWorkforceModal(project)}
                                    />
                                  ) : (
                                    <span className="text-[9px] text-slate-400 animate-pulse px-1 py-0.5 rounded border border-slate-100 bg-slate-50 select-none">
                                      ...
                                    </span>
                                  )}
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
                          <div role="cell" data-testid={`project-timeline-${project.id}`} style={{ width: `${timelineWidth}px`, minWidth: `${timelineWidth}px` }} className="relative self-stretch shrink-0">
                            {/* Layer 0: Full-height day grid and calendar background colors */}
                            <div className="absolute inset-0 grid w-full h-full" style={{ gridTemplateColumns: dateGridTemplate }}>
                              {dateColumns.map((col, cIdx) => {
                                const isMonthStartBody = cIdx > 0 && col.dateStr.slice(0, 7) !== dateColumns[cIdx - 1].dateStr.slice(0, 7);
                                const offInfo = getCountryOffState(col.dateStr, calendarOverrides, krHolidays.concat(vnHolidays));
                                const token = getCalendarVisualStyle(offInfo.state === 'BOTH_WORK' ? 'WORKDAY' : (offInfo.state as CalendarVisualState));
                                return (
                                  <div
                                    key={cIdx}
                                    data-testid={`gantt-task-cell-overview-${project.id}-${col.dateStr}`}
                                    data-month-boundary={isMonthStartBody ? 'true' : undefined}
                                    data-country-off-state={offInfo.state}
                                    style={{
                                      boxSizing: 'border-box',
                                      borderLeft: isMonthStartBody ? '2px solid rgba(100,116,139,0.32)' : undefined,
                                    }}
                                    className={`h-full border-r border-slate-200 relative overflow-hidden select-none ${token.headerClass}`}
                                  />
                                );
                              })}
                            </div>

                            {/* Layer 5: Today Overlay */}
                            <TodayColumnOverlay dateColumns={dateColumns} dayWidthPx={timelineWidth / dateColumns.length} />

                            {/* Layer 10: ScheduleBar. The fill is actual progress only;
                                elapsed calendar time must never manufacture actual work. */}
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

                              const todayStr = new Date().toISOString().slice(0, 10);

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
                                      showPlannedMarker
                                    />
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Layer 5: Country-off hatch stays behind the schedule bar */}
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
                  <GanttMonthBoundaryOverlay
                    dateColumns={dateColumns}
                    dayWidthPx={timelineWidth / (dateColumns.length || 1)}
                    leftOffsetPx={OVERVIEW_LEFT_WIDTH}
                    timelineWidthPx={timelineWidth}
                    surface="overview"
                  />
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
        onAcknowledgeGroup={async (group) => {
          if (conflictModalState.projectId) {
            await api.acknowledgeConflict(conflictModalState.projectId, group.fingerprint);
            await fetchProjects();
          }
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

      {completeModalState.project && (
        <ProjectCompleteConfirmModal
          isOpen={completeModalState.isOpen}
          project={completeModalState.project}
          incompleteTasks={completeModalState.incompleteTasks}
          onClose={() => setCompleteModalState({ isOpen: false, project: null, incompleteTasks: [] })}
          onViewIncompleteTasks={() => {
            if (completeModalState.project) {
              navigate(`/projects/${completeModalState.project.id}?filter=incomplete`);
            }
          }}
          onConfirmBatchComplete={handleConfirmBatchCompleteProject}
        />
      )}

      <IntegrationManagerModal
        isOpen={isIntegrationModalOpen}
        onClose={() => setIsIntegrationModalOpen(false)}
        currentWorker={currentWorker}
      />

      {selectedWorkforceProject && (
        <ProjectWorkforceModal
          isOpen={isWorkforceModalOpen}
          project={selectedWorkforceProject}
          workers={workers}
          tasks={allTasks}
          onClose={() => {
            setIsWorkforceModalOpen(false);
            setSelectedWorkforceProject(null);
          }}
          onSaved={fetchProjects}
        />
      )}

      {conflictModalState.isOpen && (
        <WorkerConflictSummaryModal
          isOpen={conflictModalState.isOpen}
          projectName={conflictModalState.projectName}
          conflicts={conflictModalState.conflicts}
          onClose={() => setConflictModalState({ isOpen: false, conflicts: [] })}
          onAcknowledgeGroup={async (group) => {
            if (conflictModalState.projectId) {
              await api.acknowledgeConflict(conflictModalState.projectId, group.fingerprint || (group as any).conflict_fingerprint);
              await fetchProjects();
            }
          }}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div
          data-testid="overview-toast"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl border border-slate-800 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Build Version Indicator */}
      <BuildVersionIndicator />
    </div>
  );
};

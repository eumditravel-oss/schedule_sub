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
import { Plus, ChevronRight, Calendar, Lock } from 'lucide-react';

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

      // Auto resolve worker language
      const savedId = getCurrentWorkerId();
      const found = workerList.find((w) => w.id === savedId || w.name === savedId);
      if (found) {
        setCurrentWorker(found);
        setLanguage(found.ui_language || (found.country_code === 'VN' ? 'vi' : 'ko'));
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

  const handleEditProject = (project: Project) => {
    if (isExecutiveViewer(currentWorker)) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (!requireWorkerSelection()) return;
    setSelectedProject(project);
    setIsModalOpen(true);
  };

  const handleDeleteProject = async (project: Project) => {
    if (isExecutiveViewer(currentWorker)) {
      alert(lang === 'vi' ? 'Tài khoản quản lý chỉ có quyền xem lịch trình.' : '경영진 계정은 일정을 조회할 수만 있습니다.');
      return;
    }
    if (!requireWorkerSelection()) return;
    if (!confirm(t('deleteConfirmText'))) return;
    try {
      await api.deleteProject(project.id);
      await fetchProjects();
      await fetchCompletedYears();
    } catch (err: any) {
      alert(getLocalizedErrorMessage(err, t));
    }
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

      {/* Navigation / Tab Controls */}
      <div className="bg-white border-b border-slate-200 px-3 md:px-5 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        {/* Left: Active vs Completed Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex p-0.5 bg-slate-100 rounded-lg border border-slate-200/80 text-xs font-semibold">
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

        {/* Mobile / Tablet View Mode Controls (Always visible in Active & Completed tabs) */}
        {isMobileView ? (
          <div className="flex flex-col gap-2 w-full">
            <div role="tablist" aria-label="Mobile View Modes" className="flex items-center p-0.5 bg-slate-200/80 rounded-lg text-xs font-semibold w-full">
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
          </div>
        ) : (
          <GanttViewControls
            viewMode={viewMode}
            rangeTitle={rangeTitle}
            onViewModeChange={changeViewMode}
            onPrevious={goPrevious}
            onNext={goNext}
            onToday={goToday}
          />
        )}
      </div>

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
                onDeleteProject={handleDeleteProject}
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
                    const krHol = krHolidays.find((h) => h.holiday_date === col.dateStr);
                    const vnHol = vnHolidays.find((h) => h.holiday_date === col.dateStr);
                    const tooltip = [
                      krHol ? `KR: ${krHol.name_ko || krHol.name_local}` : null,
                      vnHol ? `VN: ${vnHol.name_vi || vnHol.name_local}` : null,
                    ]
                      .filter(Boolean)
                      .join(' / ');

                    return (
                      <th
                        key={idx}
                        title={tooltip || undefined}
                        style={{ width: `${GANTT_DAY_WIDTH_PX}px`, minWidth: `${GANTT_DAY_WIDTH_PX}px`, maxWidth: `${GANTT_DAY_WIDTH_PX}px` }}
                        className={`text-center py-1 border-r border-slate-200 text-[11px] font-medium ${
                          col.isToday
                            ? 'bg-blue-100 text-blue-800 font-bold'
                            : krHol || vnHol
                            ? 'bg-rose-50/80 text-rose-700 font-bold'
                            : col.isWeekend
                            ? 'bg-slate-50 text-slate-400'
                            : 'bg-white text-slate-600'
                        }`}
                      >
                        <div>{col.dayNum}</div>
                        <div className="text-[9px] scale-90">{col.dayName}</div>
                        <div className="flex items-center justify-center gap-0.5 mt-0.5">
                          {krHol && <span className="text-[8px] font-extrabold px-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">KR</span>}
                          {vnHol && <span className="text-[8px] font-extrabold px-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">VN</span>}
                        </div>
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

                        {dateColumns.map((col, cIdx) => {
                          const isBarStart = isVisible && cIdx === startIndex;

                          return (
                            <td
                              key={cIdx}
                              style={{ width: `${GANTT_DAY_WIDTH_PX}px`, minWidth: `${GANTT_DAY_WIDTH_PX}px`, maxWidth: `${GANTT_DAY_WIDTH_PX}px` }}
                              className={`p-0 relative border-r border-slate-200 align-middle ${
                                col.isToday
                                  ? 'bg-blue-50/60'
                                  : col.isWeekend
                                  ? 'bg-slate-50/60'
                                  : 'bg-white'
                              }`}
                            >
                              {isBarStart && (
                                <div
                                  style={{ width: `${barWidthPx}px` }}
                                  className="absolute left-0.5 top-1/2 -translate-y-1/2 h-7 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-md shadow-xs text-white text-xs font-bold flex items-center px-2 z-10 transition-all truncate"
                                >
                                  <span className="truncate">{displayName} ({project.progress}%)</span>
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
    </div>
  );
};

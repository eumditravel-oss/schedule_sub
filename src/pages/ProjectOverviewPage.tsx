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
import { Plus, ChevronRight, Calendar, Lock } from 'lucide-react';

export type MobileViewMode = 'SUMMARY' | 'WEEK' | 'GANTT';

export const ProjectOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, lang, setLanguage } = useI18n();
  const { isMobile } = useResponsiveLayout();

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans max-w-full overflow-x-hidden">
      {/* Header */}
      {isMobile ? (
        <MobileAppHeader
          currentWorker={currentWorker}
          onOpenWorkerSheet={() => setIsMobileWorkerSheetOpen(true)}
          onOpenCalendarModal={() => setIsCalendarModalOpen(true)}
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

            {activeTab === 'ACTIVE' && isEditableWorker(currentWorker) && (
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

      {/* Tabs & Controls */}
      <div className="bg-slate-50 border-b border-slate-200 px-3 md:px-5 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0 w-full">
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

        {/* Mobile View Mode Controls */}
        {isMobile ? (
          <div className="flex flex-col gap-2 w-full">
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

      {/* Main Content */}
      <main className="flex-1 p-3 md:p-5 overflow-x-hidden flex flex-col">
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

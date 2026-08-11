// src/pages/print/PrintViewPage.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Project, Task, TaskGroup, Worker, CountryHoliday, CalendarOverride, ProjectWorkerAllocation } from '../../types';
import { api, getCurrentWorkerName } from '../../services/api';
import { PrintToolbar } from '../../components/print/PrintToolbar';
import { PrintPageShell } from '../../components/print/PrintPageShell';
import { PrintColorMode } from '../../utils/printVisualTokens';
import { PrintProjectSummaryA4 } from '../../components/print/PrintProjectSummaryA4';
import { PrintMonthlyProjectsA4 } from '../../components/print/PrintMonthlyProjectsA4';
import { PrintHalfYearProjectsA4 } from '../../components/print/PrintHalfYearProjectsA4';
import { PrintYearProjectsA4 } from '../../components/print/PrintYearProjectsA4';
import { PrintProjectFullA3 } from '../../components/print/PrintProjectFullA3';
import { PrintRolling30A3 } from '../../components/print/PrintRolling30A3';
import { PrintCombinedProjectsA3 } from '../../components/print/PrintCombinedProjectsA3';
import { useI18n } from '../../hooks/useI18n';
import { getKoreaDateString, getKoreaBusinessMonth, getKoreaBusinessYear } from '../../utils/dateUtils';

export type TemplateType =
  | 'summary-a4'
  | 'month-a4'
  | 'half-year-a4'
  | 'year-a4'
  | 'full-a3'
  | 'rolling-30-a3'
  | 'combined-a3';

export const PrintViewPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams<{ projectId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { lang: appLang, setLanguage } = useI18n();

  // Determine template type from pathname
  const pathname = location.pathname;
  let templateType: TemplateType = 'summary-a4';
  if (pathname.includes('/summary-a4')) templateType = 'summary-a4';
  else if (pathname.includes('/month-a4')) templateType = 'month-a4';
  else if (pathname.includes('/half-year-a4')) templateType = 'half-year-a4';
  else if (pathname.includes('/year-a4')) templateType = 'year-a4';
  else if (pathname.includes('/full-a3')) templateType = 'full-a3';
  else if (pathname.includes('/rolling-30-a3')) templateType = 'rolling-30-a3';
  else if (pathname.includes('/combined-a3')) templateType = 'combined-a3';

  // Every report is intentionally landscape-only for a consistent management-report layout.
  const defaultPaper = templateType.endsWith('-a3') ? 'a3' : 'a4';

  // State from URL query parameters or defaults
  const [paper, setPaper] = useState<'a4' | 'a3'>((searchParams.get('paper') as any) || defaultPaper);
  const orientation = 'landscape' as const;
  const [colorMode, setColorMode] = useState<PrintColorMode>((searchParams.get('colorMode') as any) || 'color');
  const [lang, setLang] = useState<'ko' | 'vi'>((searchParams.get('lang') as any) || appLang || 'ko');

  // Query Data states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [allocations, setAllocations] = useState<ProjectWorkerAllocation[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [krHolidays, setKrHolidays] = useState<CountryHoliday[]>([]);
  const [vnHolidays, setVnHolidays] = useState<CountryHoliday[]>([]);
  const [calendarOverrides, setCalendarOverrides] = useState<CalendarOverride[]>([]);

  const viewerName = getCurrentWorkerName() || 'CEO / COO Viewer';
  const referenceDate = getKoreaDateString();

  // Sync state to search params
  const updateUrlParam = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set(key, value);
    setSearchParams(newParams, { replace: true });
  };

  const handlePaperChange = (p: 'a4' | 'a3') => {
    setPaper(p);
    updateUrlParam('paper', p);
  };

  const handleColorModeChange = (mode: PrintColorMode) => {
    setColorMode(mode);
    updateUrlParam('colorMode', mode);
  };

  const handleLangChange = (l: 'ko' | 'vi') => {
    setLang(l);
    setLanguage(l);
    updateUrlParam('lang', l);
  };

  // Fetch Read-Only Data for printing (Multi-Year Holiday Loading dynamically computed from query params)
  useEffect(() => {
    let isMounted = true;
    async function loadPrintData() {
      setLoading(true);
      setError(null);
      try {
        const startParam = searchParams.get('start') || searchParams.get('month') || getKoreaBusinessMonth();
        const yearParam = searchParams.get('year') || getKoreaBusinessYear();

        const targetYears = new Set<number>();
        targetYears.add(parseInt(getKoreaBusinessYear(), 10));

        if (yearParam) {
          const y = parseInt(yearParam, 10);
          if (!isNaN(y)) targetYears.add(y);
        }
        if (startParam) {
          const y = parseInt(startParam.substring(0, 4), 10);
          const mm = startParam.length >= 7 ? startParam.substring(5, 7) : '';
          if (!isNaN(y)) {
            targetYears.add(y);
            // Only add adjacent years if date range actually crosses year boundary (December or January)
            if (mm === '12') targetYears.add(y + 1);
            if (mm === '01') targetYears.add(y - 1);
          }
        }

        const years = Array.from(targetYears);

        const krPromises = years.map((y) => api.getHolidays('KR', y).catch(() => []));
        const vnPromises = years.map((y) => api.getHolidays('VN', y).catch(() => []));

        const [allProjs, allWrks, krArrays, vnArrays, calOvers] = await Promise.all([
          api.getProjects('ALL'),
          api.getWorkers(),
          Promise.all(krPromises),
          Promise.all(vnPromises),
          api.getCalendarOverrides().catch(() => []),
        ]);

        const krFlat = krArrays.flat();
        const vnFlat = vnArrays.flat();

        const krMap = new Map<string, CountryHoliday>();
        for (const h of krFlat) krMap.set(h.id || `${h.country_code}_${h.holiday_date}`, h);
        const vnMap = new Map<string, CountryHoliday>();
        for (const h of vnFlat) vnMap.set(h.id || `${h.country_code}_${h.holiday_date}`, h);

        if (!isMounted) return;
        setProjects(allProjs);
        setWorkers(allWrks);
        setKrHolidays(Array.from(krMap.values()));
        setVnHolidays(Array.from(vnMap.values()));
        setCalendarOverrides(calOvers || []);

        if (projectId) {
          const detail = await api.getProjectDetail(projectId);
          if (!isMounted) return;
          setCurrentProject(detail.project);
          setTasks(detail.tasks);
          setTaskGroups(detail.task_groups);

          try {
            const allocs = await api.getProjectWorkerAllocations(projectId);
            if (isMounted) setAllocations(allocs);
          } catch {
            // optional worker allocations fallback
          }
        } else {
          // Fetch tasks for overview reports
          const allTsks = await api.getTasks();
          if (isMounted) setTasks(allTsks);
        }
      } catch (err: any) {
        if (isMounted) setError(err?.message || '출력 데이터 로드 중 오류가 발생했습니다.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadPrintData();
    return () => {
      isMounted = false;
    };
  }, [projectId, searchParams]);

  // Handle Print Action
  const handlePrint = () => {
    window.print();
  };

  const handleClose = () => {
    if (projectId) {
      navigate(`/projects/${projectId}`);
    } else {
      navigate('/projects');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 text-slate-700 font-sans text-sm">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="font-semibold">{lang === 'ko' ? '보고용 출력 양식 준비 중...' : 'Đang chuẩn bị trang in...'}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 text-slate-800 font-sans p-4">
        <div className="bg-white border border-rose-300 rounded-lg p-6 max-w-md shadow-lg text-center">
          <h2 className="text-lg font-bold text-rose-700 mb-2">{lang === 'ko' ? '출력 데이터 로드 실패' : 'Lỗi tải dữ liệu'}</h2>
          <p className="text-xs text-slate-600 mb-4">{error}</p>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded transition"
          >
            {lang === 'ko' ? '스케줄러로 돌아가기' : 'Quay lại'}
          </button>
        </div>
      </div>
    );
  }

  // Render Template Content based on templateType
  const renderTemplateContent = () => {
    const monthQuery = searchParams.get('month') || getKoreaBusinessMonth();
    const startQuery = searchParams.get('start') || getKoreaBusinessMonth();
    const yearQuery = searchParams.get('year') || getKoreaBusinessYear();
    const modeQuery = (searchParams.get('mode') as any) || 'today';
    const projectIdsStr = searchParams.get('projectIds') || '';
    const selectedIds = projectIdsStr.split(',').filter(Boolean);

    switch (templateType) {
      case 'summary-a4':
        return currentProject ? (
          <PrintProjectSummaryA4
            project={currentProject}
            tasks={tasks}
            taskGroups={taskGroups}
            allocations={allocations}
            workers={workers}
            colorMode={colorMode}
            lang={lang}
            viewerName={viewerName}
            referenceDate={referenceDate}
          />
        ) : (
          <div className="p-4 text-rose-600">{lang === 'ko' ? '선택된 프로젝트가 없습니다.' : 'Chưa chọn dự án.'}</div>
        );

      case 'month-a4':
        return (
          <PrintMonthlyProjectsA4
            monthStr={monthQuery}
            projects={projects}
            tasks={tasks}
            workers={workers}
            colorMode={colorMode}
            lang={lang}
            viewerName={viewerName}
            referenceDate={referenceDate}
          />
        );

      case 'half-year-a4':
        return (
          <PrintHalfYearProjectsA4
            startMonthStr={startQuery}
            projects={projects}
            tasks={tasks}
            workers={workers}
            colorMode={colorMode}
            lang={lang}
            viewerName={viewerName}
            referenceDate={referenceDate}
          />
        );

      case 'year-a4':
        return (
          <PrintYearProjectsA4
            yearStr={yearQuery}
            projects={projects}
            tasks={tasks}
            workers={workers}
            colorMode={colorMode}
            lang={lang}
            viewerName={viewerName}
            referenceDate={referenceDate}
          />
        );

      case 'full-a3':
        return currentProject ? (
          <PrintProjectFullA3
            project={currentProject}
            tasks={tasks}
            taskGroups={taskGroups}
            workers={workers}
            krHolidays={krHolidays}
            vnHolidays={vnHolidays}
            calendarOverrides={calendarOverrides}
            colorMode={colorMode}
            lang={lang}
            viewerName={viewerName}
            referenceDate={referenceDate}
          />
        ) : (
          <div className="p-4 text-rose-600">{lang === 'ko' ? '선택된 프로젝트가 없습니다.' : 'Chưa chọn dự án.'}</div>
        );

      case 'rolling-30-a3':
        return (
          <PrintRolling30A3
            startDateStr={searchParams.get('start') || undefined}
            mode={modeQuery}
            projects={projects}
            tasks={tasks}
            workers={workers}
            krHolidays={krHolidays}
            vnHolidays={vnHolidays}
            calendarOverrides={calendarOverrides}
            colorMode={colorMode}
            lang={lang}
            viewerName={viewerName}
            referenceDate={referenceDate}
          />
        );

      case 'combined-a3': {
        const selectedProjs = projects.filter((p) => selectedIds.includes(p.id));
        const isValidSelection = selectedProjs.length >= 2 && selectedProjs.length <= 3 && selectedProjs.length === selectedIds.length;

        if (!isValidSelection) {
          return (
            <div className="p-8 bg-white border border-rose-300 rounded-lg shadow-md max-w-lg mx-auto my-8 text-center text-slate-800">
              <div className="text-rose-600 font-extrabold text-base mb-2">
                {lang === 'vi' ? 'Lỗi chọn dự án kết hợp A3' : 'A3 통합 일정표 프로젝트 선택 오류'}
              </div>
              <p className="text-xs text-slate-600 mb-4">
                {lang === 'vi'
                  ? `Lịch trình tổng hợp A3 yêu cầu chọn chính xác từ 2 đến 3 dự án hợp lệ. (Đã chọn: ${selectedProjs.length}/${selectedIds.length})`
                  : `A3 선택 프로젝트 통합 일정표는 정확히 2~3개의 유효한 프로젝트를 선택해야 출력이 가능합니다. (현재 선택된 유효 프로젝트: ${selectedProjs.length}개)`}
              </p>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded transition"
              >
                {lang === 'ko' ? '프로젝트 목록으로 돌아가기' : 'Quay lại danh sách dự án'}
              </button>
            </div>
          );
        }

        return (
          <PrintCombinedProjectsA3
            selectedProjects={selectedProjs}
            allTasks={tasks}
            workers={workers}
            krHolidays={krHolidays}
            vnHolidays={vnHolidays}
            calendarOverrides={calendarOverrides}
            colorMode={colorMode}
            lang={lang}
            viewerName={viewerName}
            referenceDate={referenceDate}
          />
        );
      }

      default:
        return <div>Invalid print template</div>;
    }
  };

  return (
    <div className="print-view-wrapper min-h-screen bg-slate-200 pt-16 pb-12 print:p-0 print:bg-white select-none">
      {/* Dynamic @page CSS rule injection */}
      <style>{`
        @media print {
          @page {
            size: ${paper.toUpperCase()} ${orientation};
            margin: 0;
          }
        }
      `}</style>

      {/* Top Floating Toolbar */}
      <PrintToolbar
        paper={paper}
        orientation={orientation}
        colorMode={colorMode}
        lang={lang}
        onPaperChange={handlePaperChange}
        onColorModeChange={handleColorModeChange}
        onLangChange={handleLangChange}
        onPrint={handlePrint}
        onClose={handleClose}
      />

      {/* Printable Document Container */}
      <main className="print-document-container flex justify-center">
        {['summary-a4', 'month-a4', 'year-a4', 'full-a3', 'combined-a3'].includes(templateType) ? (
          renderTemplateContent()
        ) : (
          <PrintPageShell paper={paper} orientation={orientation} colorMode={colorMode}>
            {renderTemplateContent()}
          </PrintPageShell>
        )}
      </main>
    </div>
  );
};

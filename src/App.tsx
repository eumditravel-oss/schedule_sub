import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { PilotAuthProvider } from './auth/PilotAuthContext';
import { RequirePilotAuth } from './auth/RequirePilotAuth';

const ProjectOverviewPage = lazy(() =>
  import('./pages/ProjectOverviewPage').then((module) => ({ default: module.ProjectOverviewPage }))
);
const ProjectDetailPage = lazy(() =>
  import('./pages/ProjectDetailPage').then((module) => ({ default: module.ProjectDetailPage }))
);
const WorkforceCapacityPage = lazy(() =>
  import('./pages/WorkforceCapacityPage').then((module) => ({ default: module.WorkforceCapacityPage }))
);
const PrintViewPage = lazy(() =>
  import('./pages/print/PrintViewPage').then((module) => ({ default: module.PrintViewPage }))
);
const DailyWorklogQaPage = lazy(() =>
  import('./pages/qa/DailyWorklogQaPage').then((module) => ({ default: module.DailyWorklogQaPage }))
);
const WorklogTodayPage = lazy(() =>
  import('./pages/WorklogTodayPage').then((module) => ({ default: module.WorklogTodayPage }))
);
const ShadowSchedulePage = lazy(() =>
  import('./pages/ShadowSchedulePage').then((module) => ({ default: module.ShadowSchedulePage }))
);
const ScheduleControlPage = lazy(() =>
  import('./pages/ScheduleControlPage').then((module) => ({ default: module.ScheduleControlPage }))
);
const PilotLoginPage = lazy(() =>
  import('./pages/PilotLoginPage').then((module) => ({ default: module.PilotLoginPage }))
);

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm font-semibold text-slate-600">
      화면을 불러오는 중입니다…
    </div>
  );
}

function BuggyTestComponent(): JSX.Element {
  throw new Error('Intentional Error Boundary Test Trigger');
}

export function App() {
  const isDebugAllowed =
    import.meta.env.MODE !== 'production' ||
    (typeof window !== 'undefined' &&
      (window.location.hostname.includes('-qa') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));

  return (
    <ErrorBoundary fallbackViewName="App Main Router">
      <PilotAuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
          <Route path="/login" element={<PilotLoginPage />} />
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route
            path="/projects"
            element={
              <ErrorBoundary fallbackViewName="Project Overview Page">
                <RequirePilotAuth><ProjectOverviewPage /></RequirePilotAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              <ErrorBoundary fallbackViewName="Project Detail Page">
                <RequirePilotAuth><ProjectDetailPage /></RequirePilotAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="/workforce-capacity"
            element={
              <ErrorBoundary fallbackViewName="Workforce Capacity Page">
                <RequirePilotAuth><WorkforceCapacityPage /></RequirePilotAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="/qa/daily-worklog"
            element={
              <ErrorBoundary fallbackViewName="Daily Worklog QA Harness">
                <RequirePilotAuth><DailyWorklogQaPage /></RequirePilotAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="/worklog/today"
            element={
              <ErrorBoundary fallbackViewName="Employee Daily Worklog">
                <RequirePilotAuth><WorklogTodayPage /></RequirePilotAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="/worklog/history"
            element={
              <ErrorBoundary fallbackViewName="Employee Worklog History">
                <RequirePilotAuth><WorklogTodayPage initialView="HISTORY" /></RequirePilotAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="/projects/:projectId/shadow-schedule"
            element={
              <ErrorBoundary fallbackViewName="Shadow Schedule Preview">
                <RequirePilotAuth><ShadowSchedulePage /></RequirePilotAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="/projects/:projectId/schedule-control"
            element={
              <ErrorBoundary fallbackViewName="Official Forecast Schedule Control">
                <RequirePilotAuth><ScheduleControlPage /></RequirePilotAuth>
              </ErrorBoundary>
            }
          />
          {/* Print Report System Routes */}
          <Route
            path="/print/project/:projectId/summary-a4"
            element={
              <ErrorBoundary fallbackViewName="Print A4 Summary">
                <RequirePilotAuth><PrintViewPage /></RequirePilotAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="/print/projects/month-a4"
            element={
              <ErrorBoundary fallbackViewName="Print A4 Monthly">
                <RequirePilotAuth><PrintViewPage /></RequirePilotAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="/print/projects/half-year-a4"
            element={
              <ErrorBoundary fallbackViewName="Print A4 Half-Year">
                <RequirePilotAuth><PrintViewPage /></RequirePilotAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="/print/projects/year-a4"
            element={
              <ErrorBoundary fallbackViewName="Print A4 Annual Roadmap">
                <RequirePilotAuth><PrintViewPage /></RequirePilotAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="/print/project/:projectId/full-a3"
            element={
              <ErrorBoundary fallbackViewName="Print A3 Full Project Schedule">
                <RequirePilotAuth><PrintViewPage /></RequirePilotAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="/print/projects/rolling-30-a3"
            element={
              <ErrorBoundary fallbackViewName="Print A3 30-Day Rolling Schedule">
                <RequirePilotAuth><PrintViewPage /></RequirePilotAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="/print/projects/combined-a3"
            element={
              <ErrorBoundary fallbackViewName="Print A3 Combined Projects Schedule">
                <RequirePilotAuth><PrintViewPage /></RequirePilotAuth>
              </ErrorBoundary>
            }
          />
          {isDebugAllowed && (
            <Route
              path="/debug-error-boundary-test"
              element={
                <ErrorBoundary fallbackViewName="Debug Error Test View">
                  <BuggyTestComponent />
                </ErrorBoundary>
              }
            />
          )}
          <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      </PilotAuthProvider>
    </ErrorBoundary>
  );
}

export default App;

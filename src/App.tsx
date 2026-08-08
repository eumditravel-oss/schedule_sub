import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProjectOverviewPage } from './pages/ProjectOverviewPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { WorkforceCapacityPage } from './pages/WorkforceCapacityPage';
import { ErrorBoundary } from './components/common/ErrorBoundary';

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
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route
            path="/projects"
            element={
              <ErrorBoundary fallbackViewName="Project Overview Page">
                <ProjectOverviewPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              <ErrorBoundary fallbackViewName="Project Detail Page">
                <ProjectDetailPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/workforce-capacity"
            element={
              <ErrorBoundary fallbackViewName="Workforce Capacity Page">
                <WorkforceCapacityPage />
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
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;

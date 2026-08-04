// src/App.tsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProjectOverviewPage } from './pages/ProjectOverviewPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectOverviewPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

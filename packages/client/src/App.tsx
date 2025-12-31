import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MainLayout } from "./components/layout/MainLayout";
import { Skeleton } from "./components/Skeleton";

// Lazy load pages for better performance
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DataSources = lazy(() => import("./pages/DataSources"));
const IndexingConfigDetail = lazy(() => import("./pages/IndexingConfigDetail"));
const Schema = lazy(() => import("./pages/Schema"));
const Settings = lazy(() => import("./pages/Settings"));

function PageLoader() {
  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        <Skeleton width="200px" height="32px" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Skeleton height="150px" />
          <Skeleton height="150px" />
          <Skeleton height="150px" />
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <MainLayout>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route
                  path="/"
                  element={<Navigate to="/dashboard" replace />}
                />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/data-sources" element={<DataSources />} />
                <Route
                  path="/data-sources/:serverName/config"
                  element={<IndexingConfigDetail />}
                />
                <Route path="/schema" element={<Schema />} />
                <Route path="/settings" element={<Settings />} />
                {/* Legacy redirects */}
                <Route
                  path="/connections"
                  element={<Navigate to="/data-sources" replace />}
                />
                <Route
                  path="/indexing/:serverName"
                  element={
                    <Navigate to="/data-sources/:serverName/config" replace />
                  }
                />
                <Route
                  path="/indexing"
                  element={<Navigate to="/data-sources" replace />}
                />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </MainLayout>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;

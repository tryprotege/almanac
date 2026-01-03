import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MainLayout } from "./components/layout/MainLayout";
import { Skeleton } from "./components/Skeleton";
import { SetupRequired } from "./components/SetupRequired";
import { api } from "./lib/api";

// Lazy load pages for better performance
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DataSources = lazy(() => import("./pages/DataSources"));
const IndexingConfigDetail = lazy(() => import("./pages/IndexingConfigDetail"));
const Schema = lazy(() => import("./pages/Schema"));
const Settings = lazy(() => import("./pages/Settings"));
const OAuthCallback = lazy(() => import("./pages/OAuthCallback"));

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
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [checkingSetup, setCheckingSetup] = useState(true);

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      const response = await api.get("/config/env/status");
      if (response.data.success && response.data.data) {
        const { setupComplete, missing, configured } = response.data.data;
        setSetupComplete(setupComplete);

        // Log warnings for missing environment variables
        if (!setupComplete && missing && missing.length > 0) {
          console.warn(
            "⚠️ eBee Configuration Required - Missing environment variables:",
            missing
          );
          console.warn(
            "Please configure these variables in Settings → Environment or in packages/server/.env"
          );
        }

        // Log info about configured variables
        if (configured && configured.length > 0) {
          console.info("✓ Configured environment variables:", configured);
        }
      }
    } catch (err) {
      console.error("Failed to check setup status:", err);
      // On error, assume setup is not complete to show the setup screen
      setSetupComplete(false);
    } finally {
      setCheckingSetup(false);
    }
  };

  // Show loading state while checking setup
  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-secondary">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  // If setup is not complete, show setup required screen for all routes
  if (setupComplete === false) {
    return (
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route
              path="*"
              element={
                <SetupRequired onSetupComplete={() => setSetupComplete(true)} />
              }
            />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    );
  }

  // Normal app routes when setup is complete
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
                {/* OAuth callback */}
                <Route path="/oauth/callback" element={<OAuthCallback />} />
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

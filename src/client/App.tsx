import { Navigate, Route, Routes } from "react-router";
import { useHealth } from "./api/health.js";
import { BrandIcon } from "./components/BrandIcon.js";
import { BrandWordmark } from "./components/BrandWordmark.js";
import { Diagnostics } from "./components/Diagnostics.js";
import { Navigation } from "./components/Navigation.js";
import { ProjectName } from "./components/ProjectName.js";
import { RefreshControl } from "./components/RefreshControl.js";
import { ThemeToggle } from "./components/ThemeToggle.js";
import { ArchivedPage } from "./pages/ArchivedPage.js";
import { ChangesPage } from "./pages/ChangesPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { SpecsPage } from "./pages/SpecsPage.js";

/**
 * The health gate. No page in this or any later change is meaningful against a broken
 * environment, so the gate lives at the root and no page author has to handle the case.
 * Navigation and refresh render above it, and stay usable while it is closed.
 */
function Gate() {
  const { data: health, error, isPending } = useHealth();

  if (isPending) {
    return (
      <p className="loading" role="status">
        Checking your OpenSpec environment…
      </p>
    );
  }

  if (error || !health || health.status !== "ok") {
    return <Diagnostics health={health} error={error} />;
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/changes" replace />} />
      <Route path="/changes" element={<ChangesPage />} />
      <Route path="/archived" element={<ArchivedPage />} />
      <Route path="/specs" element={<SpecsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export function App() {
  const { data: health } = useHealth();

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__brand" role="img" aria-label="OpenSpec UI">
          <BrandIcon className="app__brand-icon" />
          <BrandWordmark className="app__brand-wordmark" />
        </span>
        <Navigation />
        <div className="app__header-tools">
          <ProjectName health={health} />
          <ThemeToggle />
          <RefreshControl />
        </div>
      </header>
      <main className="app__main">
        <Gate />
      </main>
    </div>
  );
}

/**
 * App Component - Root Application Component
 *
 * This is the main entry point for the Mesh Console application.
 * It manages the overall application state, navigation, authentication,
 * theme preferences, and renders the appropriate page based on the
 * active section.
 *
 * Features:
 * - Authentication flow with LoginPage
 * - Navigation with SideNavigationBar
 * - Theme switching (dark/light)
 * - Multiple page views (Monitor, Configuration, Device Information, Tools)
 * - Component remounting for state reset
 * - LocalStorage persistence for user preferences
 * - Configuration shortcut handling from status bar
 */

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import LoginPage from "./components/LoginPage.jsx";
import SideNavigationBar from "./components/SideNavigationBar.jsx";
import TopStatusBar from "./components/TopStatusBar.jsx";
import { LanguageProvider, useI18n } from "./i18n/index.js";

const ConfigurationPage = lazy(() => import("./components/ConfigurationPage.jsx"));
const DeviceInformation = lazy(() => import("./components/DeviceInformation.jsx"));
const AlarmEventLog = lazy(() => import("./components/AlarmEventLog.jsx"));
const MainCanvas = lazy(() => import("./components/MainCanvas.jsx"));
const ToolsPage = lazy(() => import("./components/ToolsPage.jsx"));

// Fallback mesh device target for local development or direct file previews.
const DEFAULT_DEVICE_IP = "192.168.10.33";
const SECONDARY_SECTION_OPTIONS = [
  "monitor",
  "tools",
  "configuration",
  "information",
  "logs",
];

function resolveDeviceIpFromBrowser() {
  if (typeof window === "undefined") return DEFAULT_DEVICE_IP;

  const { hostname } = window.location;
  const localHosts = new Set(["", "localhost", "127.0.0.1", "0.0.0.0", "::1"]);

  return localHosts.has(hostname) ? DEFAULT_DEVICE_IP : hostname;
}

/**
 * App Root Component
 *
 * Handles:
 * - Layout themes (dark/light)
 * - Navigation menu states (expanded/collapsed)
 * - Page routing (Monitor, Configuration, Information, Tools)
 * - Authentication state management
 * - Component remount keys for state reset
 * - LocalStorage persistence for user preferences
 *
 * @returns {JSX.Element} The rendered application
 */
function AppContent() {
  const { t } = useI18n();
  const deviceIp = useMemo(resolveDeviceIpFromBrowser, []);
  const sectionLabels = useMemo(
    () => ({
      monitor: t("nav.monitor", "Monitor"),
      configuration: t("nav.configuration", "Configuration"),
      tools: t("nav.tools", "Tools"),
      information: t("nav.information", "Information"),
      logs: t("nav.logs", "Logs"),
    }),
    [t],
  );

  // --- Authentication State ---
  // Boolean flag indicating if the user is authenticated
  const [authenticated, setAuthenticated] = useState(false);

  // --- Navigation State ---
  // Controls which main page is shown. The default page after login is Monitor,
  // so the topology canvas is the first screen users see.
  const [activeSection, setActiveSection] = useState("monitor");

  // Configuration navigation target (for deep-linking to specific sections)
  const [configurationTarget, setConfigurationTarget] = useState(null);
  const [splitViewEnabled, setSplitViewEnabled] = useState(
    () => localStorage.getItem("agil-split-view") === "enabled",
  );
  const [secondarySection, setSecondarySection] = useState(
    () => localStorage.getItem("agil-split-secondary") || "tools",
  );

  // Increment this when Monitor is clicked. Passing it as a React key remounts
  // MainCanvas, which resets node selection/search/details to the default view.
  const [monitorViewKey, setMonitorViewKey] = useState(0);

  // --- UI Preferences (stored in localStorage) ---
  // These affect the shell only, not the device API calls.

  // Theme preference: "dark" or "light"
  const [theme, setTheme] = useState(
    () => localStorage.getItem("agil-theme") || "dark",
  );

  // Sidebar collapsed state: true = collapsed, false = expanded
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("agil-sidebar") !== "expanded",
  );

  // Sync theme choices to LocalStorage
  useEffect(() => {
    localStorage.setItem("agil-theme", theme);
  }, [theme]);

  // Sync sidebar navigation collapsed states to LocalStorage
  useEffect(() => {
    localStorage.setItem(
      "agil-sidebar",
      sidebarCollapsed ? "collapsed" : "expanded",
    );
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem("agil-split-view", splitViewEnabled ? "enabled" : "disabled");
  }, [splitViewEnabled]);

  useEffect(() => {
    localStorage.setItem("agil-split-secondary", secondarySection);
  }, [secondarySection]);

  const accessibleSecondaryOptions = useMemo(
    () => SECONDARY_SECTION_OPTIONS.filter((section) => section !== activeSection),
    [activeSection],
  );

  useEffect(() => {
    if (!accessibleSecondaryOptions.includes(secondarySection)) {
      setSecondarySection(accessibleSecondaryOptions[0] || "monitor");
    }
  }, [accessibleSecondaryOptions, secondarySection]);

  /**
   * Handles dashboard section updates.
   * When a navigation item is clicked, this function updates the active section.
   *
   * Special behavior for Monitor: If the user clicks "Monitor" when already on it,
   * we increment monitorViewKey to force-remount the MainCanvas topology component
   * and clear selections (node selection, search, details panel).
   *
   * @param {string} section - Section identifier (monitor, configuration, information, tools)
   */
  function handleSectionChange(section) {
    setActiveSection(section);

    // The Monitor button should always return to the same default topology
    // presentation, even if a node detail card or search filter was open.
    if (section === "monitor") {
      setMonitorViewKey((value) => value + 1);
    }
  }

  /**
   * Handles logout from the sidebar.
   * Clears authentication state and resets dashboard state so the next login
   * always starts from Monitor default.
   */
  function handleLogout() {
    setAuthenticated(false);
    setActiveSection("monitor");
    setMonitorViewKey((value) => value + 1);
  }

  /**
   * Handles configuration shortcut navigation from the status bar.
   * Sets a configuration target with a unique nonce for component update.
   *
   * @param {Object} target - Navigation target with tab and section
   */
  function handleConfigShortcut(target) {
    if (!target) return;
    setConfigurationTarget({ ...target, nonce: Date.now() });
    setActiveSection("configuration");
  }

  function renderSection(section, pane = "primary") {
    if (section === "information") {
      return <DeviceInformation deviceIp={deviceIp} />;
    }

    if (section === "logs") {
      return <AlarmEventLog deviceIp={deviceIp} />;
    }

    if (section === "configuration") {
      return (
        <ConfigurationPage
          deviceIp={deviceIp}
          target={pane === "primary" ? configurationTarget : null}
        />
      );
    }

    if (section === "tools") {
      return <ToolsPage deviceIp={deviceIp} />;
    }

    return (
      <MainCanvas
        key={`${pane}-${monitorViewKey}`}
        deviceIp={deviceIp}
        activeSection={section}
        theme={theme}
      />
    );
  }

  // --- Authentication Check ---
  // If not authenticated, render the login page
  if (!authenticated) {
    return (
      <LoginPage
        deviceIp={deviceIp}
        theme={theme}
        onThemeChange={setTheme}
        onAuthenticated={() => {
          setAuthenticated(true);
        }}
      />
    );
  }

  // --- Main Application ---
  // Render the authenticated application with sidebar, workspace, and pages
  return (
    <div
      className={`app-shell ${theme} ${sidebarCollapsed ? "nav-collapsed" : "nav-expanded"}`}
    >
      {/* Sidebar Navigation */}
      <SideNavigationBar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        theme={theme}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        onThemeToggle={() =>
          setTheme((value) => (value === "dark" ? "light" : "dark"))
        }
        splitViewEnabled={splitViewEnabled}
        onSplitViewToggle={() => setSplitViewEnabled((value) => !value)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="workspace">
        {/* Top Status Bar */}
        <TopStatusBar
          deviceIp={deviceIp}
          onConfigShortcut={handleConfigShortcut}
        />

        <section className="split-view-controlbar" aria-label="Workspace view controls">
          {splitViewEnabled && (
            <label>
              <span>
                {sectionLabels[activeSection]} +
              </span>
              <select
                value={secondarySection}
                onChange={(event) => setSecondarySection(event.target.value)}
              >
                {accessibleSecondaryOptions.map((section) => (
                  <option key={section} value={section}>
                    {sectionLabels[section]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        {splitViewEnabled ? (
          <div className="split-view-grid">
            <section className="split-pane split-pane-primary" aria-label={`${sectionLabels[activeSection]} primary view`}>
              <Suspense fallback={<div className="page-loading">{t("common.loading", "Loading...")}</div>}>
                {renderSection(activeSection, "primary")}
              </Suspense>
            </section>
            <section className="split-pane split-pane-secondary" aria-label={`${sectionLabels[secondarySection]} secondary view`}>
              <Suspense fallback={<div className="page-loading">{t("common.loadingSecondView", "Loading second view...")}</div>}>
                {renderSection(secondarySection, "secondary")}
              </Suspense>
            </section>
          </div>
        ) : (
          <Suspense fallback={<div className="page-loading">{t("common.loading", "Loading...")}</div>}>
            {renderSection(activeSection, "primary")}
          </Suspense>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}

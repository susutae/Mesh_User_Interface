import configurationIcon from "../assets/nav-icons/configuration.png";
import informationIcon from "../assets/nav-icons/information.png";
import logIcon from "../assets/nav-icons/log.png";
import meshLogo from "../assets/brand/mesh.png";
import modeIcon from "../assets/nav-icons/light_dark.png";
import logoutIcon from "../assets/nav-icons/logout.png";
import monitorIcon from "../assets/nav-icons/monitor.png";
import splitScreenIcon from "../assets/nav-icons/splitscreen.png";
import toolsIcon from "../assets/nav-icons/tools.png";
import { useI18n } from "../i18n/index.js";

/**
 * Sidebar Navigation Items defining the dashboard sections.
 */
const ITEMS = [
  { id: "monitor", labelKey: "nav.monitor", fallback: "Monitor", icon: monitorIcon },
  { id: "configuration", labelKey: "nav.configuration", fallback: "Configuration", icon: configurationIcon },
  { id: "tools", labelKey: "nav.tools", fallback: "Tools", icon: toolsIcon },
  { id: "information", labelKey: "nav.information", fallback: "Information", icon: informationIcon },
  { id: "logs", labelKey: "nav.logs", fallback: "Logs", icon: logIcon },
];

/**
 * SideNavigationBar Component
 * Renders the collapsible side navigation, theme toggle button, and logout triggers.
 * @param {string} activeSection - Current active view section.
 * @param {Function} onSectionChange - Handler function called on navigation click.
 * @param {string} theme - Active color theme ('light' or 'dark').
 * @param {boolean} collapsed - Sidebar collapsible visual toggle state.
 * @param {Function} onToggleCollapsed - Toggles collapsed menu display layout.
 * @param {Function} onThemeToggle - Swaps light and dark theme mode context.
 * @param {boolean} splitViewEnabled - Whether split-screen workspace mode is active.
 * @param {Function} onSplitViewToggle - Toggles split-screen workspace mode.
 * @param {Function} onLogout - Returns user to LoginPage and resets authentication.
 */
export default function SideNavigationBar({
  activeSection,
  onSectionChange,
  theme,
  collapsed,
  onToggleCollapsed,
  onThemeToggle,
  splitViewEnabled = false,
  onSplitViewToggle,
  onLogout,
}) {
  const { language, languages, setLanguage, t } = useI18n();
  const collapseLabel = collapsed
    ? t("nav.expand", "Expand navigation")
    : t("nav.collapse", "Collapse navigation");

  return (
    <aside className={`side-nav ${collapsed ? "collapsed" : "expanded"}`}>
      <button
        className="side-logo side-toggle"
        type="button"
        onClick={onToggleCollapsed}
        aria-label={collapseLabel}
        title={collapseLabel}
      >
        <img className="logo-mark" src={meshLogo} alt="" aria-hidden="true" />
        <span className="side-logo-text">AGIL Mesh</span>
        <span className="collapse-indicator">{collapsed ? ">" : "<"}</span>
      </button>
      <nav className="nav-list">
        {ITEMS.map((item) => (
          /* Clicking Monitor calls App.handleSectionChange("monitor").
             App then remounts MainCanvas so the topology returns to default. */
          <button
            key={item.id}
            className={activeSection === item.id ? "nav-item active" : "nav-item"}
            type="button"
            title={collapsed ? t(item.labelKey, item.fallback) : undefined}
            onClick={() => onSectionChange(item.id)}
          >
            <span className="nav-icon">
              <img src={item.icon} alt="" aria-hidden="true" />
            </span>
            <span className="nav-label">{t(item.labelKey, item.fallback)}</span>
          </button>
        ))}
      </nav>
      <div className="nav-bottom">
        <button
          className={splitViewEnabled ? "nav-item active" : "nav-item"}
          type="button"
          onClick={onSplitViewToggle}
          title={collapsed ? t("nav.splitView", "Split View") : undefined}
          aria-pressed={splitViewEnabled}
        >
          <span className="nav-icon">
            <img src={splitScreenIcon} alt="" aria-hidden="true" />
          </span>
          <span className="nav-label">{t("nav.splitView", "Split View")}</span>
        </button>
        <label
          className="nav-language"
          title={collapsed ? t("language.label", "Language") : undefined}
        >
          <span className="nav-language-short" aria-hidden="true">
            {language.toUpperCase()}
          </span>
          <span className="nav-label">{t("language.label", "Language")}</span>
          <select
            value={language}
            aria-label={t("language.label", "Language")}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {languages.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="nav-item"
          type="button"
          onClick={onThemeToggle}
          title={collapsed ? t("nav.mode", "Mode") : undefined}
        >
          <span className="nav-icon">
            <img src={modeIcon} alt="" aria-hidden="true" />
          </span>
          <span className="nav-label">{t("nav.mode", "Mode")}</span>
        </button>
        <button
          className="nav-item"
          type="button"
          onClick={onLogout}
          title={collapsed ? t("nav.logOut", "Log Out") : undefined}
        >
          <span className="nav-icon">
            <img src={logoutIcon} alt="" aria-hidden="true" />
          </span>
          <span className="nav-label">{t("nav.logOut", "Log Out")}</span>
        </button>
      </div>
    </aside>
  );
}

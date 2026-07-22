/**
 * LoginPage Component - Authentication and Password Management
 *
 * This component provides the login interface for the Mesh Console application.
 * It handles user authentication against the device API and includes functionality
 * for changing passwords. The component supports both dark and light themes.
 *
 * Features:
 * - Password-based authentication with device API
 * - Offline fallback with default "admin" credentials for testing
 * - Password change dialog with validation
 * - Theme switching (dark/light)
 * - Form validation and error handling
 * - Loading states and busy indicators
 */

import { useMemo, useState } from "react";
import LogoMark from "./LogoMark.jsx";
import { postForm } from "../api/deviceApi.js";
import { useI18n } from "../i18n/index.js";

const WEBUI_VERSION = "0.1.20-dev";

/**
 * LoginPage Component
 *
 * Handles user console entry verification and password updates.
 * The component manages the login flow, password change dialog,
 * and theme switching functionality.
 *
 * Props:
 * @param {string} deviceIp - IP address of the target device
 * @param {string} [theme="dark"] - Current theme ("dark" or "light")
 * @param {Function} onThemeChange - Callback when theme is changed
 * @param {Function} onAuthenticated - Callback when login is successful
 *
 * @returns {JSX.Element} The rendered login page
 */
export default function LoginPage({
  deviceIp,
  theme = "dark",
  onThemeChange,
  onAuthenticated,
}) {
  const { language, languages, setLanguage, t } = useI18n();
  // --- Component States ---
  // Password input value
  const [password, setPassword] = useState("");
  // Error message display
  const [error, setError] = useState("");
  // Success/notice message display
  const [notice, setNotice] = useState("");
  // Loading state to disable buttons during async operations
  const [busy, setBusy] = useState(false);
  // Password change dialog visibility
  const [dialogOpen, setDialogOpen] = useState(false);
  // Password change form state
  const [changeForm, setChangeForm] = useState({
    password: "",
    newPassword: "",
    confirmPassword: "",
  });

  // API endpoint URLs constructed from device IP
  const loginUrl = useMemo(() => `http://${deviceIp}:3450/login`, [deviceIp]);
  const changePasswordUrl = useMemo(
    () => `http://${deviceIp}:3450/loginPassword`,
    [deviceIp],
  );

  /**
   * Handles user login submissions.
   * Sends password to the device for authentication.
   *
   * Fallback behavior: If the device is offline (request fails),
   * the default "admin" password is accepted for testing/development purposes.
   *
   * @param {Event} event - Form submission event
   */
  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    // Validate password is not empty
    if (!password.trim()) {
      setError(t("login.passwordRequired", "Password is required."));
      return;
    }

    setBusy(true);
    try {
      const data = await postForm(loginUrl, { password });
      if (data?.success) {
        onAuthenticated();
        return;
      }
      setPassword("");
      setError(
        t("login.invalidPassword", "Invalid password. Please try again."),
      );
    } catch {
      // Offline fallback: allow local test access using default "admin" password
      // This enables development and testing without a live device
      if (password === "admin") {
        onAuthenticated();
      } else {
        setPassword("");
        setError(
          t("login.invalidPassword", "Invalid password. Please try again."),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * Submits a password update request to the hardware console.
   * Validates that:
   * - All fields are filled
   * - New password and confirmation match
   *
   * On success, closes the dialog and shows a success notice.
   *
   * @param {Event} event - Form submission event
   */
  async function handlePasswordChange(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    // Validate all fields are filled
    if (
      !changeForm.password ||
      !changeForm.newPassword ||
      !changeForm.confirmPassword
    ) {
      setError(
        t(
          "login.allPasswordFieldsRequired",
          "All password fields are required.",
        ),
      );
      return;
    }
    // Validate password confirmation matches
    if (changeForm.newPassword !== changeForm.confirmPassword) {
      setError(
        t("login.newPasswordsDoNotMatch", "New passwords do not match."),
      );
      return;
    }

    setBusy(true);
    try {
      const data = await postForm(changePasswordUrl, {
        password: changeForm.password,
        newPassword: changeForm.newPassword,
      });
      if (data?.success) {
        // Reset form and close dialog on success
        setDialogOpen(false);
        setChangeForm({ password: "", newPassword: "", confirmPassword: "" });
        setNotice(
          t(
            "login.passwordChanged",
            "Password changed successfully. Please log in again.",
          ),
        );
      } else {
        setError(
          t("login.currentPasswordIncorrect", "Current password is incorrect."),
        );
      }
    } catch {
      setError(
        t(
          "login.passwordServiceUnavailable",
          "Cannot reach the device password service. Please try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`login-page ${theme}`}>
      {/* Logo display */}
      <LogoMark />

      {/* Login Form Card */}
      <form className="login-card" onSubmit={handleLogin}>
        <LogoMark compact />
        <h1>{t("login.title", "Mesh Console")}</h1>

        {/* Theme selection buttons */}
        <div
          className="login-theme-picker"
          role="group"
          aria-label={t("login.themeSelection", "Theme selection")}
        >
          {[
            ["dark", t("login.dark", "Dark")],
            ["light", t("login.light", "Light")],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={theme === value ? "active" : ""}
              aria-pressed={theme === value}
              onClick={() => onThemeChange?.(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="login-language-picker">
          <span>{t("language.label", "Language")}</span>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {languages.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {/* Password input field */}
        <label className="field">
          <span>{t("login.password", "Password")}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t(
              "login.passwordPlaceholder",
              "Enter your password here",
            )}
            autoComplete="current-password"
          />
        </label>

        {/* Status messages */}
        {error && <p className="form-error">{error}</p>}
        {notice && <p className="form-notice">{notice}</p>}

        {/* Action buttons */}
        <div className="login-actions">
          <button className="primary-button" disabled={busy} type="submit">
            {busy
              ? t("login.loggingIn", "Logging in...")
              : t("login.login", "Login")}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setDialogOpen(true)}
          >
            {t("login.changePassword", "Change Password")}
          </button>
        </div>
      </form>

      <p className="login-webui-version">
        {t("login.webuiVersion", "WebUI Version")}: {WEBUI_VERSION}
      </p>

      {/* Password Change Dialog (Modal) */}
      {dialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={handlePasswordChange}>
            <h2>{t("login.changePassword", "Change Password")}</h2>

            {/* Current password input */}
            <label className="field">
              <span>{t("login.currentPassword", "Current Password")}</span>
              <input
                type="password"
                value={changeForm.password}
                onChange={(event) =>
                  setChangeForm((value) => ({
                    ...value,
                    password: event.target.value,
                  }))
                }
              />
            </label>

            {/* New password input */}
            <label className="field">
              <span>{t("login.newPassword", "New Password")}</span>
              <input
                type="password"
                value={changeForm.newPassword}
                onChange={(event) =>
                  setChangeForm((value) => ({
                    ...value,
                    newPassword: event.target.value,
                  }))
                }
              />
            </label>

            {/* Confirm new password input */}
            <label className="field">
              <span>
                {t("login.confirmNewPassword", "Confirm New Password")}
              </span>
              <input
                type="password"
                value={changeForm.confirmPassword}
                onChange={(event) =>
                  setChangeForm((value) => ({
                    ...value,
                    confirmPassword: event.target.value,
                  }))
                }
              />
            </label>

            {/* Dialog action buttons */}
            <div className="login-actions">
              <button className="primary-button" disabled={busy} type="submit">
                {t("common.save", "Save")}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDialogOpen(false)}
              >
                {t("common.cancel", "Cancel")}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

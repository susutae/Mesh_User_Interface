/**
 * DeviceInformation Component - Device Info, License Management, and Updates
 *
 * This component provides comprehensive device information display and management
 * for mesh radio devices. It handles:
 * - Device identification (ESN, firmware version, frequency range)
 * - License management with enabled features display
 * - Firmware, license, and WebUI update uploads
 *
 * Features:
 * - About tab: Device specifications and update capabilities
 * - License tab: License details and feature flags
 * - File upload for firmware, license, and WebUI updates
 * - Real-time data fetching from device API
 * - Status indicators and error handling
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  requestJson as fetchJson,
  requestText as fetchText,
} from "../api/deviceApi.js";
import { useI18n } from "../i18n/index.js";

/**
 * About endpoint definitions for device information.
 * Maps API content keys to user-friendly display labels.
 */
const ABOUT_ENDPOINTS = [
  ["deviceSn", "ESN"],
  ["version", "Firmware Version"],
  ["powerMax", "Maximum RF Output"],
  ["freqMin", "Minimum Frequency Input"],
  ["freqMax", "Maximum Frequency Input"],
];

/**
 * License feature flags and their display names.
 * Maps license keys to human-readable feature descriptions.
 */
const LICENSE_FLAGS = [
  ["dataEncryptionAES128", "AES128 Encryption"],
  ["dataEncryptionAES256", "AES256 Encryption"],
  ["freqSmart", "Intelligent Avoidance"],
  ["freqSmartAdvanced", "Enhanced Intelligent Avoidance"],
  ["freqHopping", "Frequency Hopping"],
  ["adaptiveFreqHop ping", "Adaptive Frequency Hopping"],
  ["extendSpan", "Bandwidth Enhancement"],
  ["mimo", "MIMO Upgrade"],
  ["silence", "Silence Mode"],
  ["sdma", "STDMA"],
  ["burstAggregation", "Burst Aggregation"],
  ["rangeAdaptive", "Adaptive Range"],
];

/**
 * Formats RF power from dBm to a human-readable string.
 * Converts to watts (W) for values >= 1000 mW, otherwise milliwatts (mW).
 *
 * @param {number|string} value - Power in dBm
 * @returns {string} Formatted power string (e.g., "1.0 W" or "100 mW")
 */
function formatPowerDbm(value) {
  const dbm = Number(value);
  if (!Number.isFinite(dbm)) return "--";
  const mw = 10 ** (dbm / 10);
  if (mw >= 1000) return `${formatNumber(mw / 1000, 1)} W`;
  return `${formatNumber(mw, 0)} mW`;
}

/**
 * Formats frequency from Hertz to Megahertz.
 *
 * @param {number|string} value - Frequency in Hz
 * @returns {string} Formatted frequency in MHz
 */
function formatFrequencyHz(value) {
  const hz = Number(value);
  if (!Number.isFinite(hz)) return "--";
  return `${formatNumber(hz / 1000000, 0)} MHz`;
}

/**
 * Formats a number with locale-specific formatting.
 *
 * @param {number|string} value - Number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted number or "--" if invalid
 */
function formatNumber(value, decimals = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return number.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formats throughput value from license info.
 * Uses a conversion factor to estimate Mbps.
 *
 * @param {number|string} value - Raw throughput value
 * @returns {string} Formatted Mbps string
 */
function formatThroughput(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return "--";
  return `${formatNumber(raw * 0.00112, 1)} Mbps`;
}

/**
 * Extracts license information from the API response.
 * Handles array wrapping from some firmware versions.
 *
 * @param {Object} payload - API response containing licenseinfo
 * @returns {Object} License object
 */
function licenseObject(payload) {
  const value = payload?.licenseinfo;
  if (Array.isArray(value)) return value[0] || {};
  return value || {};
}

/**
 * Checks if a response text indicates success.
 * Handles various response formats and whitespace.
 *
 * @param {string} text - Response text to check
 * @returns {boolean} True if response indicates success
 */
function isOkResponse(text) {
  return String(text || "")
    .trim()
    .replace(/^"|"$/g, "")
    .toUpperCase()
    .startsWith("OK");
}

/**
 * InfoRow Component - Displays a labeled information row.
 * Shows a label-value pair with consistent styling.
 *
 * @param {Object} props
 * @param {string} props.label - Label text
 * @param {string|number} props.value - Value to display
 */
function hasDisplayValue(value) {
  const text = String(value ?? "").trim();
  return Boolean(text && text !== "--" && text !== "-");
}

function displayValue(
  value,
  loading = false,
  loadingText = "Loading...",
  unavailableText = "Unavailable",
) {
  if (hasDisplayValue(value)) return String(value).trim();
  return loading ? loadingText : unavailableText;
}

function InfoRow({
  label,
  value,
  loading = false,
  hideWhenEmpty = false,
  loadingText = "Loading...",
  unavailableText = "Unavailable",
}) {
  if (hideWhenEmpty && !hasDisplayValue(value)) return null;
  const resolvedValue = displayValue(
    value,
    loading,
    loadingText,
    unavailableText,
  );
  const isMuted =
    resolvedValue === unavailableText || resolvedValue === loadingText;

  return (
    <div className="device-info-row">
      <span>{label}</span>
      <strong className={isMuted ? "is-muted-value" : ""}>
        {resolvedValue}
      </strong>
    </div>
  );
}

function translatedDeviceError(message, t) {
  const text = String(message || "").trim();
  if (!text) return "";
  if (/failed to fetch/i.test(text)) {
    return t(
      "deviceInfo.fetchFailed",
      "Unable to connect to the device. Check the IP address and network connection.",
    );
  }
  return text;
}

/**
 * DevicePanel Component - Styled container for device information.
 *
 * @param {Object} props
 * @param {string} props.title - Panel title
 * @param {React.ReactNode} props.children - Panel content
 * @param {React.ReactNode} props.footer - Panel footer (actions)
 */
function DevicePanel({ title, children, footer }) {
  return (
    <section className="device-info-panel">
      <div className="device-info-panel-title">{title}</div>
      <div className="device-info-panel-body">{children}</div>
      {footer && <div className="device-info-panel-footer">{footer}</div>}
    </section>
  );
}

/**
 * DeviceInformation Component
 *
 * Main component for displaying and managing device information.
 * Handles:
 * - Fetching device about information (ESN, version, frequency range)
 * - Fetching and displaying license information
 * - File uploads for firmware, license, and WebUI updates
 * - Status and error management
 *
 * Props:
 * @param {string} deviceIp - IP address of the target device
 * @param {string} [protocol="http"] - Connection protocol ("http" or "https")
 *
 * @returns {JSX.Element} The rendered device information page
 */
export default function DeviceInformation({ deviceIp, protocol = "http" }) {
  const { t } = useI18n();
  // --- Component States ---
  // Current active tab ("about" or "license")
  const [activeTab, setActiveTab] = useState("about");
  // Device about information
  const [about, setAbout] = useState({});
  // License information
  const [license, setLicense] = useState({});
  // Data-fetching status tracker ('idle', 'loading', 'success', 'refreshing', 'error')
  const [status, setStatus] = useState("idle");
  // Error message for main data fetch
  const [error, setError] = useState("");
  // Upload status message
  const [uploadStatus, setUploadStatus] = useState("");
  // Upload error message
  const [uploadError, setUploadError] = useState("");
  // Upload busy state (disable buttons during upload)
  const [uploadBusy, setUploadBusy] = useState(false);

  // References to hidden file input elements
  const firmwareInputRef = useRef(null);
  const licenseInputRef = useRef(null);
  const webuiInputRef = useRef(null);

  // Normalised device API base URL
  const baseUrl = useMemo(
    () => `${protocol}://${deviceIp}`.replace(/\/$/, ""),
    [deviceIp, protocol],
  );
  const loadingText = t("common.loading", "Loading...");
  const unavailableText = t("deviceInfo.unavailable", "Unavailable");
  const infoRowText = { loadingText, unavailableText };

  /**
   * Loads device information from the API.
   * Fetches:
   * - About information (ESN, version, power, frequency range)
   * - License information
   *
   * @param {AbortSignal} signal - Abort signal to discard stale requests
   */
  const load = useCallback(
    async (signal) => {
      if (!deviceIp) return;
      setStatus((current) =>
        current === "success" ? "refreshing" : "loading",
      );
      try {
        // Fetch about information from multiple endpoints
        const aboutResults = await Promise.all(
          ABOUT_ENDPOINTS.map(async ([key]) => {
            const result = await fetchJson(
              `${baseUrl}/deviceinfo?content=${key}`,
              signal,
            );
            return [key, result?.[key]];
          }),
        );
        // Fetch license information
        const licenseResult = await fetchJson(
          `${baseUrl}/deviceinfo?content=licenseinfo`,
          signal,
        );

        setAbout(Object.fromEntries(aboutResults));
        setLicense(licenseObject(licenseResult));
        setStatus("success");
        setError("");
      } catch (requestError) {
        if (requestError?.name === "AbortError") return;
        setStatus("error");
        setError(
          requestError?.message ||
            t(
              "deviceInfo.retrieveFailed",
              "Unable to retrieve device information.",
            ),
        );
      }
    },
    [baseUrl, deviceIp, t],
  );

  // Initial data load on component mount or baseUrl change
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /**
   * Uploads a package (firmware or license) to the device.
   * Handles the two-step process: upload then update.
   *
   * @param {File} file - File to upload
   * @param {Object} options - Upload options
   * @param {string} options.label - Package label for display
   * @param {React.RefObject} options.inputRef - Reference to clear file input
   */
  async function uploadPackageAndUpdate(file, options) {
    if (!file) return;
    const confirmed = window.confirm(
      t(
        "deviceInfo.uploadConfirm",
        'Upload {label} package "{file}" and run device update? Do not power off the radio during update.',
        {
          label: options.label,
          file: file.name,
        },
      ),
    );
    if (!confirmed) return;

    const form = new FormData();
    form.append("file", file);
    setUploadBusy(true);
    setUploadError("");
    setUploadStatus(
      t("deviceInfo.uploadingPackage", "Uploading {label} package...", {
        label: options.label,
      }),
    );

    try {
      // Step 1: Upload the package
      const uploadText = await fetchText(`${baseUrl}/upload`, {
        method: "POST",
        body: form,
      });
      if (!isOkResponse(uploadText)) {
        throw new Error(
          t(
            "deviceInfo.uploadRejected",
            "{label} upload was rejected by the device.",
            { label: options.label },
          ),
        );
      }

      // Step 2: Apply the update (long-running operation with 3-minute timeout)
      setUploadStatus(
        t(
          "deviceInfo.applyingUpdate",
          "Applying {label} update. Do not power off the radio.",
          { label: options.label },
        ),
      );
      const updateText = await fetchText(`${baseUrl}/update`, {
        method: "GET",
        signal: AbortSignal.timeout(180000), // 3 minutes timeout
      });
      if (!isOkResponse(updateText)) {
        throw new Error(
          t(
            "deviceInfo.updateRejected",
            "Device update was rejected by the device.",
          ),
        );
      }

      setUploadStatus(
        t(
          "deviceInfo.updateStarted",
          "{label} update started successfully. The radio may reboot.",
          { label: options.label },
        ),
      );
      // Reload device information after update
      load(new AbortController().signal);
    } catch (requestError) {
      setUploadError(
        requestError?.message ||
          t("deviceInfo.updateFailed", "{label} update failed.", {
            label: options.label,
          }),
      );
      setUploadStatus("");
    } finally {
      setUploadBusy(false);
      // Clear file input
      if (options.inputRef.current) options.inputRef.current.value = "";
    }
  }

  /**
   * Uploads firmware package.
   *
   * @param {File} file - Firmware file (.tar.gz, .tgz, .bin)
   */
  function uploadFirmware(file) {
    uploadPackageAndUpdate(file, {
      label: t("deviceInfo.firmwarePackage", "firmware"),
      inputRef: firmwareInputRef,
    });
  }

  /**
   * Uploads license package.
   *
   * @param {File} file - License file (.bin, .lic, .dat)
   */
  function uploadLicense(file) {
    uploadPackageAndUpdate(file, {
      label: t("deviceInfo.licensePackage", "license"),
      inputRef: licenseInputRef,
    });
  }

  /**
   * Uploads WebUI package (ZIP file).
   * WebUI updates are handled differently from firmware/license.
   *
   * @param {File} file - WebUI package (.zip)
   */
  async function uploadWebui(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setUploadError(
        t("deviceInfo.webuiZipRequired", "WebUI update must be a .zip file."),
      );
      return;
    }
    const confirmed = window.confirm(
      t(
        "deviceInfo.webuiConfirm",
        'Upload WebUI package "{file}"? The page may need to be refreshed after upload.',
        { file: file.name },
      ),
    );
    if (!confirmed) return;

    const form = new FormData();
    form.append("webfile", file);
    setUploadBusy(true);
    setUploadError("");
    setUploadStatus(
      t("deviceInfo.uploadingWebui", "Uploading WebUI package..."),
    );

    try {
      const uploadText = await fetchText(`${baseUrl}/webupload`, {
        method: "POST",
        body: form,
      });
      if (/FAILED/i.test(uploadText)) {
        throw new Error(
          uploadText ||
            t(
              "deviceInfo.webuiRejected",
              "WebUI upload was rejected by the device.",
            ),
        );
      }
      setUploadStatus(
        t(
          "deviceInfo.webuiUploaded",
          "WebUI package uploaded successfully. Refresh the page if needed.",
        ),
      );
    } catch (requestError) {
      setUploadError(
        requestError?.message ||
          t("deviceInfo.webuiFailed", "WebUI update failed."),
      );
      setUploadStatus("");
    } finally {
      setUploadBusy(false);
      if (webuiInputRef.current) webuiInputRef.current.value = "";
    }
  }

  // Calculate frequency range from min/max values
  const frequencyRange =
    about.freqMin || about.freqMax
      ? `${formatFrequencyHz(about.freqMin)} - ${formatFrequencyHz(
          about.freqMax,
        )}`
      : "--";

  // Filter enabled license features
  const enabledLicenseItems = [
    ...LICENSE_FLAGS.filter((item) => license[item[0]]).map(([key, label]) => ({
      key,
      label: t(`deviceInfo.licenseFlags.${key}`, label),
      value: t("deviceInfo.enabled", "Enabled"),
    })),
    ...(Number(license.antiInterferenceLevel) > 0
      ? [
          {
            key: "antiInterferenceLevel",
            label: t(
              "deviceInfo.licenseFlags.antiInterferenceLevel",
              "Interference Resistance",
            ),
            value: t("deviceInfo.level", "Level {level}", {
              level: license.antiInterferenceLevel,
            }),
          },
        ]
      : []),
  ];
  const isLoading = status === "loading";
  const displayError = translatedDeviceError(error, t);

  return (
    <section className="device-info-page">
      {/* Header: page identity only. Tabs and refresh live in the toolbar below. */}
      <header className="device-info-header">
        <div>
          <h1>{t("deviceInfo.title", "Device Information")}</h1>
          <p>
            {t("deviceInfo.subtitle", "{url} - About and license details", {
              url: baseUrl,
            })}
          </p>
        </div>
      </header>

      <div className="device-info-toolbar">
        <div
          className="device-info-tabs breadcrumb-tabs"
          role="tablist"
          aria-label={t("deviceInfo.tabsLabel", "Device information tabs")}
        >
          {[
            ["about", t("deviceInfo.about", "About")],
            ["license", t("deviceInfo.license", "License")],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              className={activeTab === id ? "active" : ""}
              onClick={() => {
                setActiveTab(id);
                setUploadStatus("");
                setUploadError("");
              }}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="device-info-refresh"
          disabled={status === "loading"}
          onClick={() => load(new AbortController().signal)}
        >
          {status === "refreshing"
            ? t("common.refreshing", "Refreshing")
            : t("common.refresh", "Refresh")}
        </button>
      </div>

      {/* Error display */}
      {displayError && (
        <div className="device-info-error">
          <strong>{t("monitor.connectionIssue", "Connection issue:")}</strong>{" "}
          {displayError}
        </div>
      )}

      {/* About Tab - Device information and update capabilities */}
      {activeTab === "about" ? (
        <DevicePanel title={t("deviceInfo.about", "About")}>
          <div className="device-info-spec-grid">
            <div className="device-info-spec-column">
              <InfoRow
                label={t("deviceInfo.esn", "ESN")}
                value={about.deviceSn}
                loading={isLoading}
                {...infoRowText}
              />
              <InfoRow
                label={t("deviceInfo.maximumRfOutput", "Maximum RF Output")}
                value={formatPowerDbm(about.powerMax)}
                loading={isLoading}
                {...infoRowText}
              />
              <InfoRow
                label={t("deviceInfo.frequencyRange", "Frequency Range")}
                value={frequencyRange}
                loading={isLoading}
                {...infoRowText}
              />
              <InfoRow
                label={t("deviceInfo.webuiVersion", "WebUI Version")}
                value="0.1.15-dev"
                {...infoRowText}
              />
            </div>
            <div className="device-info-spec-column">
              <InfoRow
                label={t("deviceInfo.firmwareVersion", "Firmware Version")}
                value={String(about.version || "").trim()}
                loading={isLoading}
                {...infoRowText}
              />
              <div className="device-info-update-panel">
                <div>
                  <strong>{t("deviceInfo.updates", "Updates")}</strong>
                  <span>
                    {t(
                      "deviceInfo.updateDescription",
                      "Firmware and WebUI package uploads",
                    )}
                  </span>
                </div>
                <div className="device-info-update-actions">
                  <button
                    type="button"
                    disabled={uploadBusy}
                    onClick={() => firmwareInputRef.current?.click()}
                  >
                    {t("deviceInfo.firmwareUpdate", "Firmware Update")}
                  </button>
                  <button
                    type="button"
                    disabled={uploadBusy}
                    onClick={() => webuiInputRef.current?.click()}
                  >
                    {t("deviceInfo.webuiUpdate", "WebUI Update")}
                  </button>
                </div>
              </div>
            </div>
          </div>
          {/* Hidden file inputs for firmware and WebUI */}
          <input
            ref={firmwareInputRef}
            type="file"
            className="device-info-file"
            accept=".tar.gz,.tgz,.bin,application/gzip,application/octet-stream"
            onChange={(event) => uploadFirmware(event.target.files?.[0])}
          />
          <input
            ref={webuiInputRef}
            type="file"
            className="device-info-file"
            accept=".zip,application/zip"
            onChange={(event) => uploadWebui(event.target.files?.[0])}
          />
          {/* Upload status messages */}
          {uploadStatus && (
            <div className="device-info-upload-status">{uploadStatus}</div>
          )}
          {uploadError && (
            <div className="device-info-upload-error">{uploadError}</div>
          )}
        </DevicePanel>
      ) : (
        // License Tab - License details and enabled features
        <DevicePanel title={t("deviceInfo.license", "License")}>
          <div className="device-info-spec-grid">
            <div className="device-info-spec-column">
              <InfoRow
                label={t("deviceInfo.maximumNodes", "Maximum Nodes")}
                value={license.maxNodeNum}
                hideWhenEmpty
                {...infoRowText}
              />
              <InfoRow
                label={t("deviceInfo.maximumThroughput", "Maximum Throughput")}
                value={
                  hasDisplayValue(license.maxThroughput)
                    ? formatThroughput(license.maxThroughput)
                    : ""
                }
                hideWhenEmpty
                {...infoRowText}
              />
              <InfoRow
                label={t("deviceInfo.licenseGenerated", "License Generated")}
                value={license.time}
                hideWhenEmpty
                {...infoRowText}
              />
              {!hasDisplayValue(license.maxNodeNum) &&
                !hasDisplayValue(license.maxThroughput) &&
                !hasDisplayValue(license.time) && (
                  <div className="device-info-empty-inline">
                    {t(
                      "deviceInfo.noLicenseLimits",
                      "No license limits reported by this device.",
                    )}
                  </div>
                )}
            </div>
            <div className="device-info-spec-column">
              {/* Enabled license features list */}
              <div className="device-info-subtitle">
                {t(
                  "deviceInfo.enabledLicenseFeatures",
                  "Enabled license features",
                )}
              </div>
              <div className="device-license-list">
                {enabledLicenseItems.length ? (
                  enabledLicenseItems.map(({ key, label, value }) => (
                    <div className="device-license-item" key={key}>
                      <span className="dot online" />
                      <strong>{label}</strong>
                      <em>{value}</em>
                    </div>
                  ))
                ) : (
                  <div className="device-license-empty">
                    <span
                      className="device-info-lock-icon"
                      aria-hidden="true"
                    />
                    <strong>
                      {t(
                        "deviceInfo.noAdditionalLicenseFeatures",
                        "No additional license features enabled.",
                      )}
                    </strong>
                  </div>
                )}
              </div>
              <div className="device-info-update-panel">
                <div>
                  <strong>{t("deviceInfo.updates", "Updates")}</strong>
                  <span>
                    {t(
                      "deviceInfo.licenseUpdateDescription",
                      "Upload a license package to unlock device features",
                    )}
                  </span>
                </div>
                <div className="device-info-update-actions">
                  <button
                    type="button"
                    disabled={uploadBusy}
                    onClick={() => licenseInputRef.current?.click()}
                  >
                    {t("deviceInfo.licenseUpdate", "License Update")}
                  </button>
                </div>
              </div>
            </div>
          </div>
          {/* Hidden file input for license */}
          <input
            ref={licenseInputRef}
            type="file"
            className="device-info-file"
            accept=".bin,.lic,.dat,application/octet-stream"
            onChange={(event) => uploadLicense(event.target.files?.[0])}
          />
          {/* Upload status messages */}
          {uploadStatus && (
            <div className="device-info-upload-status">{uploadStatus}</div>
          )}
          {uploadError && (
            <div className="device-info-upload-error">{uploadError}</div>
          )}
        </DevicePanel>
      )}
    </section>
  );
}

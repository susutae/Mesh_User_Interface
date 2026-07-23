/**
 * ConfigurationPage Component - Main Configuration Management Interface
 *
 * This component provides a comprehensive configuration management interface
 * for mesh radio devices. It handles loading, displaying, editing, and applying
 * configuration settings across multiple tabs (RF, Network, Data, Audio, Security).
 *
 * Features:
 * - Tab-based navigation for different configuration areas
 * - Dynamic form rendering based on schema definitions
 * - Real-time draft editing with visual feedback
 * - Global configuration (apply to all nodes) support
 * - Frequency list management with add/remove/select
 * - Advanced editors for JSON-based configurations
 * - License-aware field visibility
 * - Configuration validation and error handling
 * - Section-level apply with modified-only filtering
 * - Reset to loaded configuration
 */

import { useEffect, useMemo, useRef, useState } from "react";
import AudioConfig from "./AudioConfig.jsx";
import audioIcon from "../assets/config-icons/audio.png";
import DataConfig from "./DataConfig.jsx";
import dataIcon from "../assets/config-icons/data.png";
import GpsConfig from "./GpsConfig.jsx";
import gpsIcon from "../assets/config-icons/gps.png";
import GlobalConfig from "./GlobalConfig.jsx";
import globalIcon from "../assets/config-icons/global.png";
import NetworkConfig from "./NetworkConfig.jsx";
import networkIcon from "../assets/config-icons/network.png";
import RfConfig from "./RfConfig.jsx";
import rfIcon from "../assets/config-icons/rf.png";
import SecurityConfig from "./SecurityConfig.jsx";
import securityIcon from "../assets/config-icons/security.png";
import {
  postJson,
  requestJson as fetchJson,
} from "../api/deviceApi.js";
import { useI18n } from "../i18n/index.js";
import {
  CONFIG_KEYS,
  CONFIG_SECTIONS,
  DEVICE_INFO_KEYS,
  DISPLAY_VALUE,
  FALLBACK_VALUE,
  GLOBAL_CONFIG_KEYS,
  TABS,
} from "./configurationSchema.js";
import {
  formatFrequencyMhzFromHz,
  parseFrequencyList,
  serializeValue,
} from "./ConfigurationControls.jsx";
import {
  CONFIGURATION_SEARCH_INDEX,
  configSlug,
  normaliseSearchText,
  scoreConfigurationSearch,
} from "./configuration/configurationSearch.js";

/**
 * Component mapping for configuration tabs.
 * Maps tab IDs to their respective configuration components.
 */
const CONFIG_COMPONENTS = {
  rf: RfConfig,
  network: NetworkConfig,
  data: DataConfig,
  audio: AudioConfig,
  security: SecurityConfig,
  gps: GpsConfig,
  global: GlobalConfig,
};

const CONFIG_TAB_ICONS = {
  rf: rfIcon,
  network: networkIcon,
  data: dataIcon,
  audio: audioIcon,
  security: securityIcon,
  gps: gpsIcon,
  global: globalIcon,
};

/**
 * Set of configuration keys that are read-only (device info, license flags).
 * These values are displayed but cannot be modified by the user.
 */
const READ_ONLY_CONFIG_KEYS = new Set([
  "licenseAntiInterference",
  "licenseBurstAggregation",
  "licenseDataEncryptionAES128",
  "licenseDataEncryptionAES256",
  "licenseRangeAdaptive",
  "licenseSdma",
  "licenseSilence",
  "licenseinfo",
  "powerMax",
  "powerMaxAtten",
  "powerOutput",
]);

const CONFIG_KEY_SET = new Set(CONFIG_KEYS);

/**
 * Configuration keys that store array values (comma-separated strings).
 */
const ARRAY_CONFIG_KEYS = new Set([
  "disableNodeId",
  "listenPTTGroupId",
  "wakeupNodes",
]);

/**
 * Configuration keys that store JSON values.
 * These require special parsing and stringification.
 */
const JSON_CONFIG_KEYS = new Set([
  "arpDefendList",
  "dscpPrioritylist",
  "forbiddenFreqBands",
  "ipBroadcastBlacklist",
  "ipBroadcastWhitelist",
  "ipMulticastBlacklist",
  "ipMulticastIncomingBlacklist",
  "ipMulticastIncomingWhitelist",
  "ipMulticastWhitelist",
  "ipPrioritylist",
  "mcFormats",
  "netIfConfig",
  "ocl",
  "routes",
  "servicePrioritylist",
  "trapKey",
]);

/**
 * Configuration keys that store numeric values.
 * Used for type coercion when applying configuration.
 */
const NUMERIC_CONFIG_KEYS = new Set([
  "audioAppMode",
  "audioCodecType",
  "audioHeadGain",
  "audioMicGain",
  "audioMuteLevel",
  "dataCompressionMode",
  "dataEncryptionMode",
  "dataTransferMode",
  "ethDisable",
  "freqDefault",
  "id",
  "ipBroadcastFilterMode",
  "ipMulticastFilterMode",
  "linkSnrThreshold",
  "maxMcformat",
  "maxResRatio",
  "minTF",
  "port",
  "positionModuleMode",
  "presetAltitude",
  "presetAl",
  "presetLatitude",
  "presetLongitude",
  "pwAtten1",
  "pwAtten2",
  "rfDisable",
  "span",
  "spanTx",
  "stdmaMode",
  "talkPTTGroupId",
  "trapInterval",
  "trapTargetPort",
  "transmissionMode",
  "snmpPort",
  "uartBaudrate0",
  "uartFrameInterval0",
  "uartMode0",
  "uartParitybits0",
  "uartPort0",
  "uartPortB0",
  "uartBaudrate1",
  "uartFrameInterval1",
  "uartMode1",
  "uartParitybits1",
  "uartPort1",
  "uartPortB1",
  "uartBaudrate2",
  "uartFrameInterval2",
  "uartMode2",
  "uartParitybits2",
  "uartPort2",
  "uartPortB2",
  "usbMode",
  "wifiChannel",
]);

/**
 * Converts a value to boolean based on common truthy string representations.
 *
 * @param {any} value - Value to convert
 * @returns {boolean} Boolean representation
 */
function toBooleanConfig(value) {
  return ["1", "true", "on", "enable", "enabled", "yes"].includes(
    serializeValue(value).toLowerCase(),
  );
}

/**
 * Converts a raw configuration value to a display value.
 * Handles JSON, arrays, and display value mappings.
 *
 * @param {string} key - Configuration key
 * @param {any} value - Raw value
 * @returns {string} Display value
 */
function toDisplayValue(key, value) {
  if (JSON_CONFIG_KEYS.has(key)) {
    if (value == null) return "";
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }
  if (ARRAY_CONFIG_KEYS.has(key)) {
    return Array.isArray(value) ? value.join(", ") : serializeValue(value);
  }
  if (key === "freqList" || key === "freqListTx") {
    return Array.isArray(value) ? value.join(", ") : serializeValue(value);
  }
  const serialized = serializeValue(value);
  if (key === "freqDefault") return serialized;
  return DISPLAY_VALUE[key]?.[serialized] ?? serialized;
}

/**
 * Derives license flags from licenseinfo object.
 * Checks if specific features are licensed.
 *
 * @param {Object} licenseinfo - License information
 * @returns {Object} License flag mappings
 */
function deriveLicenseFlags(licenseinfo) {
  const licenses = Array.isArray(licenseinfo)
    ? licenseinfo
    : licenseinfo && typeof licenseinfo === "object"
      ? [licenseinfo]
      : [];
  const isLicensed = (value) =>
    value === true || value === 1 || value === "true" || value === "1";
  const hasLicense = (...keys) =>
    licenses.some((license) => keys.some((key) => isLicensed(license?.[key])));
  const hasLicenseArray = (key) =>
    licenses.some((license) => Array.isArray(license?.[key]));

  // RF mode options are hidden unless the matching field from
  // /deviceinfo?content=licenseinfo is explicitly licensed by the device.
  return {
    licenseSdma: String(hasLicense("sdma")),
    licenseRangeAdaptive: String(hasLicense("rangeAdaptive")),
    licenseBurstAggregation: String(hasLicense("burstAggregation")),
    licenseAntiInterference: String(hasLicenseArray("antiInterferenceLevel")),
    licenseSilence: String(hasLicense("silence")),
    licenseFreqHopping: String(hasLicense("freqHopping")),
    licenseFreqSmart: String(hasLicense("freqSmart")),
    licenseFreqSmartAdvanced: String(
      hasLicense(
        "freqSmartAdvanced",
        "smartAdvanced",
        "enhancedIntelligentAvoidance",
      ),
    ),
    licenseAdaptiveFreqHopping: String(
      hasLicense(
        "adaptiveFreqHopping",
        "adaptiveHopping",
        "dynamicFreqHopping",
      ),
    ),
    licenseDataEncryptionAES128: String(
      hasLicense("dataEncryptionAES128", "aes128", "encryptionAES128"),
    ),
    licenseDataEncryptionAES256: String(
      hasLicense("dataEncryptionAES256", "aes256", "encryptionAES256"),
    ),
  };
}

/**
 * Checks whether the loaded device firmware version meets a field requirement.
 *
 * Device versions can include suffixes, such as "2.11.1-rc9-1-M1022\n".
 * Only the leading numeric parts are compared.
 *
 * @param {string} currentVersion - Version from /deviceinfo?content=version
 * @param {string} minimumVersion - Minimum required version, e.g. "2.13"
 * @returns {boolean} True when currentVersion is greater than or equal to minimumVersion
 */
function meetsMinimumVersion(currentVersion, minimumVersion) {
  const toParts = (version) =>
    serializeValue(version)
      .trim()
      .match(/\d+/g)
      ?.map((part) => Number(part)) || [];

  const currentParts = toParts(currentVersion);
  const minimumParts = toParts(minimumVersion);
  if (!currentParts.length || !minimumParts.length) return false;

  const length = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < length; index += 1) {
    const current = currentParts[index] || 0;
    const minimum = minimumParts[index] || 0;
    if (current > minimum) return true;
    if (current < minimum) return false;
  }
  return true;
}

/**
 * Determines if a field is visible based on its visibleWhen condition.
 *
 * @param {Object} field - Field definition
 * @param {Object} values - Current configuration values
 * @returns {boolean} True if field should be visible
 */
function isVisibleField(field, values) {
  if (
    field.minDeviceVersion &&
    !meetsMinimumVersion(values.version, field.minDeviceVersion)
  ) {
    return false;
  }
  if (!field.visibleWhen) return true;
  const value = serializeValue(values[field.visibleWhen.key]).toLowerCase();
  return field.visibleWhen.values
    .map((item) => String(item).toLowerCase())
    .includes(value);
}

/**
 * Builds a safe import list from a .msconf configuration object.
 * When updateAllNodes is enabled, only global-capable keys are imported.
 *
 * @param {Object} source - Raw import configuration object
 * @param {boolean} applyGlobally - Whether configGlobal mode is enabled
 * @returns {{entries: Array<[string, any]>, skipped: Array<string>}}
 */
function collectImportEntries(source, applyGlobally) {
  const entries = [];
  const skipped = [];

  Object.entries(source || {}).forEach(([key, value]) => {
    const isWritableConfig =
      CONFIG_KEY_SET.has(key) && !READ_ONLY_CONFIG_KEYS.has(key);
    const isAllowedGlobal = !applyGlobally || GLOBAL_CONFIG_KEYS.has(key);

    if (!isWritableConfig || !isAllowedGlobal) {
      skipped.push(key);
      return;
    }

    entries.push([key, value]);
  });

  return { entries, skipped };
}

/**
 * Reverses display value mapping to get the raw value.
 * Used when applying configuration to the device.
 *
 * @param {string} key - Configuration key
 * @param {any} value - Display value
 * @returns {string} Raw value
 */
function reverseDisplayValue(key, value) {
  const displayMap = DISPLAY_VALUE[key];
  const serialized = serializeValue(value);
  if (!displayMap) return serialized;

  const directEntry = Object.entries(displayMap).find(
    ([, label]) => label === serialized,
  );
  if (directEntry) return directEntry[0];

  const normalized = serialized.toLowerCase();
  const looseEntry = Object.entries(displayMap).find(
    ([raw, label]) =>
      raw.toLowerCase() === normalized ||
      String(label).toLowerCase() === normalized,
  );
  return looseEntry ? looseEntry[0] : serialized;
}

/**
 * Parses JSON configuration value with error handling.
 *
 * @param {string} key - Configuration key
 * @param {any} value - Value to parse
 * @returns {any} Parsed JSON
 * @throws {Error} If JSON is invalid
 */
function parseJsonConfigValue(key, value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${key} contains invalid JSON.`);
  }
}

/**
 * Normalizes a configuration value for POST request.
 * Handles different types: JSON, arrays, numbers, booleans, etc.
 *
 * @param {string} key - Configuration key
 * @param {any} value - Value to normalize
 * @param {Object} field - Field definition
 * @returns {any} Normalized value
 */
function normalizeConfigPostValue(key, value, field) {
  if (JSON_CONFIG_KEYS.has(key)) {
    return parseJsonConfigValue(key, value);
  }
  if (key === "freqList" || key === "freqListTx") {
    return parseFrequencyList(value);
  }
  if (ARRAY_CONFIG_KEYS.has(key)) {
    return serializeValue(value)
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item));
  }

  const reversed = reverseDisplayValue(key, value);
  const normalized = serializeValue(reversed).trim();

  if (field?.type === "toggle") {
    return ["1", "true", "on", "enable", "enabled"].includes(
      normalized.toLowerCase(),
    );
  }
  if (field?.type === "number" || NUMERIC_CONFIG_KEYS.has(key)) {
    const numberValue = Number(normalized);
    return Number.isFinite(numberValue) ? numberValue : normalized;
  }

  return normalized;
}

/**
 * Checks if a draft value differs from the loaded configuration.
 *
 * @param {string} key - Configuration key
 * @param {Object} draft - Draft configuration
 * @param {Object} config - Loaded configuration
 * @returns {boolean} True if value is modified
 */
function isDraftValueModified(key, draft, config) {
  return serializeValue(draft[key]) !== serializeValue(config[key]);
}

/**
 * Collects entries from a section for POST request.
 * Filters by visibility, read-only, global-only, and modification state.
 *
 * @param {Object} section - Section definition
 * @param {Object} draft - Draft configuration
 * @param {Object} config - Loaded configuration
 * @param {boolean} globalOnly - Whether to include only global keys
 * @returns {Array} Array of {key, value} entries
 */
function collectSectionPostEntries(section, draft, config, globalOnly = false) {
  const entries = new Map();

  section.fields
    .filter((field) => isVisibleField(field, draft))
    .forEach((field) => {
      if (field.type === "frequency") {
        entries.set(field.defaultKey || field.key, field);
        entries.set(field.listKey || "freqList", {
          ...field,
          key: field.listKey || "freqList",
        });
        return;
      }
      if (field.type === "antennaPower") {
        entries.set("pwAtten1", { ...field, key: "pwAtten1", type: "number" });
        entries.set("pwAtten2", { ...field, key: "pwAtten2", type: "number" });
        return;
      }
      entries.set(field.key, field);
    });

  return [...entries]
    .filter(([key]) => !READ_ONLY_CONFIG_KEYS.has(key))
    .filter(([key]) => !globalOnly || GLOBAL_CONFIG_KEYS.has(key))
    .filter(([key]) => !globalOnly || isDraftValueModified(key, draft, config))
    .map(([key, field]) => ({
      key,
      value: normalizeConfigPostValue(key, draft[key], field),
      field,
    }));
}

/**
 * Finds the schema field that owns a configuration key.
 *
 * @param {string} key - Configuration key
 * @returns {Object|null} Matching field definition
 */
function findConfigField(key) {
  for (const section of Object.values(CONFIG_SECTIONS).flat()) {
    for (const field of section.fields) {
      if (field.key === key) return field;
      if (field.type === "frequency") {
        if ((field.defaultKey || field.key) === key) return field;
        if ((field.listKey || "freqList") === key) {
          return { ...field, key, type: "frequencyList" };
        }
      }
    }
  }
  return null;
}

function reviewLabelForEntry(entry, t) {
  const field = entry.field || findConfigField(entry.key);
  if (entry.key === "configGlobal") {
    return t("configuration.updateAllNodes", "Update All Nodes");
  }
  if (entry.key === "pwAtten1") {
    return t("configurationFields.pwAtten1", "Antenna 1 Output");
  }
  if (entry.key === "pwAtten2") {
    return t("configurationFields.pwAtten2", "Antenna 2 Output");
  }
  if (entry.key === "freqList") {
    return t("configurationFields.freqList", "Frequency List");
  }
  if (entry.key === "freqListTx") {
    return t("configurationFields.freqListTx", "TX Frequency List");
  }
  if (field?.type === "frequencyList") {
    return t(`configurationFields.${field.key}`, field.label || entry.key);
  }
  if (field?.label) return t(`configurationFields.${entry.key}`, field.label);
  return entry.key;
}

function translateReviewDisplayValue(value, t) {
  if (value === "" || value === "--") return value || "--";
  return t(`configurationOptions.${configSlug(value)}`, value);
}

function reviewValueForKey(key, value, values = {}, field = null, t) {
  if (key === "configGlobal") {
    return value
      ? t("configuration.reviewValueEnabled", "Enabled")
      : t("configuration.reviewValueDisabled", "Disabled");
  }
  if (key === "freqDefault") {
    const listKey = field?.listKey || "freqList";
    const list = parseFrequencyList(values[listKey]);
    const selectedIndex = Number(value);

    if (
      Number.isInteger(selectedIndex) &&
      selectedIndex >= 0 &&
      selectedIndex < list.length
    ) {
      return formatFrequencyMhzFromHz(list[selectedIndex]);
    }

    const rawFrequency = Number(value);
    if (Number.isFinite(rawFrequency) && rawFrequency >= 1_000_000) {
      return formatFrequencyMhzFromHz(rawFrequency);
    }

    return serializeValue(value)
      ? t("configuration.reviewValueIndex", "Index {value}", { value })
      : "--";
  }
  if (key === "freqList" || key === "freqListTx") {
    const list = parseFrequencyList(value);
    if (!list.length) return t("configuration.reviewValueEmpty", "Empty");
    const items = list
      .slice(0, 6)
      .map(formatFrequencyMhzFromHz)
      .join(", ");
    return t(
      "configuration.reviewValueFrequencyCount",
      "{count} frequencies: {items}{more}",
      { count: list.length, items, more: list.length > 6 ? ", ..." : "" },
    );
  }
  if (key === "pwAtten1" || key === "pwAtten2") {
    const valueText = serializeValue(value);
    return valueText
      ? t("configuration.reviewValueAttenuation", "{value} dB attenuation", {
          value: valueText,
        })
      : "--";
  }
  if (JSON_CONFIG_KEYS.has(key)) {
    if (Array.isArray(value)) {
      return t("configuration.reviewValueEntries", "{count} entries", {
        count: value.length,
      });
    }
    if (value && typeof value === "object") {
      return t("configuration.reviewValueFields", "{count} fields", {
        count: Object.keys(value).length,
      });
    }
  }
  if (ARRAY_CONFIG_KEYS.has(key)) {
    const values = Array.isArray(value)
      ? value
      : serializeValue(value)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
    return values.length
      ? values.join(", ")
      : t("configuration.reviewValueEmpty", "Empty");
  }
  const displayValue = toDisplayValue(key, value);
  return displayValue === "" ? "--" : translateReviewDisplayValue(displayValue, t);
}

/**
 * Exports confirmed global settings in the .msconf uniformityParam format.
 *
 * @param {Object} draft - Current configuration draft
 * @returns {Object} Export file payload
 */
function buildGlobalExportPayload(draft) {
  const uniformityParam = {};

  GLOBAL_CONFIG_KEYS.forEach((key) => {
    if (!CONFIG_KEY_SET.has(key) || READ_ONLY_CONFIG_KEYS.has(key)) return;
    if (draft[key] == null || serializeValue(draft[key]) === "") return;

    const field = findConfigField(key);
    uniformityParam[key] = normalizeConfigPostValue(key, draft[key], field);
  });

  return {
    version: serializeValue(draft.firmwareVersion || draft.version || ""),
    uniformityParam,
  };
}

/**
 * Fetches all configuration values from the device.
 * Combines config and deviceinfo endpoints.
 *
 * @param {string} baseUrl - Base API URL
 * @param {AbortSignal} signal - Abort signal
 * @returns {Promise<Object>} All configuration values
 */
async function fetchConfigValues(baseUrl, signal) {
  const configEntries = await Promise.all(
    CONFIG_KEYS.map(async (key) => {
      try {
        const result = await fetchJson(
          `${baseUrl}/config?content=${key}`,
          signal,
        );
        return [
          key,
          toDisplayValue(key, result?.[key]) || FALLBACK_VALUE[key] || "",
        ];
      } catch {
        return [key, FALLBACK_VALUE[key] || ""];
      }
    }),
  );

  const deviceInfoEntries = await Promise.all(
    DEVICE_INFO_KEYS.map(async (key) => {
      try {
        const result = await fetchJson(
          `${baseUrl}/deviceinfo?content=${key}`,
          signal,
        );
        return [key, result?.[key]];
      } catch {
        return [key, ""];
      }
    }),
  );

  const nextConfig = Object.fromEntries([
    ...configEntries,
    ...deviceInfoEntries,
  ]);
  return {
    ...nextConfig,
    powerMax: serializeValue(nextConfig.powerMax),
    powerMaxAtten: serializeValue(nextConfig.powerMaxAtten),
    ...deriveLicenseFlags(nextConfig.licenseinfo),
  };
}

/**
 * Fetches configGlobal setting from the device.
 *
 * @param {string} baseUrl - Base API URL
 * @param {AbortSignal} signal - Abort signal
 * @returns {Promise<boolean>} True if configGlobal is enabled
 */
async function fetchConfigGlobal(baseUrl, signal) {
  try {
    const result = await fetchJson(
      `${baseUrl}/config?content=configGlobal`,
      signal,
    );
    return toBooleanConfig(result?.configGlobal);
  } catch {
    return false;
  }
}

/**
 * ConfigurationPage Component
 *
 * Main configuration management interface with tab navigation,
 * dynamic form rendering, and apply functionality.
 *
 * Props:
 * @param {string} deviceIp - IP address of the target device
 * @param {string} [protocol="http"] - Connection protocol
 * @param {Object} [target] - Navigation target for direct section access
 * @param {string} target.tab - Tab ID
 * @param {string} target.section - Section title
 *
 * @returns {JSX.Element} Rendered configuration page
 */
export default function ConfigurationPage({
  deviceIp,
  protocol = "http",
  target,
}) {
  const { t } = useI18n();
  // --- Component States ---
  const [activeTab, setActiveTab] = useState("rf");
  const [config, setConfig] = useState({});
  const [draft, setDraft] = useState({});
  const [status, setStatus] = useState("idle");
  const [applyingSection, setApplyingSection] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [updateAllNodes, setUpdateAllNodes] = useState(false);
  const [updatingGlobal, setUpdatingGlobal] = useState(false);
  const [importingConfig, setImportingConfig] = useState(false);
  const [pendingReview, setPendingReview] = useState(null);
  const [activeSectionTitle, setActiveSectionTitle] = useState("");
  const [configurationSearch, setConfigurationSearch] = useState("");
  const [configurationSearchActiveIndex, setConfigurationSearchActiveIndex] =
    useState(0);
  const [configurationSearchTarget, setConfigurationSearchTarget] =
    useState(null);
  const lastAppliedTargetRef = useRef(null);
  const importInputRef = useRef(null);
  const frequencyImportInputRef = useRef(null);

  // Frequency editor state
  const [frequencyEditor, setFrequencyEditor] = useState(null);
  const [frequencyInput, setFrequencyInput] = useState("");
  const [frequencyRange, setFrequencyRange] = useState({
    start: "",
    end: "",
    interval: "",
  });

  // Expert editor state for advanced configuration types
  const [expertEditor, setExpertEditor] = useState(null);
  const [restrictedBandInput, setRestrictedBandInput] = useState({
    lower: "",
    upper: "",
  });
  const [modulationInput, setModulationInput] = useState({
    nodeId: "",
    code: "",
  });
  const [nodeIdInput, setNodeIdInput] = useState("");
  const [networkListInput, setNetworkListInput] = useState({});
  const [selectedAntenna, setSelectedAntenna] = useState("pwAtten1");

  // Base API URL
  const baseUrl = useMemo(
    () => `${protocol}://${deviceIp}`.replace(/\/$/, ""),
    [deviceIp, protocol],
  );

  /**
   * Loads all configuration data from the device.
   * Fetches config values, device info, and configGlobal.
   *
   * @param {AbortSignal} signal - Abort signal
   */
  async function load(signal) {
    setStatus((current) => (current === "success" ? "refreshing" : "loading"));
    setNotice("");
    try {
      const [nextConfig, nextConfigGlobal] = await Promise.all([
        fetchConfigValues(baseUrl, signal),
        fetchConfigGlobal(baseUrl, signal),
      ]);
      setConfig(nextConfig);
      setDraft(nextConfig);
      setUpdateAllNodes(nextConfigGlobal);
      setError("");
      setStatus("success");
    } catch (requestError) {
      if (requestError?.name === "AbortError") return;
      setError(
        requestError?.message ||
          t("configuration.loadFailed", "Unable to load configuration."),
      );
      setStatus("error");
    }
  }

  // Initial data load
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [baseUrl]);

  // Handle navigation target
  useEffect(() => {
    if (target?.tab) {
      setActiveTab(target.tab);
      setConfigurationSearchTarget(null);
    }
  }, [target]);

  // Filter visible sections based on current draft
  const visibleHeaderSections = useMemo(
    () =>
      (CONFIG_SECTIONS[activeTab] || []).filter((section) =>
        section.fields.some((field) => isVisibleField(field, draft)),
      ),
    [activeTab, draft],
  );

  // Keep active tab metadata above pendingApplyEntries because the
  // update-all-nodes frequency-list collector uses activeLabel during render.
  const visibleTabs = TABS;
  const activeTabDefinition = visibleTabs.find((tab) => tab.id === activeTab);
  const activeLabel = activeTabDefinition
    ? configTabLabel(activeTabDefinition)
    : "";
  const activeDescription = activeTabDefinition
    ? configTabDescription(activeTabDefinition)
    : "";
  const ActiveConfig = CONFIG_COMPONENTS[activeTab] || RfConfig;
  const availableNetworkInterfaces = networkInterfaceOptions();

  const pendingApplyEntries = useMemo(
    () => collectActiveTabPostEntries(),
    [config, draft, updateAllNodes, visibleHeaderSections],
  );
  const modifiedFieldKeys = useMemo(
    () => new Set(pendingApplyEntries.map((entry) => entry.key)),
    [pendingApplyEntries],
  );
  const pendingApplySummary = useMemo(() => {
    const labels = pendingApplyEntries.map((entry) =>
      reviewLabelForEntry(entry, t),
    );

    return {
      labels: labels.slice(0, 3),
      remaining: Math.max(0, labels.length - 3),
    };
  }, [pendingApplyEntries, t]);

  function assertConfigPostAccepted(result, key) {
    if (!result || typeof result !== "object") return;
    const errorText = [
      result.error,
      result.errors,
      result.message,
      result.result,
    ]
      .filter((value) => typeof value === "string")
      .join(" ");
    if (/invalid|error|fail|reject/i.test(errorText)) {
      throw new Error(`${key}: ${errorText}`);
    }
  }

  async function postConfigEntries(entries, applyGlobally, signal) {
    // Global (*) settings must be posted with configGlobal=true in the same
    // /config request. A separate configGlobal request does not fan out the
    // following parameter updates to the remote nodes.
    const payload = {
      ...Object.fromEntries(entries.map(({ key, value }) => [key, value])),
      ...(applyGlobally ? { configGlobal: true } : {}),
    };
    const result = await postJson(`${baseUrl}/config`, payload, signal);
    assertConfigPostAccepted(result, applyGlobally ? "configGlobal" : "config");
  }

  const configurationSearchResults = useMemo(() => {
    const query = normaliseSearchText(configurationSearch);
    if (!query) return [];
    return CONFIGURATION_SEARCH_INDEX.map((entry) => ({
      ...entry,
      score: scoreConfigurationSearch(entry, query),
    }))
      .filter(
        (entry) => entry.score > 0,
      )
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, 6);
  }, [configurationSearch]);

  useEffect(() => {
    setConfigurationSearchActiveIndex(0);
  }, [configurationSearch]);

  function navigateToSearchResult(result) {
    if (!result) return;
    const nextTarget = {
      tab: result.tabId,
      section: result.sectionTitle,
      field: result.type === "Setting" ? result.key : "",
      nonce: Date.now(),
    };
    setActiveTab(result.tabId);
    setActiveSectionTitle(result.sectionTitle);
    setConfigurationSearchTarget(nextTarget);
    setConfigurationSearch("");
    setNotice(
      result.type === "Setting"
        ? t(
            "configuration.openedSetting",
            "Opened {path}.",
            { path: configurationSearchPath(result) },
          )
        : t(
            "configuration.openedSection",
            "Opened {path}.",
            { path: configurationSearchPath(result) },
          ),
    );
  }

  function handleConfigurationSearchKeyDown(event) {
    if (!configurationSearchResults.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setConfigurationSearchActiveIndex((current) =>
        Math.min(current + 1, configurationSearchResults.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setConfigurationSearchActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      navigateToSearchResult(
        configurationSearchResults[configurationSearchActiveIndex] ||
          configurationSearchResults[0],
      );
      return;
    }

    if (event.key === "Escape") {
      setConfigurationSearch("");
    }
  }

  const effectiveTarget = configurationSearchTarget || target;

  // Set active section title based on target or first visible section
  useEffect(() => {
    const hasShortcutTarget =
      effectiveTarget?.tab === activeTab && effectiveTarget?.section;
    const targetKey = hasShortcutTarget
      ? (effectiveTarget?.nonce ??
        `${effectiveTarget.tab}:${effectiveTarget.section}`)
      : null;
    const targetSectionVisible =
      hasShortcutTarget &&
      visibleHeaderSections.some(
        (section) => section.title === effectiveTarget.section,
      );

    if (targetSectionVisible && targetKey !== lastAppliedTargetRef.current) {
      setActiveSectionTitle(effectiveTarget.section);
      lastAppliedTargetRef.current = targetKey;
      return;
    }

    const targetSection = visibleHeaderSections[0]?.title || "";
    if (
      targetSection &&
      (!activeSectionTitle ||
        !visibleHeaderSections.some(
          (section) => section.title === activeSectionTitle,
        ))
    ) {
      setActiveSectionTitle(targetSection);
    }
  }, [activeTab, activeSectionTitle, effectiveTarget, visibleHeaderSections]);

  /**
   * Updates a single draft value.
   *
   * @param {string} key - Configuration key
   * @param {any} value - New value
   */
  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice("");
  }

  /**
   * Resets draft to the loaded configuration.
   */
  function resetDraft() {
    setDraft(config);
    setNotice(
      t(
        "configuration.resetDraftNotice",
        "Changes reset to the last loaded device configuration.",
      ),
    );
  }

  function reviewEntriesForSection(section, entries) {
    const sectionTitle = typeof section === "string" ? section : section.title;
    const changeRows = entries.map((entry) => ({
      ...entry,
      label: reviewLabelForEntry(entry, t),
      oldValue: reviewValueForKey(
        entry.key,
        config[entry.key],
        config,
        entry.field,
        t,
      ),
      newValue: reviewValueForKey(
        entry.key,
        draft[entry.key],
        draft,
        entry.field,
        t,
      ),
      global: GLOBAL_CONFIG_KEYS.has(entry.key),
    }));

    return {
      sectionTitle,
      entries,
      rows: updateAllNodes
        ? [
            {
              key: "configGlobal",
              label: t("configuration.updateAllNodes", "Update All Nodes"),
              oldValue: t("configuration.reviewValueDisabled", "Disabled"),
              newValue: t("configuration.reviewValueEnabled", "Enabled"),
              global: true,
              value: true,
            },
            ...changeRows,
          ]
        : changeRows,
      applyGlobally: updateAllNodes,
    };
  }

  function collectGlobalFrequencyListEntries() {
    if (!updateAllNodes) return [];

    return ["freqList", "freqListTx"]
      .filter((key) => GLOBAL_CONFIG_KEYS.has(key))
      .filter((key) => isDraftValueModified(key, draft, config))
      .map((key) => {
        const field = findConfigField(key);
        return {
          key,
          value: normalizeConfigPostValue(key, draft[key], field),
          field,
          sectionTitle: activeLabel,
        };
      });
  }

  function collectActiveTabPostEntries() {
    const entries = new Map();

    visibleHeaderSections.forEach((section) => {
      collectSectionPostEntries(section, draft, config, updateAllNodes)
        .filter((entry) => isDraftValueModified(entry.key, draft, config))
        .forEach((entry) => {
          entries.set(entry.key, { ...entry, sectionTitle: section.title });
        });
    });

    collectGlobalFrequencyListEntries().forEach((entry) => {
      entries.set(entry.key, entry);
    });

    return [...entries.values()];
  }

  function prepareApplyChanges() {
    if (!pendingApplyEntries.length) {
      setNotice(
        updateAllNodes
          ? t(
              "configuration.noModifiedGlobal",
              "{section} has no modified * settings to apply to all nodes.",
              { section: activeLabel },
            )
          : t(
              "configuration.noModified",
              "{section} has no modified settings to apply.",
              { section: activeLabel },
            ),
      );
      return;
    }

    setError("");
    setNotice("");
    setPendingReview(
      reviewEntriesForSection(
        t("configuration.reviewSectionTitle", "{section} Changes", {
          section: activeLabel,
        }),
        pendingApplyEntries,
      ),
    );
  }

  /**
   * Applies reviewed configuration entries to the device.
   */
  async function confirmApplyReview() {
    if (!pendingReview?.entries?.length) return;

    const controller = new AbortController();
    setApplyingSection(pendingReview.sectionTitle);
    setError("");
    setNotice(
      pendingReview.applyGlobally
        ? t(
            "configuration.applyingGlobal",
            "Applying modified * {section} settings to all online nodes...",
            { section: pendingReview.sectionTitle },
          )
        : t(
            "configuration.applyingSection",
            "Applying {section} settings...",
            { section: pendingReview.sectionTitle },
          ),
    );

    try {
      await postConfigEntries(
        pendingReview.entries,
        pendingReview.applyGlobally,
        controller.signal,
      );

      // Update loaded config to match draft for applied keys
      setConfig((current) => ({
        ...current,
        ...Object.fromEntries(
          pendingReview.entries.map(({ key }) => [key, draft[key]]),
        ),
      }));
      const postedNames = [
        ...pendingReview.entries.map((entry) => entry.key),
        ...(pendingReview.applyGlobally ? ["configGlobal"] : []),
      ];
      setNotice(
        t(
          "configuration.applySuccessPosted",
          "{section} applied successfully. Posted: {posted}.",
          {
            section: pendingReview.sectionTitle,
            posted: postedNames.join(", "),
          },
        ),
      );
      setPendingReview(null);
    } catch (requestError) {
      setError(
        requestError?.message ||
          t("configuration.applyFailed", "Unable to apply {section} settings.", {
            section: pendingReview.sectionTitle,
          }),
      );
      setNotice("");
    } finally {
      setApplyingSection("");
    }
  }

  /**
   * Toggles updateAllNodes mode.
   * When enabled, supported settings apply to all online nodes.
   */
  async function toggleUpdateAllNodes() {
    const controller = new AbortController();
    const nextValue = !updateAllNodes;
    setUpdatingGlobal(true);
    setError("");
    setNotice(
      nextValue
        ? t("configuration.enablingUpdateAll", "Enabling update all nodes...")
        : t("configuration.disablingUpdateAll", "Disabling update all nodes..."),
    );

    if (!nextValue) {
      // configGlobal is an apply-time command flag on the device. Firmware
      // rejects configGlobal=false, so disabling only changes the UI mode.
      // Subsequent applies omit configGlobal and therefore target this node.
      setUpdateAllNodes(false);
      setNotice(
        t(
          "configuration.updateAllDisabled",
          "Update All Nodes disabled. Settings will apply to this node only.",
        ),
      );
      setUpdatingGlobal(false);
      return;
    }

    try {
      await postJson(
        `${baseUrl}/config?content=configGlobal`,
        { configGlobal: true },
        controller.signal,
      );
      setUpdateAllNodes(true);
      setNotice(
        t(
          "configuration.updateAllEnabled",
          "Update All Nodes enabled. Supported settings will apply across nodes.",
        ),
      );
    } catch (requestError) {
      setError(
        requestError?.message ||
          t("configuration.updateAllFailed", "Unable to update configGlobal."),
      );
      setNotice("");
    } finally {
      setUpdatingGlobal(false);
    }
  }

  /**
   * Imports a .msconf export file and applies supported values to the device.
   *
   * @param {Event} event - File input change event
   */
  async function importConfigFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportingConfig(true);
    setError("");
    setNotice(
      t("configuration.importingFile", "Importing {file}...", {
        file: file.name,
      }),
    );

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const source =
        parsed?.uniformityParam &&
        typeof parsed.uniformityParam === "object" &&
        !Array.isArray(parsed.uniformityParam)
          ? parsed.uniformityParam
          : parsed;

      if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new Error(
          t(
            "configuration.importNoConfigData",
            "The selected file does not contain configuration data.",
          ),
        );
      }

      const { entries, skipped } = collectImportEntries(source, updateAllNodes);
      if (!entries.length) {
        throw new Error(
          t(
            "configuration.importNoWritableKeys",
            "No supported writable configuration keys were found.",
          ),
        );
      }

      await postConfigEntries(
        entries.map(([key, value]) => ({ key, value })),
        updateAllNodes,
      );
      await load(new AbortController().signal);

      const skippedText = skipped.length
        ? ` ${t(
            "configuration.importSkippedKeys",
            "{count} unsupported or non-global key(s) skipped.",
            { count: skipped.length },
          )}`
        : "";
      setNotice(
        updateAllNodes
          ? `${t(
              "configuration.importAppliedGlobal",
              "{count} imported setting(s) applied to all online nodes.",
              { count: entries.length },
            )}${skippedText}`
          : `${t(
              "configuration.importAppliedLocal",
              "{count} imported setting(s) applied to this node.",
              { count: entries.length },
            )}${skippedText}`,
      );
    } catch (requestError) {
      setError(
        requestError?.message ||
          t(
            "configuration.importFailed",
            "Unable to import configuration file.",
          ),
      );
      setNotice("");
    } finally {
      setImportingConfig(false);
    }
  }

  /**
   * Downloads current confirmed global settings as a .msconf export file.
   */
  function exportConfigFile() {
    try {
      const payload = buildGlobalExportPayload(draft);
      const count = Object.keys(payload.uniformityParam).length;
      if (!count) {
        setNotice(
          t(
            "configurationManagers.notices.noGlobalExport",
            "No update-all-node settings are available to export.",
          ),
        );
        return;
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeIp = serializeValue(deviceIp).replace(/[^a-z0-9.-]+/gi, "_");
      link.href = url;
      link.download = `MeshSameParams-${safeIp || "device"}.msconf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice(
        t(
          "configurationManagers.notices.globalExported",
          "{count} update-all-node setting(s) exported.",
          { count },
        ),
      );
    } catch (requestError) {
      setError(
        requestError?.message ||
          t(
            "configurationManagers.notices.exportFailed",
            "Unable to export configuration file.",
          ),
      );
      setNotice("");
    }
  }

  // --- Frequency Editor Functions ---

  function normaliseImportedFrequencyList(value) {
    return parseFrequencyList(value)
      .map((frequency) => {
        const numeric = Number(frequency);
        if (!Number.isFinite(numeric) || numeric <= 0) return null;
        return Math.round(numeric < 1_000_000 ? numeric * 1_000_000 : numeric);
      })
      .filter((frequency) => Number.isFinite(frequency) && frequency > 0);
  }

  async function importFrequencyListFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !frequencyEditor) return;

    const listKey = frequencyEditor.listKey || "freqList";
    const defaultKey = frequencyEditor.defaultKey || "freqDefault";

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const source =
        parsed?.uniformityParam &&
        typeof parsed.uniformityParam === "object" &&
        !Array.isArray(parsed.uniformityParam)
          ? parsed.uniformityParam
          : parsed;
      const candidate = Array.isArray(source)
        ? source
        : source?.[listKey] ?? source?.frequencies ?? source?.frequencyList;
      const nextList = normaliseImportedFrequencyList(candidate);

      if (!nextList.length) {
        throw new Error(
          t(
            "configurationManagers.notices.frequencyImportEmpty",
            "No valid frequencies found in the selected file.",
          ),
        );
      }

      setDraft((current) => ({
        ...current,
        [listKey]: nextList.join(", "),
        [defaultKey]: String(
          Math.min(
            Math.max(0, Number(current[defaultKey]) || 0),
            Math.max(0, nextList.length - 1),
          ),
        ),
      }));
      setNotice(
        t(
          "configurationManagers.notices.frequencyImported",
          "{count} frequencies imported into {title}.",
          { count: nextList.length, title: frequencyEditor.title },
        ),
      );
    } catch (requestError) {
      setError(
        requestError?.message ||
          t(
            "configurationManagers.notices.frequencyImportFailed",
            "Unable to import frequency list.",
          ),
      );
      setNotice("");
    }
  }

  function exportFrequencyListFile() {
    if (!frequencyEditor) return;

    const listKey = frequencyEditor.listKey || "freqList";
    const list = parseFrequencyList(draft[listKey]);

    if (!list.length) {
      setNotice(
        t(
          "configurationManagers.notices.frequencyExportEmpty",
          "No frequencies are available to export.",
        ),
      );
      return;
    }

    const payload = {
      version: serializeValue(draft.firmwareVersion || draft.version || ""),
      uniformityParam: {
        [listKey]: list,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeIp = serializeValue(deviceIp).replace(/[^a-z0-9.-]+/gi, "_");
    link.href = url;
    link.download = `${listKey}-${safeIp || "device"}.msconf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice(
      t(
        "configurationManagers.notices.frequencyExported",
        "{count} frequencies exported from {title}.",
        { count: list.length, title: frequencyEditor.title },
      ),
    );
  }

  /**
   * Adds a single frequency to the list.
   */
  function addFrequency() {
    const mhz = Number(frequencyInput);
    if (!Number.isFinite(mhz) || mhz <= 0) {
      setNotice(
        t(
          "configurationManagers.notices.validFrequency",
          "Enter a valid frequency in MHz.",
        ),
      );
      return;
    }
    const listKey = frequencyEditor?.listKey || "freqList";
    const nextList = [
      ...parseFrequencyList(draft[listKey]),
      Math.round(mhz * 1_000_000),
    ];
    setDraft((current) => ({ ...current, [listKey]: nextList.join(", ") }));
    setFrequencyInput("");
    setNotice(
      t(
        "configurationManagers.notices.frequencyAdded",
        "Frequency added to the local list.",
      ),
    );
  }

  /**
   * Adds a range of frequencies to the list.
   */
  function addFrequencyRange() {
    const startMhz = Number(frequencyRange.start);
    const endMhz = Number(frequencyRange.end);
    const intervalMhz = Number(frequencyRange.interval);

    if (
      !Number.isFinite(startMhz) ||
      !Number.isFinite(endMhz) ||
      !Number.isFinite(intervalMhz) ||
      startMhz <= 0 ||
      endMhz < startMhz ||
      intervalMhz <= 0
    ) {
      setNotice(
        t(
          "configurationManagers.notices.validFrequencyRange",
          "Enter a valid start, end, and interval in MHz.",
        ),
      );
      return;
    }

    const listKey = frequencyEditor?.listKey || "freqList";
    const additions = [];
    for (
      let current = startMhz;
      current <= endMhz + 1e-9;
      current += intervalMhz
    ) {
      additions.push(Math.round(current * 1_000_000));
      if (additions.length > 512) break;
    }

    const nextList = Array.from(
      new Set([...parseFrequencyList(draft[listKey]), ...additions]),
    ).sort((a, b) => a - b);
    setDraft((current) => ({ ...current, [listKey]: nextList.join(", ") }));
    setFrequencyRange({ start: "", end: "", interval: "" });
    setNotice(
      t(
        "configurationManagers.notices.frequencyRangeAdded",
        "Frequency range added to the local list.",
      ),
    );
  }

  /**
   * Removes a frequency from the list by index.
   *
   * @param {number} index - Index to remove
   */
  function removeFrequency(index) {
    const listKey = frequencyEditor?.listKey || "freqList";
    const defaultKey = frequencyEditor?.defaultKey || "freqDefault";
    const nextList = parseFrequencyList(draft[listKey]).filter(
      (_, itemIndex) => itemIndex !== index,
    );
    const currentIndex = Number(draft[defaultKey]);
    setDraft((current) => ({
      ...current,
      [listKey]: nextList.join(", "),
      [defaultKey]: String(
        Math.min(
          Math.max(0, currentIndex || 0),
          Math.max(0, nextList.length - 1),
        ),
      ),
    }));
    setNotice(
      t(
        "configurationManagers.notices.frequencyRemoved",
        "Frequency removed from the local list.",
      ),
    );
  }

  /**
   * Selects a frequency as the default.
   *
   * @param {number} index - Index to select
   */
  function selectFrequency(index) {
    const defaultKey = frequencyEditor?.defaultKey || "freqDefault";
    setDraft((current) => ({ ...current, [defaultKey]: String(index) }));
    setNotice(
      t(
        "configurationManagers.notices.frequencySelected",
        "Selected frequency updated locally.",
      ),
    );
  }

  // --- Expert Editor Functions ---

  /**
   * Safely parses JSON from draft with fallback.
   *
   * @param {string} key - Configuration key
   * @param {any} fallback - Fallback value
   * @returns {any} Parsed JSON or fallback
   */
  function parseJsonDraft(key, fallback) {
    const value = draft[key];
    if (typeof value !== "string") return value ?? fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  /**
   * Parses a node list from a value.
   *
   * @param {any} value - Value to parse
   * @returns {Array<number>} Array of node IDs
   */
  function parseNodeList(value) {
    return serializeValue(value)
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item));
  }

  /**
   * Opens the appropriate editor for a field.
   *
   * @param {Object} field - Field definition
   */
  function openManagedEditor(field) {
    if (
      field.type === "restrictedFrequencyManager" ||
      field.type === "modulationManager" ||
      field.type === "nodeListManager" ||
      field.type === "networkListManager"
    ) {
      setExpertEditor(field);
      setRestrictedBandInput({ lower: "", upper: "" });
      setModulationInput({ nodeId: "", code: "" });
      setNodeIdInput("");
      setNetworkListInput({});
      return;
    }

    setFrequencyEditor({
      title: t(`configurationFields.${field.key}`, field.label),
      listKey: field.listKey || "freqList",
      defaultKey: field.defaultKey || field.key,
    });
    setFrequencyInput("");
    setFrequencyRange({ start: "", end: "", interval: "" });
  }

  // --- Restricted Frequency Manager Functions ---

  /**
   * Adds a restricted frequency band.
   */
  function addRestrictedBand() {
    const lowerMhz = Number(restrictedBandInput.lower);
    const upperMhz = Number(restrictedBandInput.upper);

    if (
      !Number.isFinite(lowerMhz) ||
      !Number.isFinite(upperMhz) ||
      lowerMhz <= 0 ||
      upperMhz < lowerMhz
    ) {
      setNotice(
        t(
          "configurationManagers.notices.validRestrictedRange",
          "Enter a valid lower and upper frequency in MHz.",
        ),
      );
      return;
    }

    const nextBands = [
      ...parseJsonDraft("forbiddenFreqBands", []),
      {
        freqMin: Math.round(lowerMhz * 1_000_000),
        freqMax: Math.round(upperMhz * 1_000_000),
      },
    ];
    setDraft((current) => ({
      ...current,
      forbiddenFreqBands: JSON.stringify(nextBands, null, 2),
    }));
    setRestrictedBandInput({ lower: "", upper: "" });
    setNotice(
      t(
        "configurationManagers.notices.restrictedRangeAdded",
        "Restricted frequency range added locally.",
      ),
    );
  }

  /**
   * Removes a restricted frequency band by index.
   *
   * @param {number} index - Index to remove
   */
  function removeRestrictedBand(index) {
    const nextBands = parseJsonDraft("forbiddenFreqBands", []).filter(
      (_, itemIndex) => itemIndex !== index,
    );
    setDraft((current) => ({
      ...current,
      forbiddenFreqBands: JSON.stringify(nextBands, null, 2),
    }));
    setNotice(
      t(
        "configurationManagers.notices.restrictedRangeRemoved",
        "Restricted frequency range removed locally.",
      ),
    );
  }

  // --- Modulation Manager Functions ---

  /**
   * Adds a modulation override for a specific node.
   */
  function addModulationOverride() {
    const nodeId = Number(modulationInput.nodeId);
    const code = Number(modulationInput.code);

    if (
      !Number.isInteger(nodeId) ||
      !Number.isInteger(code) ||
      nodeId < 0 ||
      nodeId > 252 ||
      code < 0 ||
      code > 13
    ) {
      setNotice(
        t(
          "configurationManagers.notices.validModulation",
          "Enter a valid node ID (0-252) and modulation code (0-13).",
        ),
      );
      return;
    }

    const nextFormats = {
      ...parseJsonDraft("mcFormats", {}),
      [nodeId]: code,
    };
    setDraft((current) => ({
      ...current,
      mcFormats: JSON.stringify(nextFormats, null, 2),
    }));
    setModulationInput({ nodeId: "", code: "" });
    setNotice(
      t(
        "configurationManagers.notices.modulationAdded",
        "Custom modulation override added locally.",
      ),
    );
  }

  /**
   * Removes a modulation override for a specific node.
   *
   * @param {string|number} nodeId - Node ID to remove
   */
  function removeModulationOverride(nodeId) {
    const nextFormats = { ...parseJsonDraft("mcFormats", {}) };
    delete nextFormats[nodeId];
    setDraft((current) => ({
      ...current,
      mcFormats: JSON.stringify(nextFormats, null, 2),
    }));
    setNotice(
      t(
        "configurationManagers.notices.modulationRemoved",
        "Custom modulation override removed locally.",
      ),
    );
  }

  // --- Node List Manager Functions ---

  /**
   * Adds a node ID to the managed list.
   */
  function addManagedNodeId() {
    const nodeId = Number(nodeIdInput);

    if (!Number.isInteger(nodeId) || nodeId < 0 || nodeId > 252) {
      setNotice(
        t(
          "configurationManagers.notices.validNodeId",
          "Enter a valid node ID from 0 to 252.",
        ),
      );
      return;
    }

    const key = expertEditor?.key || "disableNodeId";
    const nextNodes = Array.from(
      new Set([...parseNodeList(draft[key]), nodeId]),
    ).sort((a, b) => a - b);
    setDraft((current) => ({ ...current, [key]: nextNodes.join(", ") }));
    setNodeIdInput("");
    setNotice(
      t("configurationManagers.notices.nodeAdded", "Node ID added locally."),
    );
  }

  /**
   * Removes a node ID from the managed list.
   *
   * @param {number} nodeId - Node ID to remove
   */
  function removeManagedNodeId(nodeId) {
    const key = expertEditor?.key || "disableNodeId";
    const nextNodes = parseNodeList(draft[key]).filter(
      (item) => item !== nodeId,
    );
    setDraft((current) => ({ ...current, [key]: nextNodes.join(", ") }));
    setNotice(
      t(
        "configurationManagers.notices.nodeRemoved",
        "Node ID removed locally.",
      ),
    );
  }

  // --- Network List Manager Functions ---

  /**
   * Gets rows from a network list configuration.
   *
   * @param {string} [key=expertEditor?.key] - Configuration key
   * @returns {Array} Array of rows
   */
  function networkListRows(key = expertEditor?.key) {
    const rows = parseJsonDraft(key, []);
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * Gets available network interface names from netIfConfig.
   *
   * @returns {Array<string>} Interface names
   */
  function networkInterfaceOptions() {
    return [
      ...new Set(
        networkListRows("netIfConfig")
          .map((row) => serializeValue(row?.name).trim())
          .filter(Boolean),
      ),
    ];
  }

  /**
   * Updates network list input state.
   *
   * @param {string} key - Input key
   * @param {any} value - Input value
   */
  function updateNetworkListInput(key, value) {
    setNetworkListInput((current) => ({ ...current, [key]: value }));
  }

  /**
   * Gets a numeric value from network list input.
   *
   * @param {string} key - Input key
   * @param {any} fallback - Fallback value
   * @returns {number|null} Numeric value or null
   */
  function numericInput(key, fallback = "") {
    const value = Number(networkListInput[key] ?? fallback);
    return Number.isFinite(value) ? value : null;
  }

  /**
   * Adds an entry to the network list based on the current expert editor.
   * Handles all network list types with appropriate validation.
   */
  function addNetworkListEntry() {
    const key = expertEditor?.key;
    let entry = null;

    // Trap Key
    if (key === "trapKey") {
      const trapKey = serializeValue(networkListInput.trapKey).trim();
      if (!trapKey) {
        setNotice(
          t("configurationManagers.notices.enterTrapKey", "Enter a trap key."),
        );
        return;
      }
      entry = trapKey;
    }

    // Routes
    if (key === "routes") {
      const route = serializeValue(networkListInput.route)
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isInteger(item));
      if (!route.length) {
        setNotice(
          t(
            "configurationManagers.notices.enterRouteNode",
            "Enter at least one route node ID.",
          ),
        );
        return;
      }
      entry = route;
    }

    // OCL: ordered telemetry/control chain node IDs.
    if (key === "ocl") {
      const chain = serializeValue(networkListInput.ocl)
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isInteger(item));
      if (!chain.length) {
        setNotice(
          t(
            "configurationManagers.notices.enterOclNode",
            "Enter at least one OCL node ID.",
          ),
        );
        return;
      }
      entry = chain;
    }

    // IP Priority List
    if (key === "ipPrioritylist") {
      const priority = numericInput("priority", "0");
      const addressType = numericInput("addressType", "2");
      const address = serializeValue(networkListInput.address).trim();
      if (
        ![0, 1, 2, 3].includes(priority) ||
        ![1, 2, 3].includes(addressType) ||
        !address
      ) {
        setNotice(
          t(
            "configurationManagers.notices.validIpPriority",
            "Enter IP address, address type 1-3, and priority 0-3.",
          ),
        );
        return;
      }
      entry = { priority, addressType, address };
    }

    // Service Priority List
    if (key === "servicePrioritylist") {
      const protocolType = numericInput("protocolType", "0");
      const protocolPort = numericInput("protocolPort");
      const priority = numericInput("priority", "0");
      if (
        ![0, 1].includes(protocolType) ||
        protocolPort == null ||
        protocolPort < 1 ||
        protocolPort > 65535 ||
        ![0, 1, 2, 3].includes(priority)
      ) {
        setNotice(
          t(
            "configurationManagers.notices.validServicePriority",
            "Enter protocol 0/1, port 1-65535, and priority 0-3.",
          ),
        );
        return;
      }
      entry = { protocolType, protocolPort, priority };
    }

    // DSCP Priority List
    if (key === "dscpPrioritylist") {
      const priority = numericInput("priority", "0");
      const dscp = numericInput("dscp");
      if (
        ![0, 1, 2, 3].includes(priority) ||
        dscp == null ||
        dscp < 1 ||
        dscp > 63
      ) {
        setNotice(
          t(
            "configurationManagers.notices.validDscpPriority",
            "Enter DSCP 1-63 and priority 0-3.",
          ),
        );
        return;
      }
      entry = { priority, dscp };
    }

    // ARP Defence List
    if (key === "arpDefendList") {
      const srcIp = serializeValue(networkListInput.srcIp).trim();
      const reqLimit = numericInput("reqLimit");
      const blockTime = numericInput("blockTime");
      if (!srcIp || reqLimit == null || blockTime == null) {
        setNotice(
          t(
            "configurationManagers.notices.validArpDefence",
            "Enter source IP, request limit, and block time.",
          ),
        );
        return;
      }
      entry = { srcIp, reqLimit, blockTime };
    }

    // Network Interface Config
    if (key === "netIfConfig") {
      const interfaceOptions = networkInterfaceOptions();
      const name = serializeValue(
        networkListInput.name || interfaceOptions[0] || "",
      ).trim();
      const mode = numericInput("mode", "0");
      const ipMode = numericInput("ipMode", "0");
      const ip = serializeValue(networkListInput.ip).trim();
      const nwMask = serializeValue(networkListInput.nwMask).trim();
      const gateway = serializeValue(networkListInput.gateway).trim();
      const hardwareChecksum =
        serializeValue(networkListInput.hardwareChecksum || "true") === "true";
      if (
        !interfaceOptions.includes(name) ||
        ![0, 1, 2].includes(mode) ||
        ![0, 1, 2].includes(ipMode)
      ) {
        setNotice(
          t(
            "configurationManagers.notices.validInterface",
            "Select interface name, working mode 0-2, and IP mode 0-2.",
          ),
        );
        return;
      }
      entry = { name, mode, ipMode, ip, nwMask, gateway, hardwareChecksum };
    }

    // Broadcast Whitelist
    if (key === "ipBroadcastWhitelist") {
      const port = numericInput("port");
      const priority = numericInput("priority", "0");
      if (
        port == null ||
        port < 0 ||
        port > 65535 ||
        ![0, 1].includes(priority)
      ) {
        setNotice(
          t(
            "configurationManagers.notices.validBroadcastPriority",
            "Enter broadcast port 0-65535 and priority 0-1.",
          ),
        );
        return;
      }
      entry = { port, priority };
    }

    // Broadcast Blacklist
    if (key === "ipBroadcastBlacklist") {
      const port = numericInput("port");
      if (port == null || port < 0 || port > 65535) {
        setNotice(
          t(
            "configurationManagers.notices.validBroadcastPort",
            "Enter broadcast port 0-65535.",
          ),
        );
        return;
      }
      entry = { port };
    }

    // Multicast Whitelist
    if (key === "ipMulticastWhitelist") {
      const address = serializeValue(networkListInput.address).trim();
      const priority = numericInput("priority", "0");
      const dataRate = numericInput("dataRate", "0");
      const maxHopCount = numericInput("maxHopCount", "0");
      if (
        !address ||
        ![0, 1].includes(priority) ||
        dataRate == null ||
        maxHopCount == null ||
        dataRate < 0 ||
        maxHopCount < 0
      ) {
        setNotice(
          t(
            "configurationManagers.notices.validMulticastWhitelist",
            "Enter multicast address, priority 0-1, data rate, and max hop count.",
          ),
        );
        return;
      }
      entry = { address, priority, dataRate, maxHopCount };
    }

    // Multicast Blacklist and Incoming Lists
    if (
      key === "ipMulticastBlacklist" ||
      key === "ipMulticastIncomingWhitelist" ||
      key === "ipMulticastIncomingBlacklist"
    ) {
      const address = serializeValue(networkListInput.address).trim();
      if (!address) {
        setNotice(
          t(
            "configurationManagers.notices.enterMulticastAddress",
            "Enter multicast address.",
          ),
        );
        return;
      }
      entry = { address };
    }

    if (!entry) return;

    const nextRows = [...networkListRows(key), entry];
    setDraft((current) => ({
      ...current,
      [key]: JSON.stringify(nextRows, null, 2),
    }));
    setNetworkListInput({});
    setNotice(
      t(
        "configurationManagers.notices.entryAdded",
        "{label} entry added locally.",
        {
          label: t(
            `configurationFields.${expertEditor.key}`,
            expertEditor.label,
          ),
        },
      ),
    );
  }

  /**
   * Removes a network list entry by index.
   *
   * @param {number} index - Index to remove
   */
  function removeNetworkListEntry(index) {
    const key = expertEditor?.key;
    const nextRows = networkListRows(key).filter(
      (_, itemIndex) => itemIndex !== index,
    );
    setDraft((current) => ({
      ...current,
      [key]: JSON.stringify(nextRows, null, 2),
    }));
    setNotice(
      t(
        "configurationManagers.notices.entryRemoved",
        "{label} entry removed locally.",
        {
          label: t(
            `configurationFields.${expertEditor.key}`,
            expertEditor.label,
          ),
        },
      ),
    );
  }

  /**
   * Formats a network list entry for display.
   *
   * @param {string} key - Configuration key
   * @param {any} row - Row data
   * @returns {string} Formatted display string
   */
  function formatNetworkListEntry(key, row) {
    if (key === "trapKey") return String(row);
    if (key === "routes")
      return t("configurationManagers.list.route", "Route: {value}", {
        value: Array.isArray(row) ? row.join(" -> ") : JSON.stringify(row),
      });
    if (key === "ocl")
      return t("configurationManagers.list.ocl", "OCL chain: {value}", {
        value: Array.isArray(row) ? row.join(" -> ") : JSON.stringify(row),
      });
    if (key === "netIfConfig")
      return t(
        "configurationManagers.list.interface",
        "{name} mode {mode} ipMode {ipMode}",
        {
          name: row.name || t("configurationManagers.labels.interface", "Interface"),
          mode: row.mode ?? "-",
          ipMode: row.ipMode ?? "-",
        },
      );
    if (key === "ipBroadcastWhitelist")
      return t(
        "configurationManagers.list.portPriority",
        "Port {port}, priority {priority}",
        { port: row.port, priority: row.priority },
      );
    if (key === "ipBroadcastBlacklist")
      return t("configurationManagers.list.port", "Port {port}", {
        port: row.port,
      });
    if (key === "ipMulticastWhitelist")
      return t(
        "configurationManagers.list.multicastWhitelist",
        "{address}, priority {priority}, {dataRate} kbps, hops {maxHopCount}",
        {
          address: row.address,
          priority: row.priority,
          dataRate: row.dataRate,
          maxHopCount: row.maxHopCount,
        },
      );
    if (
      key === "ipMulticastBlacklist" ||
      key === "ipMulticastIncomingWhitelist" ||
      key === "ipMulticastIncomingBlacklist"
    ) {
      return row.address || JSON.stringify(row);
    }
    return JSON.stringify(row);
  }

  function configTabLabel(tab) {
    return t(`configuration.${tab.id}`, tab.label);
  }

  function configTabDescription(tab) {
    return t(`configuration.${tab.id}Description`, tab.description);
  }

  function configSectionPartTitle(part) {
    const slug = configSlug(part);
    const tabTranslation = t(`configuration.${slug}`, "");
    if (tabTranslation) return tabTranslation;
    return t(`configurationSections.${slug}.title`, part || "");
  }

  function configSectionTitle(title) {
    if (String(title || "").includes("/")) {
      return String(title || "")
        .split("/")
        .map((part) => configSectionPartTitle(part.trim()))
        .join(" / ");
    }
    return t(`configurationSections.${configSlug(title)}.title`, title || "");
  }

  function configFieldLabel(result) {
    if (result.type === "Setting") {
      return t(`configurationFields.${result.key}`, result.label);
    }
    if (result.type === "Section") {
      return configSectionTitle(result.label);
    }
    return t(`configuration.${result.tabId}`, result.label);
  }

  function configurationSearchPath(result) {
    const parts = [
      t(`configuration.${result.tabId}`, result.tabLabel),
      result.sectionTitle ? configSectionTitle(result.sectionTitle) : "",
      result.type === "Setting" ? configFieldLabel(result) : "",
    ].filter(Boolean);
    return parts.join(" > ");
  }

  return (
    <section className="configuration-page">
      <div className="configuration-workspace">
        {/* Main configuration navigation follows the fixed side-nav pattern. */}
        <aside
          className="configuration-side-tabs"
          aria-label={t("configuration.categories", "Configuration categories")}
        >
          <span>{t("configuration.categories", "Configuration")}</span>
          <div
            className="configuration-tabs"
            role="tablist"
            aria-label={t("configuration.tabsLabel", "Configuration tabs")}
          >
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? "active" : ""}
                onClick={() => {
                  setActiveTab(tab.id);
                  setActiveSectionTitle("");
                }}
              >
                <i aria-hidden="true">
                  <img src={CONFIG_TAB_ICONS[tab.id]} alt="" />
                </i>
                <span>{configTabLabel(tab)}</span>
                <small>{configTabDescription(tab)}</small>
              </button>
            ))}
          </div>
          <div
            className="configuration-side-actions"
            aria-label={t(
              "configuration.fileActions",
              "Configuration file actions",
            )}
          >
            <input
              ref={importInputRef}
              className="configuration-import-input"
              type="file"
              accept=".msconf,.json,application/json"
              onChange={importConfigFile}
            />
            <button
              type="button"
              className="configuration-import"
              disabled={importingConfig || status === "loading"}
              onClick={() => importInputRef.current?.click()}
              title={t(
                "configuration.importTitle",
                "Import a .msconf export file to this device",
              )}
            >
              {importingConfig
                ? t("common.importing", "Importing")
                : t("common.import", "Import")}
            </button>
            <button
              type="button"
              className="configuration-export"
              disabled={importingConfig || status === "loading"}
              onClick={exportConfigFile}
              title={t(
                "configuration.exportTitle",
                "Export update-all-node settings as a .msconf file",
              )}
            >
              {t("common.export", "Export")}
            </button>
          </div>
        </aside>

        <div className="configuration-content">
          {/* Header with section controls */}
          <header className="configuration-screen-head">
            <div className="configuration-heading-copy">
              <h1>
                {activeLabel} {t("configuration.settingsSuffix", "Settings")}
              </h1>
              {activeDescription && <p>{activeDescription}</p>}
            </div>

            {/* Section navigation for the active configuration group. */}
            <div className="configuration-submenu-row">
              {activeTab !== "global" && visibleHeaderSections.length > 1 && (
                <nav
                  className="configuration-header-sections breadcrumb-tabs"
                  aria-label={t(
                    "configurationControls.settingsPath",
                    "{tab} settings path",
                    { tab: activeLabel || activeTab },
                  )}
                >
                  {visibleHeaderSections.map((section) => (
                    <button
                      key={section.title}
                      type="button"
                      aria-current={
                        section.title === activeSectionTitle ? "step" : undefined
                      }
                      className={
                        section.title === activeSectionTitle ? "active" : ""
                      }
                      onClick={() => setActiveSectionTitle(section.title)}
                    >
                      <span>{configSectionTitle(section.title)}</span>
                    </button>
                  ))}
                </nav>
              )}
            </div>

            <div className="configuration-search" role="search">
              <label htmlFor="configuration-search-input">
                {t("configuration.searchLabel", "Search configuration")}
              </label>
              <input
                id="configuration-search-input"
                type="search"
                value={configurationSearch}
                onChange={(event) => setConfigurationSearch(event.target.value)}
                onKeyDown={handleConfigurationSearchKeyDown}
                placeholder={t(
                  "configuration.searchPlaceholder",
                  "Search frequency, DHCP, encryption, GPS...",
                )}
                autoComplete="off"
                aria-expanded={Boolean(configurationSearch)}
                aria-controls="configuration-search-results"
                aria-activedescendant={
                  configurationSearchResults[configurationSearchActiveIndex]
                    ? `configuration-search-result-${configurationSearchResults[configurationSearchActiveIndex].id.replace(/[^a-z0-9_-]+/gi, "-")}`
                    : undefined
                }
              />
              {configurationSearch && (
                <div
                  id="configuration-search-results"
                  className="configuration-search-results"
                  role="listbox"
                >
                  {configurationSearchResults.length > 0 ? (
                    configurationSearchResults.map((result, index) => (
                      <button
                        key={result.id}
                        id={`configuration-search-result-${result.id.replace(/[^a-z0-9_-]+/gi, "-")}`}
                        type="button"
                        role="option"
                        aria-selected={index === configurationSearchActiveIndex}
                        className={
                          index === configurationSearchActiveIndex
                            ? "active"
                            : ""
                        }
                        onClick={() => navigateToSearchResult(result)}
                        onMouseEnter={() =>
                          setConfigurationSearchActiveIndex(index)
                        }
                      >
                        <span className="configuration-search-result-copy">
                          <strong>{configFieldLabel(result)}</strong>
                          <span>{configurationSearchPath(result)}</span>
                        </span>
                        <em>
                          {result.type === "Setting"
                            ? t("configuration.openSetting", "Open setting")
                            : t("configuration.openSection", "Open section")}
                        </em>
                      </button>
                    ))
                  ) : (
                    <div>
                      {t(
                        "configuration.noSearchResults",
                        "No matching configuration found.",
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Global toggle and refresh */}
            <button
              type="button"
              className={
                updateAllNodes
                  ? "configuration-global-toggle active"
                  : "configuration-global-toggle"
              }
              disabled={updatingGlobal || status === "loading"}
              onClick={toggleUpdateAllNodes}
              aria-pressed={updateAllNodes}
              title={t(
                "configuration.updateAllNodesTitle",
                "Use configGlobal=true so supported settings apply to all nodes",
              )}
            >
              <span>{t("configuration.updateAllNodes", "Update All Nodes")}</span>
              <i aria-hidden="true" />
            </button>
            <div className="configuration-header-actions">
              <button
                type="button"
                className="configuration-refresh"
                disabled={status === "loading"}
                onClick={() => load(new AbortController().signal)}
              >
                {status === "refreshing"
                  ? t("common.refreshing", "Refreshing")
                  : t("common.refresh", "Refresh")}
              </button>
              <button
                className="configuration-reset"
                type="button"
                onClick={resetDraft}
              >
                {t("common.resetAll", "Reset All")}
              </button>
            </div>
          </header>

          <div
            className={`configuration-apply-dock ${
              pendingApplyEntries.length ? "has-changes" : "is-idle"
            }`}
          >
            <div
              className={`configuration-unsaved-summary ${
                pendingApplyEntries.length ? "has-changes" : ""
              }`}
              aria-live="polite"
            >
              <strong>
                {pendingApplyEntries.length
                  ? t(
                      "configuration.unsavedChangesCount",
                      "{count} unsaved change{plural}",
                      {
                        count: pendingApplyEntries.length,
                        plural: pendingApplyEntries.length === 1 ? "" : "s",
                      },
                    )
                  : t(
                      "configuration.noUnsavedChanges",
                      "No unsaved changes",
                    )}
              </strong>
              {pendingApplyEntries.length ? (
                <span>
                  {pendingApplySummary.labels.join(", ")}
                  {pendingApplySummary.remaining
                    ? ` ${t("configuration.unsavedMore", "+{count} more", {
                        count: pendingApplySummary.remaining,
                      })}`
                    : ""}
                </span>
              ) : (
                <span>
                  {t(
                    "configuration.unsavedHint",
                    "Modified fields will appear here before apply.",
                  )}
                </span>
              )}
            </div>

            <button
              className="configuration-floating-apply"
              type="button"
              disabled={
                status === "loading" ||
                Boolean(applyingSection) ||
                importingConfig ||
                !pendingApplyEntries.length
              }
              onClick={prepareApplyChanges}
            >
              {applyingSection
                ? t("common.applying", "Applying...")
                : pendingApplyEntries.length
                  ? `${t("common.applyChanges", "Apply Changes")} (${pendingApplyEntries.length})`
                  : t("common.applyChanges", "Apply Changes")}
            </button>
          </div>

          {/* Status messages */}
          {error && <div className="configuration-error">{error}</div>}
          {notice && <div className="configuration-notice">{notice}</div>}

          {/* Active configuration component */}
          <ActiveConfig
            draft={draft}
            onChange={updateDraft}
            onManageFrequency={openManagedEditor}
            selectedAntenna={selectedAntenna}
            onSelectedAntennaChange={setSelectedAntenna}
            initialSectionTitle={target?.tab === activeTab ? target.section : ""}
            activeSectionTitle={activeSectionTitle}
            onActiveSectionTitleChange={setActiveSectionTitle}
            highlightFieldId={
              target?.tab === activeTab && target?.section === activeSectionTitle
                ? target.field
                : ""
            }
            highlightNonce={target?.nonce}
            modifiedFieldKeys={modifiedFieldKeys}
            showSectionTabs={false}
            showAllSections={activeTab === "global"}
          />
        </div>
      </div>

      {/* Review Changes Modal */}
      {pendingReview && (
        <div className="configuration-modal-backdrop">
          <section className="configuration-review-modal">
            <div className="configuration-card-title">
              {t("configuration.reviewChanges", "Review Changes")}
            </div>
            <div className="configuration-review-body">
              <div className="configuration-review-summary">
                <div>
                  <strong>{pendingReview.sectionTitle}</strong>
                  <span>
                    {pendingReview.applyGlobally
                      ? t(
                          "configuration.reviewGlobalSummary",
                          "Only modified * parameters will be applied with configGlobal=true.",
                        )
                      : t(
                          "configuration.reviewSummary",
                          "Confirm the parameters before posting to the device.",
                        )}
                  </span>
                </div>
                {pendingReview.applyGlobally && (
                  <em>
                    {t(
                      "configuration.updateAllNodesEnabled",
                      "Update All Nodes enabled",
                    )}
                  </em>
                )}
              </div>

              <div className="configuration-review-list">
                {pendingReview.rows.map((row) => (
                  <div className="configuration-review-row" key={row.key}>
                    <div className="configuration-review-name">
                      <strong>
                        {row.label}
                        {row.global && row.key !== "configGlobal" ? " *" : ""}
                      </strong>
                    </div>
                    <div className="configuration-review-values">
                      <span>{row.oldValue}</span>
                      <i aria-hidden="true">-&gt;</i>
                      <strong>{row.newValue}</strong>
                    </div>
                  </div>
                ))}
              </div>

              <div className="configuration-review-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={Boolean(applyingSection)}
                  onClick={() => setPendingReview(null)}
                >
                  {t("common.cancel", "Cancel")}
                </button>
                <button
                  type="button"
                  disabled={Boolean(applyingSection)}
                  onClick={confirmApplyReview}
                >
                  {applyingSection
                    ? t("common.applying", "Applying")
                    : t("common.confirmApply", "Confirm Apply")}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Frequency Editor Modal */}
      {frequencyEditor && (
        <div className="configuration-modal-backdrop">
          <section className="configuration-frequency-modal">
            <div className="configuration-card-title">
              {t(
                "configurationManagers.frequencyListTitle",
                "{title} List",
                { title: frequencyEditor.title },
              )}
            </div>
            <div className="configuration-frequency-modal-body">
              {/* Single frequency add */}
              <div className="configuration-frequency-add">
                <label className="configuration-field">
                  <span>
                    {t(
                      "configurationManagers.labels.addFrequencyMhz",
                      "Add Frequency (MHz)",
                    )}
                  </span>
                  <input
                    value={frequencyInput}
                    onChange={(event) => setFrequencyInput(event.target.value)}
                    placeholder="2400"
                    type="number"
                    step="0.001"
                  />
                </label>
                <button type="button" onClick={addFrequency}>
                  {t("configurationManagers.actions.add", "Add")}
                </button>
              </div>

              {/* Frequency range add */}
              <div className="configuration-frequency-range">
                <label className="configuration-field">
                  <span>
                    {t(
                      "configurationManagers.labels.startFrequencyMhz",
                      "Start Frequency (MHz)",
                    )}
                  </span>
                  <input
                    value={frequencyRange.start}
                    onChange={(event) =>
                      setFrequencyRange((current) => ({
                        ...current,
                        start: event.target.value,
                      }))
                    }
                    placeholder="570"
                    type="number"
                    step="0.001"
                  />
                </label>
                <label className="configuration-field">
                  <span>
                    {t(
                      "configurationManagers.labels.endFrequencyMhz",
                      "End Frequency (MHz)",
                    )}
                  </span>
                  <input
                    value={frequencyRange.end}
                    onChange={(event) =>
                      setFrequencyRange((current) => ({
                        ...current,
                        end: event.target.value,
                      }))
                    }
                    placeholder="580"
                    type="number"
                    step="0.001"
                  />
                </label>
                <label className="configuration-field">
                  <span>
                    {t(
                      "configurationManagers.labels.intervalMhz",
                      "Interval (MHz)",
                    )}
                  </span>
                  <input
                    value={frequencyRange.interval}
                    onChange={(event) =>
                      setFrequencyRange((current) => ({
                        ...current,
                        interval: event.target.value,
                      }))
                    }
                    placeholder="1"
                    type="number"
                    step="0.001"
                  />
                </label>
                <button type="button" onClick={addFrequencyRange}>
                  {t("configurationManagers.actions.addRange", "Add Range")}
                </button>
              </div>

              {/* Frequency list display */}
              <div className="configuration-frequency-list">
                {parseFrequencyList(draft[frequencyEditor.listKey]).map(
                  (frequency, index) => (
                    <div
                      className={
                        Number(draft[frequencyEditor.defaultKey]) === index
                          ? "selected"
                          : ""
                      }
                      key={`${frequency}-${index}`}
                    >
                      <button
                        type="button"
                        onClick={() => selectFrequency(index)}
                      >
                        {formatFrequencyMhzFromHz(frequency)}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFrequency(index)}
                      >
                        {t("configurationManagers.actions.remove", "Remove")}
                      </button>
                    </div>
                  ),
                )}
                {!parseFrequencyList(draft[frequencyEditor.listKey]).length && (
                  <p>
                    {t(
                      "configurationManagers.empty.frequencyList",
                      "No frequency list loaded. Add a frequency in MHz.",
                    )}
                  </p>
                )}
              </div>
              <div className="configuration-frequency-modal-actions">
                <input
                  ref={frequencyImportInputRef}
                  className="configuration-import-input"
                  type="file"
                  accept=".msconf,.json,application/json"
                  onChange={importFrequencyListFile}
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => frequencyImportInputRef.current?.click()}
                >
                  {t("common.import", "Import")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={exportFrequencyListFile}
                >
                  {t("common.export", "Export")}
                </button>
                <button type="button" onClick={() => setFrequencyEditor(null)}>
                  {t("configurationManagers.actions.done", "Done")}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Expert Editor Modal */}
      {expertEditor && (
        <div className="configuration-modal-backdrop">
          <section className="configuration-frequency-modal">
            <div className="configuration-card-title">
              {t(`configurationFields.${expertEditor.key}`, expertEditor.label)}
            </div>
            <div className="configuration-frequency-modal-body">
              {/* Restricted Frequency Manager */}
              {expertEditor.type === "restrictedFrequencyManager" && (
                <>
                  <div className="configuration-frequency-range">
                    <label className="configuration-field">
                      <span>
                        {t(
                          "configurationManagers.labels.lowerFrequencyMhz",
                          "Lower Frequency (MHz)",
                        )}
                      </span>
                      <input
                        value={restrictedBandInput.lower}
                        onChange={(event) =>
                          setRestrictedBandInput((current) => ({
                            ...current,
                            lower: event.target.value,
                          }))
                        }
                        placeholder="570"
                        type="number"
                        step="0.001"
                      />
                    </label>
                    <label className="configuration-field">
                      <span>
                        {t(
                          "configurationManagers.labels.upperFrequencyMhz",
                          "Upper Frequency (MHz)",
                        )}
                      </span>
                      <input
                        value={restrictedBandInput.upper}
                        onChange={(event) =>
                          setRestrictedBandInput((current) => ({
                            ...current,
                            upper: event.target.value,
                          }))
                        }
                        placeholder="580"
                        type="number"
                        step="0.001"
                      />
                    </label>
                    <button type="button" onClick={addRestrictedBand}>
                      {t("configurationManagers.actions.addRange", "Add Range")}
                    </button>
                  </div>
                  <div className="configuration-frequency-list">
                    {parseJsonDraft("forbiddenFreqBands", []).map(
                      (band, index) => (
                        <div key={`${band.freqMin}-${band.freqMax}-${index}`}>
                          <button type="button">
                            {formatFrequencyMhzFromHz(band.freqMin)} -{" "}
                            {formatFrequencyMhzFromHz(band.freqMax)}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRestrictedBand(index)}
                          >
                            {t("configurationManagers.actions.remove", "Remove")}
                          </button>
                        </div>
                      ),
                    )}
                    {!parseJsonDraft("forbiddenFreqBands", []).length && (
                      <p>
                        {t(
                          "configurationManagers.empty.restrictedRanges",
                          "No restricted frequency ranges configured.",
                        )}
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Modulation Manager */}
              {expertEditor.type === "modulationManager" && (
                <>
                  <div className="configuration-frequency-range">
                    <label className="configuration-field">
                      <span>{t("configurationManagers.labels.nodeId", "Node ID")}</span>
                      <input
                        value={modulationInput.nodeId}
                        onChange={(event) =>
                          setModulationInput((current) => ({
                            ...current,
                            nodeId: event.target.value,
                          }))
                        }
                        placeholder="32"
                        type="number"
                        min="0"
                        max="252"
                      />
                    </label>
                    <label className="configuration-field">
                      <span>
                        {t(
                          "configurationManagers.labels.modulationCode",
                          "Modulation Code",
                        )}
                      </span>
                      <input
                        value={modulationInput.code}
                        onChange={(event) =>
                          setModulationInput((current) => ({
                            ...current,
                            code: event.target.value,
                          }))
                        }
                        placeholder="5"
                        type="number"
                        min="0"
                        max="13"
                      />
                    </label>
                    <button type="button" onClick={addModulationOverride}>
                      {t("configurationManagers.actions.add", "Add")}
                    </button>
                  </div>
                  <div className="configuration-frequency-list">
                    {Object.entries(parseJsonDraft("mcFormats", {})).map(
                      ([nodeId, code]) => (
                        <div key={nodeId}>
                          <button type="button">
                            {t(
                              "configurationManagers.list.nodeCode",
                              "Node {nodeId}: code {code}",
                              { nodeId, code },
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeModulationOverride(nodeId)}
                          >
                            {t("configurationManagers.actions.remove", "Remove")}
                          </button>
                        </div>
                      ),
                    )}
                    {!Object.keys(parseJsonDraft("mcFormats", {})).length && (
                      <p>
                        {t(
                          "configurationManagers.empty.modulation",
                          "No custom modulation overrides configured.",
                        )}
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Network List Manager */}
              {expertEditor.type === "networkListManager" && (
                <>
                  {/* Render appropriate form based on key */}
                  {expertEditor.key === "trapKey" && (
                    <div className="configuration-manager-form">
                      <label className="configuration-field">
                        <span>
                          {t("configurationManagers.labels.trapKey", "Trap Key")}
                        </span>
                        <input
                          value={networkListInput.trapKey || ""}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "trapKey",
                              event.target.value,
                            )
                          }
                          placeholder="temperature"
                        />
                      </label>
                      <button type="button" onClick={addNetworkListEntry}>
                        {t("configurationManagers.actions.addKey", "Add Key")}
                      </button>
                    </div>
                  )}

                  {expertEditor.key === "routes" && (
                    <div className="configuration-manager-form">
                      <label className="configuration-field">
                        <span>
                          {t(
                            "configurationManagers.labels.routeNodePath",
                            "Route Node Path",
                          )}
                        </span>
                        <input
                          value={networkListInput.route || ""}
                          onChange={(event) =>
                            updateNetworkListInput("route", event.target.value)
                          }
                          placeholder="2, 3"
                        />
                        <small>
                          {t(
                            "configurationManagers.hints.commaNodeIds",
                            "Comma-separated node IDs. Example: 2, 3",
                          )}
                        </small>
                      </label>
                      <button type="button" onClick={addNetworkListEntry}>
                        {t("configurationManagers.actions.addRoute", "Add Route")}
                      </button>
                    </div>
                  )}

                  {expertEditor.key === "ocl" && (
                    <div className="configuration-manager-form">
                      <label className="configuration-field">
                        <span>
                          {t(
                            "configurationManagers.labels.oclNodeChain",
                            "OCL Node Chain",
                          )}
                        </span>
                        <input
                          value={networkListInput.ocl || ""}
                          onChange={(event) =>
                            updateNetworkListInput("ocl", event.target.value)
                          }
                          placeholder="33, 31, 32"
                        />
                        <small>
                          {t(
                            "configurationManagers.hints.oclNodeChain",
                            "Comma-separated node IDs. Keep the order as the telemetry and control link order.",
                          )}
                        </small>
                      </label>
                      <button type="button" onClick={addNetworkListEntry}>
                        {t("configurationManagers.actions.addChain", "Add Chain")}
                      </button>
                    </div>
                  )}

                  {expertEditor.key === "ipPrioritylist" && (
                    <div className="configuration-manager-form">
                      <label className="configuration-field">
                        <span>{t("configurationManagers.labels.address", "Address")}</span>
                        <input
                          value={networkListInput.address || ""}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "address",
                              event.target.value,
                            )
                          }
                          placeholder="192.168.10.11"
                        />
                      </label>
                      <label className="configuration-field">
                        <span>
                          {t(
                            "configurationManagers.labels.addressType",
                            "Address Type",
                          )}
                        </span>
                        <select
                          value={networkListInput.addressType || "2"}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "addressType",
                              event.target.value,
                            )
                          }
                        >
                          <option value="1">
                            {t("configurationManagers.options.sourceIp", "Source IP")}
                          </option>
                          <option value="2">
                            {t(
                              "configurationManagers.options.destinationIp",
                              "Destination IP",
                            )}
                          </option>
                          <option value="3">
                            {t(
                              "configurationManagers.options.sourceOrDestination",
                              "Source or Destination",
                            )}
                          </option>
                        </select>
                      </label>
                      <label className="configuration-field">
                        <span>{t("configurationManagers.labels.priority", "Priority")}</span>
                        <select
                          value={networkListInput.priority || "0"}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "priority",
                              event.target.value,
                            )
                          }
                        >
                          <option value="0">
                            {t("configurationManagers.options.low", "Low")}
                          </option>
                          <option value="1">
                            {t("configurationManagers.options.medium", "Medium")}
                          </option>
                          <option value="2">
                            {t("configurationManagers.options.high", "High")}
                          </option>
                          <option value="3">
                            {t("configurationManagers.options.top", "Top")}
                          </option>
                        </select>
                      </label>
                      <button type="button" onClick={addNetworkListEntry}>
                        {t("configurationManagers.actions.addRule", "Add Rule")}
                      </button>
                    </div>
                  )}

                  {expertEditor.key === "servicePrioritylist" && (
                    <div className="configuration-manager-form">
                      <label className="configuration-field">
                        <span>{t("configurationManagers.labels.protocol", "Protocol")}</span>
                        <select
                          value={networkListInput.protocolType || "0"}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "protocolType",
                              event.target.value,
                            )
                          }
                        >
                          <option value="0">UDP</option>
                          <option value="1">TCP</option>
                        </select>
                      </label>
                      <label className="configuration-field">
                        <span>{t("configurationManagers.labels.port", "Port")}</span>
                        <input
                          value={networkListInput.protocolPort || ""}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "protocolPort",
                              event.target.value,
                            )
                          }
                          placeholder="5000"
                          type="number"
                          min="1"
                          max="65535"
                        />
                      </label>
                      <label className="configuration-field">
                        <span>{t("configurationManagers.labels.priority", "Priority")}</span>
                        <select
                          value={networkListInput.priority || "0"}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "priority",
                              event.target.value,
                            )
                          }
                        >
                          <option value="0">
                            {t("configurationManagers.options.low", "Low")}
                          </option>
                          <option value="1">
                            {t("configurationManagers.options.medium", "Medium")}
                          </option>
                          <option value="2">
                            {t("configurationManagers.options.high", "High")}
                          </option>
                          <option value="3">
                            {t("configurationManagers.options.top", "Top")}
                          </option>
                        </select>
                      </label>
                      <button type="button" onClick={addNetworkListEntry}>
                        {t(
                          "configurationManagers.actions.addService",
                          "Add Service",
                        )}
                      </button>
                    </div>
                  )}

                  {expertEditor.key === "dscpPrioritylist" && (
                    <div className="configuration-manager-form">
                      <label className="configuration-field">
                        <span>
                          {t(
                            "configurationManagers.labels.dscpValue",
                            "DSCP Value",
                          )}
                        </span>
                        <input
                          value={networkListInput.dscp || ""}
                          onChange={(event) =>
                            updateNetworkListInput("dscp", event.target.value)
                          }
                          placeholder="63"
                          type="number"
                          min="1"
                          max="63"
                        />
                      </label>
                      <label className="configuration-field">
                        <span>{t("configurationManagers.labels.priority", "Priority")}</span>
                        <select
                          value={networkListInput.priority || "0"}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "priority",
                              event.target.value,
                            )
                          }
                        >
                          <option value="0">
                            {t("configurationManagers.options.low", "Low")}
                          </option>
                          <option value="1">
                            {t("configurationManagers.options.medium", "Medium")}
                          </option>
                          <option value="2">
                            {t("configurationManagers.options.high", "High")}
                          </option>
                          <option value="3">
                            {t("configurationManagers.options.top", "Top")}
                          </option>
                        </select>
                      </label>
                      <button type="button" onClick={addNetworkListEntry}>
                        {t("configurationManagers.actions.addDscp", "Add DSCP")}
                      </button>
                    </div>
                  )}

                  {expertEditor.key === "arpDefendList" && (
                    <div className="configuration-manager-form">
                      <label className="configuration-field">
                        <span>
                          {t("configurationManagers.labels.sourceIp", "Source IP")}
                        </span>
                        <input
                          value={networkListInput.srcIp || ""}
                          onChange={(event) =>
                            updateNetworkListInput("srcIp", event.target.value)
                          }
                          placeholder="192.168.10.11"
                        />
                      </label>
                      <label className="configuration-field">
                        <span>
                          {t(
                            "configurationManagers.labels.requestLimit",
                            "Request Limit",
                          )}
                        </span>
                        <input
                          value={networkListInput.reqLimit || ""}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "reqLimit",
                              event.target.value,
                            )
                          }
                          placeholder="50"
                          type="number"
                          min="0"
                        />
                      </label>
                      <label className="configuration-field">
                        <span>
                          {t("configurationManagers.labels.blockTime", "Block Time")}
                        </span>
                        <input
                          value={networkListInput.blockTime || ""}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "blockTime",
                              event.target.value,
                            )
                          }
                          placeholder="60"
                          type="number"
                          min="0"
                        />
                      </label>
                      <button type="button" onClick={addNetworkListEntry}>
                        {t(
                          "configurationManagers.actions.addDefence",
                          "Add Defence",
                        )}
                      </button>
                    </div>
                  )}

                  {expertEditor.key === "netIfConfig" && (
                    <div className="configuration-manager-form">
                      <label className="configuration-field">
                        <span>
                          {t("configurationManagers.labels.interface", "Interface")}
                        </span>
                        <select
                          value={
                            networkListInput.name ||
                            availableNetworkInterfaces[0] ||
                            ""
                          }
                          onChange={(event) =>
                            updateNetworkListInput("name", event.target.value)
                          }
                          disabled={!availableNetworkInterfaces.length}
                        >
                          {availableNetworkInterfaces.map((interfaceName) => (
                            <option key={interfaceName} value={interfaceName}>
                              {interfaceName}
                            </option>
                          ))}
                          {!availableNetworkInterfaces.length && (
                            <option value="">
                              {t(
                                "configurationManagers.empty.noInterfaces",
                                "No interfaces returned",
                              )}
                            </option>
                          )}
                        </select>
                      </label>
                      <label className="configuration-field">
                        <span>
                          {t(
                            "configurationManagers.labels.workingMode",
                            "Working Mode",
                          )}
                        </span>
                        <select
                          value={networkListInput.mode || "0"}
                          onChange={(event) =>
                            updateNetworkListInput("mode", event.target.value)
                          }
                        >
                          <option value="0">
                            {t("configurationManagers.options.service", "Service")}
                          </option>
                          <option value="1">
                            {t("configurationManagers.options.data", "Data")}
                          </option>
                          <option value="2">
                            {t("configurationManagers.options.encoder", "Encoder")}
                          </option>
                        </select>
                      </label>
                      <label className="configuration-field">
                        <span>{t("configurationManagers.labels.ipMode", "IP Mode")}</span>
                        <select
                          value={networkListInput.ipMode || "0"}
                          onChange={(event) =>
                            updateNetworkListInput("ipMode", event.target.value)
                          }
                        >
                          <option value="0">
                            {t("configurationManagers.options.auto", "Auto")}
                          </option>
                          <option value="1">
                            {t("configurationManagers.options.manual", "Manual")}
                          </option>
                          <option value="2">
                            {t("configurationManagers.options.dhcpAuto", "DHCP Auto")}
                          </option>
                        </select>
                      </label>
                      <label className="configuration-field">
                        <span>
                          {t("configurationManagers.labels.ipAddress", "IP Address")}
                        </span>
                        <input
                          value={networkListInput.ip || ""}
                          onChange={(event) =>
                            updateNetworkListInput("ip", event.target.value)
                          }
                          placeholder="192.168.10.42"
                        />
                      </label>
                      <label className="configuration-field">
                        <span>{t("configurationManagers.labels.netmask", "Netmask")}</span>
                        <input
                          value={networkListInput.nwMask || ""}
                          onChange={(event) =>
                            updateNetworkListInput("nwMask", event.target.value)
                          }
                          placeholder="255.255.255.0"
                        />
                      </label>
                      <label className="configuration-field">
                        <span>{t("configurationManagers.labels.gateway", "Gateway")}</span>
                        <input
                          value={networkListInput.gateway || ""}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "gateway",
                              event.target.value,
                            )
                          }
                          placeholder="192.168.10.1"
                        />
                      </label>
                      <label className="configuration-field">
                        <span>
                          {t(
                            "configurationManagers.labels.hardwareChecksum",
                            "Hardware Checksum",
                          )}
                        </span>
                        <select
                          value={networkListInput.hardwareChecksum || "true"}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "hardwareChecksum",
                              event.target.value,
                            )
                          }
                        >
                          <option value="true">
                            {t("configurationOptions.enable", "Enable")}
                          </option>
                          <option value="false">
                            {t("configurationOptions.disable", "Disable")}
                          </option>
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={!availableNetworkInterfaces.length}
                        onClick={addNetworkListEntry}
                      >
                        {t(
                          "configurationManagers.actions.addInterface",
                          "Add Interface",
                        )}
                      </button>
                    </div>
                  )}

                  {(expertEditor.key === "ipBroadcastWhitelist" ||
                    expertEditor.key === "ipBroadcastBlacklist") && (
                    <div className="configuration-manager-form">
                      <label className="configuration-field">
                        <span>
                          {t(
                            "configurationManagers.labels.broadcastPort",
                            "Broadcast Port",
                          )}
                        </span>
                        <input
                          value={networkListInput.port || ""}
                          onChange={(event) =>
                            updateNetworkListInput("port", event.target.value)
                          }
                          placeholder="5000"
                          type="number"
                          min="0"
                          max="65535"
                        />
                      </label>
                      {expertEditor.key === "ipBroadcastWhitelist" && (
                        <label className="configuration-field">
                          <span>{t("configurationManagers.labels.priority", "Priority")}</span>
                          <select
                            value={networkListInput.priority || "0"}
                            onChange={(event) =>
                              updateNetworkListInput(
                                "priority",
                                event.target.value,
                              )
                            }
                          >
                            <option value="0">
                              {t("configurationManagers.options.low", "Low")}
                            </option>
                            <option value="1">
                              {t("configurationManagers.options.high", "High")}
                            </option>
                          </select>
                        </label>
                      )}
                      <button type="button" onClick={addNetworkListEntry}>
                        {t(
                          "configurationManagers.actions.addBroadcast",
                          "Add Broadcast",
                        )}
                      </button>
                    </div>
                  )}

                  {expertEditor.key === "ipMulticastWhitelist" && (
                    <div className="configuration-manager-form">
                      <label className="configuration-field">
                        <span>
                          {t(
                            "configurationManagers.labels.multicastAddress",
                            "Multicast Address",
                          )}
                        </span>
                        <input
                          value={networkListInput.address || ""}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "address",
                              event.target.value,
                            )
                          }
                          placeholder="224.1.3.233"
                        />
                      </label>
                      <label className="configuration-field">
                        <span>{t("configurationManagers.labels.priority", "Priority")}</span>
                        <select
                          value={networkListInput.priority || "0"}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "priority",
                              event.target.value,
                            )
                          }
                        >
                          <option value="0">
                            {t("configurationManagers.options.low", "Low")}
                          </option>
                          <option value="1">
                            {t("configurationManagers.options.high", "High")}
                          </option>
                        </select>
                      </label>
                      <label className="configuration-field">
                        <span>
                          {t(
                            "configurationManagers.labels.dataRateKbps",
                            "Data Rate (kbps)",
                          )}
                        </span>
                        <input
                          value={networkListInput.dataRate || ""}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "dataRate",
                              event.target.value,
                            )
                          }
                          placeholder="1000"
                          type="number"
                          min="0"
                        />
                      </label>
                      <label className="configuration-field">
                        <span>
                          {t(
                            "configurationManagers.labels.maxHopCount",
                            "Max Hop Count",
                          )}
                        </span>
                        <input
                          value={networkListInput.maxHopCount || ""}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "maxHopCount",
                              event.target.value,
                            )
                          }
                          placeholder="5"
                          type="number"
                          min="0"
                        />
                      </label>
                      <button type="button" onClick={addNetworkListEntry}>
                        {t(
                          "configurationManagers.actions.addMulticast",
                          "Add Multicast",
                        )}
                      </button>
                    </div>
                  )}

                  {(expertEditor.key === "ipMulticastBlacklist" ||
                    expertEditor.key === "ipMulticastIncomingWhitelist" ||
                    expertEditor.key === "ipMulticastIncomingBlacklist") && (
                    <div className="configuration-manager-form">
                      <label className="configuration-field">
                        <span>
                          {t(
                            "configurationManagers.labels.multicastAddress",
                            "Multicast Address",
                          )}
                        </span>
                        <input
                          value={networkListInput.address || ""}
                          onChange={(event) =>
                            updateNetworkListInput(
                              "address",
                              event.target.value,
                            )
                          }
                          placeholder="224.1.3.233"
                        />
                      </label>
                      <button type="button" onClick={addNetworkListEntry}>
                        {t(
                          "configurationManagers.actions.addAddress",
                          "Add Address",
                        )}
                      </button>
                    </div>
                  )}

                  {/* Display list entries */}
                  <div className="configuration-frequency-list">
                    {networkListRows(expertEditor.key).map((row, index) => (
                      <div key={`${expertEditor.key}-${index}`}>
                        <button type="button">
                          {formatNetworkListEntry(expertEditor.key, row)}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeNetworkListEntry(index)}
                        >
                          {t("configurationManagers.actions.remove", "Remove")}
                        </button>
                      </div>
                    ))}
                    {!networkListRows(expertEditor.key).length && (
                      <p>
                        {t(
                          "configurationManagers.empty.entries",
                          "No entries configured.",
                        )}
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Node List Manager */}
              {expertEditor.type === "nodeListManager" && (
                <>
                  <div className="configuration-frequency-add">
                    <label className="configuration-field">
                      <span>{t("configurationManagers.labels.nodeId", "Node ID")}</span>
                      <input
                        value={nodeIdInput}
                        onChange={(event) => setNodeIdInput(event.target.value)}
                        placeholder="32"
                        type="number"
                        min="0"
                        max="252"
                      />
                    </label>
                    <button type="button" onClick={addManagedNodeId}>
                      {t("configurationManagers.actions.add", "Add")}
                    </button>
                  </div>
                  <div className="configuration-frequency-list">
                    {parseNodeList(draft[expertEditor.key]).map((nodeId) => (
                      <div key={nodeId}>
                        <button type="button">
                          {t("configurationManagers.list.node", "Node {nodeId}", {
                            nodeId,
                          })}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeManagedNodeId(nodeId)}
                        >
                          {t("configurationManagers.actions.remove", "Remove")}
                        </button>
                      </div>
                    ))}
                    {!parseNodeList(draft[expertEditor.key]).length && (
                      <p>
                        {t(
                          "configurationManagers.empty.nodes",
                          "No nodes configured.",
                        )}
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Done button */}
              <div className="configuration-frequency-modal-actions">
                <button type="button" onClick={() => setExpertEditor(null)}>
                  {t("configurationManagers.actions.done", "Done")}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

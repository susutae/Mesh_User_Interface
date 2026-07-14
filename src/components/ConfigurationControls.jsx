/**
 * ConfigurationControls Component - Dynamic Configuration Form Renderer
 *
 * This component renders configuration forms based on a schema definition.
 * It supports various field types, visibility conditions, license-based
 * option filtering, and global configuration markers.
 *
 * Features:
 * - Dynamic form generation from schema definitions
 * - Multiple field types (toggle, select, text, number, slider, frequency, etc.)
 * - Conditional field visibility based on other field values
 * - License-based option filtering
 * - Global configuration key marking
 * - Section navigation with tabs
 * - Apply configuration to device
 * - Frequency and list management dialogs
 * - Antenna power management with attenuation calculation
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CHIP_LEVEL_BANDWIDTH_OPTIONS,
  GLOBAL_CONFIG_KEYS,
} from "./configurationSchema.js";
import { useI18n } from "../i18n/index.js";

/**
 * Serializes a value to a string representation.
 * Handles arrays by joining with commas.
 *
 * @param {any} value - Value to serialize
 * @returns {string} String representation
 */
export function serializeValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value == null) return "";
  return String(value);
}

/**
 * Parses a frequency list from various input formats.
 * Handles arrays and comma-separated strings.
 *
 * @param {any} value - Frequency list value
 * @returns {Array<number>} Array of valid frequency numbers
 */
export function parseFrequencyList(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  return serializeValue(value)
    .split(",")
    .map((item) => Number(item.trim()))
    .filter(Number.isFinite);
}

/**
 * Formats a frequency value from Hz to MHz with 3 decimal places.
 *
 * @param {number|string} value - Frequency in Hz
 * @returns {string} Formatted frequency string (e.g., "2400.000MHz")
 */
export function formatFrequencyMhzFromHz(value) {
  const hz = Number(value);
  return Number.isFinite(hz) ? `${(hz / 1_000_000).toFixed(3)}MHz` : "--";
}

/**
 * Gets the label for a selected frequency from the frequency list.
 *
 * @param {Object} draft - Current configuration draft
 * @param {Object} field - Field definition with listKey and defaultKey
 * @returns {string} Formatted frequency label
 */
function selectedFrequencyLabel(draft, field) {
  const list = parseFrequencyList(draft[field.listKey || "freqList"]);
  const index = Number(draft[field.defaultKey || field.key]);
  const safeIndex = Number.isFinite(index) ? index : 0;
  const selected =
    list[Math.min(Math.max(safeIndex, 0), Math.max(0, list.length - 1))];

  if (selected) return formatFrequencyMhzFromHz(selected);
  return serializeValue(draft[field.defaultKey || field.key]);
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
 * Determines if a field should be visible based on its visibleWhen condition.
 *
 * @param {Object} field - Field definition
 * @param {Object} draft - Current configuration draft
 * @returns {boolean} True if field should be visible
 */
function isVisibleField(field, draft) {
  if (
    field.minDeviceVersion &&
    !meetsMinimumVersion(draft.version, field.minDeviceVersion)
  ) {
    return false;
  }
  if (!field.visibleWhen) return true;
  const value = serializeValue(draft[field.visibleWhen.key]).toLowerCase();
  return field.visibleWhen.values
    .map((item) => String(item).toLowerCase())
    .includes(value);
}

/**
 * Checks if a value represents an enabled/true state.
 * Handles various string representations of truth.
 *
 * @param {any} value - Value to check
 * @returns {boolean} True if value is enabled
 */
function isEnabledValue(value) {
  return ["1", "true", "on", "enable", "enabled", "yes"].includes(
    serializeValue(value).toLowerCase(),
  );
}

/**
 * Determines if a select option should be visible based on license requirements.
 *
 * @param {Object} field - Field definition with optionLicenses
 * @param {string} option - Option value to check
 * @param {Object} draft - Current configuration draft
 * @returns {boolean} True if option is available
 */
function isVisibleOption(field, option, draft) {
  const licenseKey = field.optionLicenses?.[option];
  return !licenseKey || isEnabledValue(draft[licenseKey]);
}

/**
 * Returns supported bandwidth choices from the device chip level.
 *
 * @param {number|string} chipLevel - Value from /deviceinfo?content=chipLevel
 * @returns {Array<string>} Bandwidth labels supported by the current hardware
 */
function bandwidthOptionsForChipLevel(chipLevel) {
  const numericLevel = Number(chipLevel);
  if (Number.isFinite(numericLevel)) {
    const exactOptions = CHIP_LEVEL_BANDWIDTH_OPTIONS[numericLevel];
    if (exactOptions) return exactOptions;
    if (numericLevel >= 1.5) return CHIP_LEVEL_BANDWIDTH_OPTIONS[1.5];
    if (numericLevel >= 0.5) return CHIP_LEVEL_BANDWIDTH_OPTIONS[0.5];
  }
  return CHIP_LEVEL_BANDWIDTH_OPTIONS[0];
}

/**
 * Resolves dynamic field options such as chip-level bandwidth support.
 *
 * @param {Object} field - Field definition
 * @param {Object} draft - Current configuration draft
 * @returns {Array<string>} Options to render
 */
function fieldOptions(field, draft) {
  if (field.chipLevelOptions) {
    return bandwidthOptionsForChipLevel(draft.chipLevel);
  }
  return field.options || [];
}

/**
 * Safely parses JSON values with a fallback for invalid JSON.
 *
 * @param {any} value - Value to parse
 * @param {any} fallback - Fallback value if parsing fails
 * @returns {any} Parsed value or fallback
 */
function parseJsonValue(value, fallback) {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Generates a summary of a field's value for display in read-only inputs.
 *
 * @param {Object} field - Field definition
 * @param {any} value - Field value
 * @returns {string} Human-readable summary
 */
function fieldSummary(field, value) {
  if (field.type === "restrictedFrequencyManager") {
    const ranges = parseJsonValue(value, []);
    return Array.isArray(ranges)
      ? `${ranges.length} range${ranges.length === 1 ? "" : "s"}`
      : "Invalid ranges";
  }
  if (field.type === "modulationManager") {
    const formats = parseJsonValue(value, {});
    return formats && typeof formats === "object" && !Array.isArray(formats)
      ? `${Object.keys(formats).length} node override${Object.keys(formats).length === 1 ? "" : "s"}`
      : "Invalid map";
  }
  if (field.type === "nodeListManager") {
    const nodes = parseFrequencyList(value);
    return nodes.length ? nodes.join(", ") : "No nodes selected";
  }
  if (field.type === "networkListManager") {
    const rows = parseJsonValue(value, []);
    return Array.isArray(rows)
      ? `${rows.length} entr${rows.length === 1 ? "y" : "ies"}`
      : "Invalid list";
  }
  return serializeValue(value);
}

/**
 * Calculates power attenuation values from draft configuration.
 *
 * @param {Object} draft - Current configuration draft
 * @param {string} key - Key for the attenuation value
 * @returns {Object|null} Attenuation calculation result
 */
function getPowerAttenuation(draft, key) {
  const powerMax = Number(draft.powerMax);
  const powerMaxAtten = Number(draft.powerMaxAtten);
  const pwAtten = Number(draft[key]);

  if (
    !Number.isFinite(powerMax) ||
    !Number.isFinite(powerMaxAtten) ||
    !Number.isFinite(pwAtten)
  ) {
    return null;
  }

  const attenuationDb = pwAtten - powerMaxAtten;
  const outputDbm = powerMax - attenuationDb;
  const outputMw = 10 ** (outputDbm / 10);
  return { attenuationDb, outputDbm, outputMw };
}

/**
 * Formats power attenuation as a human-readable string.
 *
 * @param {Object} draft - Current configuration draft
 * @param {string} key - Key for the attenuation value
 * @returns {string} Formatted string (e.g., "25.0 dBm (5.0 dB atten)")
 */
function formatPowerAttenuation(draft, key) {
  const value = getPowerAttenuation(draft, key);
  if (!value) return "--";
  return `${value.outputDbm.toFixed(1)} dBm (${value.attenuationDb.toFixed(1)} dB atten)`;
}

/**
 * Formats power output in mW or W with appropriate units.
 *
 * @param {Object} draft - Current configuration draft
 * @param {string} key - Key for the attenuation value
 * @returns {string} Formatted power string (e.g., "1.25 W" or "500 mW")
 */
function formatPowerMw(draft, key) {
  const value = getPowerAttenuation(draft, key);
  if (!value) return "--";
  if (value.outputMw < 1) return `${(value.outputMw * 1000).toFixed(0)} uW`;
  if (value.outputMw < 1000) return `${value.outputMw.toFixed(1)} mW`;
  return `${(value.outputMw / 1000).toFixed(2)} W`;
}

/**
 * Section descriptions mapping for tooltips and metadata.
 * Provides human-readable descriptions for each configuration section.
 */
const SECTION_DESCRIPTIONS = {
  "RF Basic": "Core radio mode, frequency list, bandwidth, and range setup.",
  "RF Advance": "Licensed RF behavior, antenna output, and transmission mode.",
  "RF Expert":
    "Advanced filtering, modulation, RF switching, and node controls.",
  "Network Identity": "Mesh name, local node name, and unique node ID.",
  Addressing: "Local IP address, subnet mask, and gateway.",
  "DHCP Server": "DHCP service, forwarding, address pool, DNS, and gateway.",
  "Network Optimization":
    "Compression, heterogeneous network, DSCP, Ethernet, and resource use.",
  SNMP: "SNMP agent, trap target, keys, and reporting interval.",
  "Routing And Priority":
    "Static routes plus IP, service, DSCP, and ARP priority lists.",
  "Network Interfaces":
    "Interface mode, addressing, checksum, and gateway JSON.",
  "Broadcast Filtering": "Broadcast whitelist and blacklist policy.",
  "Multicast Filtering": "Multicast ingress and egress filter policy.",
  RS232: "Serial data mode, baudrate, parity, frame interval, IP, and ports.",
  TTL: "Serial data mode, baudrate, parity, frame interval, IP, and ports.",
  RS485: "Serial data mode, baudrate, parity, frame interval, IP, and ports.",
  GPS: "GNSS module mode and fixed fallback coordinates.",
  Audio: "Cross-network audio, codec, gain, threshold, and PTT groups.",
  Security: "Encryption mode and encryption key.",
};

/**
 * Gets the description for a section or a default fallback.
 *
 * @param {Object} section - Section object with title
 * @returns {string} Section description
 */
function configSlug(value) {
  const words = serializeValue(value)
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return words
    .map((word, index) => {
      const normalized =
        word.length > 1 && word === word.toUpperCase()
          ? word.toLowerCase()
          : word.charAt(0).toLowerCase() + word.slice(1);
      return index === 0
        ? normalized
        : normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join("");
}

function translatedSectionPart(part, t) {
  const slug = configSlug(part);
  const tabTranslation = t(`configuration.${slug}`, "");
  if (tabTranslation) return tabTranslation;
  return t(`configurationSections.${slug}.title`, part || "");
}

/**
 * Gets the translated title for a section or its schema title fallback.
 *
 * @param {Object} section - Section object with title
 * @param {Function} t - Translation function
 * @returns {string} Section title
 */
function sectionTitle(section, t) {
  if (serializeValue(section?.title).includes("/")) {
    return serializeValue(section.title)
      .split("/")
      .map((part) => translatedSectionPart(part.trim(), t))
      .join(" / ");
  }

  return t(
    `configurationSections.${configSlug(section?.title)}.title`,
    section?.title || "",
  );
}

/**
 * Gets the translated description for a section or a default fallback.
 *
 * @param {Object} section - Section object with title
 * @param {Function} t - Translation function
 * @returns {string} Section description
 */
function sectionDescription(section, t) {
  if (serializeValue(section?.title).includes("/")) {
    const [, sectionPart] = serializeValue(section.title)
      .split("/")
      .map((part) => part.trim());
    return t(
      `configurationSections.${configSlug(sectionPart)}.description`,
      section.description ||
        SECTION_DESCRIPTIONS[sectionPart] ||
        "Review and apply this configuration group.",
    );
  }

  return t(
    `configurationSections.${configSlug(section?.title)}.description`,
    SECTION_DESCRIPTIONS[section?.title] ||
      "Review and apply this configuration group.",
  );
}

function fieldLabel(field, t) {
  return t(`configurationFields.${field.id || field.key}`, field.label);
}

function fieldHint(field, t) {
  if (!field.hint) return "";
  return t(`configurationHints.${field.id || field.key}`, field.hint);
}

function groupTitle(group, t) {
  return t(`configurationGroups.${configSlug(group?.title)}`, group?.title || "");
}

function optionLabel(option, t) {
  return t(`configurationOptions.${configSlug(option)}`, option);
}

/**
 * ConfigField Component - Renders a single configuration field.
 *
 * Handles all field types with appropriate input controls:
 * - toggle: On/off switch button
 * - select: Dropdown with license-filtered options
 * - text, number, password: Standard inputs
 * - textarea, jsonEditor: Multi-line text areas
 * - slider: Range slider with value display
 * - frequency: Frequency selection with management button
 * - restrictedFrequencyManager: Restricted frequency range management
 * - modulationManager: Modulation code management
 * - nodeListManager: Node list management
 * - networkListManager: Network list management
 * - nodeList: Comma-separated node IDs
 * - powerAttenuation: Read-only power calculation display
 * - antennaPower: Antenna selection with attenuation and power display
 *
 * @param {Object} props
 * @param {Object} props.field - Field definition
 * @param {any} props.value - Current field value
 * @param {Function} props.onChange - Change handler
 * @param {Object} props.draft - Full configuration draft
 * @param {Function} props.onManageFrequency - Frequency management handler
 * @param {string} props.selectedAntenna - Currently selected antenna
 * @param {Function} props.onSelectedAntennaChange - Antenna selection handler
 * @returns {JSX.Element} Rendered field
 */
function ConfigField({
  field,
  value,
  onChange,
  draft,
  onManageFrequency,
  selectedAntenna,
  onSelectedAntennaChange,
  highlighted = false,
  modified = false,
  t,
}) {
  const normalizedValue = value ?? "";

  // Filter options based on license availability
  const visibleOptions =
    field.type === "select"
      ? fieldOptions(field, draft).filter((option) =>
          isVisibleOption(field, option, draft),
        )
      : field.options || [];

  // If current value is not in options, add it to prevent empty selection
  const selectOptions =
    field.type === "select" &&
    normalizedValue &&
    !visibleOptions.includes(normalizedValue)
      ? [normalizedValue, ...visibleOptions]
      : visibleOptions;

  const fieldId = `config-${field.id || field.key}`;
  const canApplyGlobally = GLOBAL_CONFIG_KEYS.has(field.key);
  const translatedLabel = fieldLabel(field, t);
  const translatedHint = fieldHint(field, t);

  // Common props for input elements
  const commonProps = {
    id: fieldId,
    value: normalizedValue,
    onChange: (event) => onChange(field.key, event.target.value),
  };
  const inputProps = {
    ...commonProps,
    min: field.min,
    max: field.max,
    step: field.step,
  };

  return (
    <label
      className={`configuration-field configuration-field-${field.type} ${
        highlighted ? "configuration-field-highlight" : ""
      } ${modified ? "configuration-field-modified" : ""}`}
      htmlFor={fieldId}
      data-config-field={field.id || field.key}
    >
      <span className="configuration-field-label">
        {translatedLabel}
        {canApplyGlobally && (
          <sup
            className="configuration-global-marker"
            title={t(
              "configurationControls.globalMarkerTitle",
              "Can apply to all nodes with configGlobal=true",
            )}
          >
            *
          </sup>
        )}
        {translatedHint && (
          <span
            className="configuration-hint"
            tabIndex="0"
            aria-label={translatedHint}
          >
            <i aria-hidden="true">?</i>
            <small role="tooltip">{translatedHint}</small>
          </span>
        )}
      </span>

      {/* Toggle switch */}
      {field.type === "toggle" ? (
        <span className="configuration-toggle-row">
          <em>{t("configurationControls.disable", "Disable")}</em>
          <button
            type="button"
            className={
              value === "on" || value === "true"
                ? "configuration-toggle active"
                : "configuration-toggle"
            }
            onClick={() =>
              onChange(
                field.key,
                value === "on" || value === "true" ? "off" : "on",
              )
            }
            aria-pressed={value === "on" || value === "true"}
          >
            <i />
          </button>
          <em>{t("configurationControls.enable", "Enable")}</em>
        </span>
      ) : field.type === "textarea" ? (
        <textarea {...commonProps} rows="3" />
      ) : field.type === "jsonEditor" ? (
        <textarea {...commonProps} rows={field.rows || 4} spellCheck="false" />
      ) : field.type === "nodeList" ? (
        <input
          {...commonProps}
          type="text"
          placeholder={t("configurationControls.nodeListPlaceholder", "1, 2, 255")}
        />
      ) : field.type === "restrictedFrequencyManager" ||
        field.type === "modulationManager" ||
        field.type === "nodeListManager" ||
        field.type === "networkListManager" ? (
        // Complex manager fields with summary display and management button
        <div className="configuration-frequency-row">
          <input
            id={fieldId}
            readOnly
            value={fieldSummary(field, normalizedValue)}
          />
          <button type="button" onClick={() => onManageFrequency(field)}>
            {t("configurationControls.manage", "Manage")}
          </button>
        </div>
      ) : field.type === "frequency" ? (
        // Frequency selection with list management
        <div className="configuration-frequency-row">
          <input
            id={fieldId}
            readOnly
            value={selectedFrequencyLabel(draft, field)}
          />
          <button type="button" onClick={() => onManageFrequency(field)}>
            {t("configurationControls.manage", "Manage")}
          </button>
        </div>
      ) : field.type === "powerAttenuation" ? (
        // Read-only power attenuation display
        <input
          id={fieldId}
          readOnly
          value={formatPowerAttenuation(draft, field.key)}
        />
      ) : field.type === "antennaPower" ? (
        // Antenna power management with selection
        <div className="configuration-antenna-power">
          <label>
            <span>{t("configurationControls.antenna", "Antenna")}</span>
            <select
              value={selectedAntenna}
              onChange={(event) => onSelectedAntennaChange(event.target.value)}
            >
              <option value="pwAtten1">
                {t("configurationControls.antenna1", "ANTENNA 1")}
              </option>
              <option value="pwAtten2">
                {t("configurationControls.antenna2", "ANTENNA 2")}
              </option>
            </select>
          </label>
          <label>
            <span>{t("configurationControls.attenuation", "Attenuation")}</span>
            <input
              type="number"
              value={draft[selectedAntenna] ?? ""}
              onChange={(event) =>
                onChange(selectedAntenna, event.target.value)
              }
            />
          </label>
          <label>
            <span>{t("configurationControls.power", "Power")}</span>
            <input readOnly value={formatPowerMw(draft, selectedAntenna)} />
          </label>
        </div>
      ) : field.type === "slider" ? (
        // Range slider with value display
        <div className="configuration-slider">
          <div className="configuration-slider-head">
            <span>{field.min ?? 0}</span>
            <strong>{normalizedValue || field.min || 0}</strong>
            <span>{field.max ?? 100}</span>
          </div>
          <input
            {...inputProps}
            type="range"
            value={normalizedValue || field.min || 0}
          />
        </div>
      ) : field.type === "select" ? (
        // Dropdown with license-filtered options
        <select {...commonProps}>
          {!normalizedValue && (
            <option value="">
              {t("configurationControls.loading", "Loading...")}
            </option>
          )}
          {selectOptions.map((option) => (
            <option key={option} value={option}>
              {optionLabel(option, t)}
            </option>
          ))}
        </select>
      ) : (
        // Standard input (text, number, password, etc.)
        <input {...inputProps} type={field.type} />
      )}
    </label>
  );
}

/**
 * ConfigurationControls Component
 *
 * Main component for rendering configuration controls based on schema.
 * Manages section navigation, field rendering, and apply operations.
 *
 * Props:
 * @param {string} activeTab - Currently active tab ID
 * @param {Array} sections - Array of section definitions
 * @param {Object} draft - Current configuration draft values
 * @param {Function} onChange - Field change handler
 * @param {Function} onManageFrequency - Frequency management handler
 * @param {string} selectedAntenna - Currently selected antenna
 * @param {Function} onSelectedAntennaChange - Antenna selection handler
 * @param {string} initialSectionTitle - Initial section title
 * @param {string} activeSectionTitle - Controlled active section title
 * @param {Function} onActiveSectionTitleChange - Section change handler
 * @param {boolean} showSectionTabs - Whether to show section tabs
 * @param {boolean} showAllSections - Whether to render every visible section card
 * @param {Object|null} groupedCard - Optional parent card for rendering multiple sections inside one card
 *
 * @returns {JSX.Element} Rendered configuration controls
 */
export default function ConfigurationControls({
  activeTab,
  sections,
  draft,
  onChange,
  onManageFrequency,
  selectedAntenna,
  onSelectedAntennaChange,
  initialSectionTitle,
  activeSectionTitle: controlledActiveSectionTitle,
  onActiveSectionTitleChange,
  highlightFieldId = "",
  highlightNonce,
  modifiedFieldKeys,
  showSectionTabs = true,
  showAllSections = false,
  groupedCard = null,
}) {
  const { t } = useI18n();

  // Local state for active section (if uncontrolled)
  const [localActiveSectionTitle, setLocalActiveSectionTitle] = useState(
    initialSectionTitle || sections[0]?.title || "",
  );
  const highlightTimerRef = useRef(null);

  // Filter sections to only those with visible fields
  const visibleSections = useMemo(
    () =>
      sections.filter((section) =>
        section.fields.some((field) => isVisibleField(field, draft)),
      ),
    [sections, draft],
  );

  // Determine active section (controlled or uncontrolled)
  const activeSectionTitle =
    controlledActiveSectionTitle ?? localActiveSectionTitle;
  const setActiveSectionTitle =
    onActiveSectionTitleChange ?? setLocalActiveSectionTitle;

  // Find the active section object
  const activeSection =
    visibleSections.find((section) => section.title === activeSectionTitle) ||
    visibleSections[0] ||
    sections[0];

  // Get visible fields from active section
  const activeFields =
    activeSection?.fields.filter((field) => isVisibleField(field, draft)) || [];
  const activeHighlightField = showAllSections
    ? visibleSections
        .flatMap((section) =>
          section.fields.filter((field) => isVisibleField(field, draft)),
        )
        .find((field) => (field.id || field.key) === highlightFieldId)
    : activeFields.find((field) => (field.id || field.key) === highlightFieldId);

  // Sync local state with controlled prop
  useEffect(() => {
    if (controlledActiveSectionTitle == null) {
      setLocalActiveSectionTitle(
        initialSectionTitle || sections[0]?.title || "",
      );
    }
  }, [activeTab, sections, initialSectionTitle, controlledActiveSectionTitle]);

  // Update active section title if section changes
  useEffect(() => {
    if (activeSection && activeSection.title !== activeSectionTitle) {
      setActiveSectionTitle(activeSection.title);
    }
  }, [activeSection, activeSectionTitle]);

  useEffect(() => {
    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    if (!activeHighlightField) return undefined;

    highlightTimerRef.current = window.setTimeout(() => {
      const target = document.querySelector(
        `[data-config-field="${activeHighlightField.id || activeHighlightField.key}"]`,
      );
      if (!target) return;
      target.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
      const focusTarget = target.querySelector(
        "select, input, textarea, button",
      );
      focusTarget?.focus?.({ preventScroll: true });
    }, 120);

    return () => {
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
  }, [
    activeHighlightField,
    activeSection?.title,
    highlightFieldId,
    highlightNonce,
  ]);

  function renderConfigField(field) {
    return (
      <ConfigField
        key={field.id || field.key}
        field={field}
        value={draft[field.key]}
        onChange={onChange}
        draft={draft}
        onManageFrequency={onManageFrequency}
        selectedAntenna={selectedAntenna}
        onSelectedAntennaChange={onSelectedAntennaChange}
        highlighted={(field.id || field.key) === highlightFieldId}
        modified={modifiedFieldKeys?.has(field.key)}
        t={t}
      />
    );
  }

  function renderSectionCard(section) {
    const sectionFields =
      section?.fields.filter((field) => isVisibleField(field, draft)) || [];
    const groupedFieldIds = new Set(
      (section?.layoutGroups || []).flatMap((group) => group.fields || []),
    );
    const ungroupedFields = sectionFields.filter(
      (field) => !groupedFieldIds.has(field.id || field.key),
    );

    return (
      <article
        className={`configuration-card ${section.className || ""}`}
        key={section.title}
      >
        <div className="configuration-card-title">{sectionTitle(section, t)}</div>
        <div className="configuration-card-meta">
          <p>{sectionDescription(section, t)}</p>
          <em>
            {t("configurationControls.settingsCount", "{count} settings", {
              count: sectionFields.length,
            })}
          </em>
        </div>
        <div className="configuration-card-body">
          {/* Render grouped fields when a section needs a custom logical layout. */}
          {section.layoutGroups?.length ? (
            <>
              <div className="configuration-field-columns">
                {section.layoutGroups.map((group) => {
                  const groupFields = sectionFields.filter((field) =>
                    group.fields?.includes(field.id || field.key),
                  );
                  if (!groupFields.length) return null;
                  return (
                    <section
                      className="configuration-field-group"
                      key={group.title}
                    >
                      <h3>{groupTitle(group, t)}</h3>
                      {groupFields.map(renderConfigField)}
                    </section>
                  );
                })}
              </div>
              {ungroupedFields.map(renderConfigField)}
            </>
          ) : (
            sectionFields.map(renderConfigField)
          )}
        </div>
      </article>
    );
  }

  function renderSectionBody(section) {
    const sectionFields =
      section?.fields.filter((field) => isVisibleField(field, draft)) || [];
    const groupedFieldIds = new Set(
      (section?.layoutGroups || []).flatMap((group) => group.fields || []),
    );
    const ungroupedFields = sectionFields.filter(
      (field) => !groupedFieldIds.has(field.id || field.key),
    );

    return (
      <section className="configuration-global-subsection" key={section.title}>
        <header>
          <div>
            <h3>{sectionTitle(section, t)}</h3>
            <p>{sectionDescription(section, t)}</p>
          </div>
          <em>
            {t("configurationControls.settingsCount", "{count} settings", {
              count: sectionFields.length,
            })}
          </em>
        </header>
        <div className="configuration-global-subsection-fields">
          {section.layoutGroups?.length ? (
            <>
              <div className="configuration-field-columns">
                {section.layoutGroups.map((group) => {
                  const groupFields = sectionFields.filter((field) =>
                    group.fields?.includes(field.id || field.key),
                  );
                  if (!groupFields.length) return null;
                  return (
                    <section
                      className="configuration-field-group"
                      key={group.title}
                    >
                      <h3>{groupTitle(group, t)}</h3>
                      {groupFields.map(renderConfigField)}
                    </section>
                  );
                })}
              </div>
              {ungroupedFields.map(renderConfigField)}
            </>
          ) : (
            sectionFields.map(renderConfigField)
          )}
        </div>
      </section>
    );
  }

  const sectionsToRender = showAllSections
    ? visibleSections
    : activeSection
      ? [activeSection]
      : [];

  return (
    <section className="configuration-section-panel">
      {/* Section navigation tabs */}
      {showSectionTabs && visibleSections.length > 1 && (
        <nav
          className="configuration-section-tabs breadcrumb-tabs"
          aria-label={t(
            "configurationControls.settingsPath",
            "{tab} settings path",
            { tab: activeTab },
          )}
        >
          {visibleSections.map((section) => (
            <button
              key={section.title}
              type="button"
              aria-current={
                section.title === activeSection.title ? "step" : undefined
              }
              className={section.title === activeSection.title ? "active" : ""}
              onClick={() => setActiveSectionTitle(section.title)}
            >
              <span>{sectionTitle(section, t)}</span>
            </button>
          ))}
        </nav>
      )}

      {/* Configuration cards */}
      {groupedCard ? (
        <div className="configuration-card-grid configuration-global">
          <article className="configuration-card configuration-card-global-group">
            <div className="configuration-card-title">{groupedCard.title}</div>
            <div className="configuration-card-meta">
              <p>{groupedCard.description}</p>
              <em>
                {t("configurationControls.settingsCount", "{count} settings", {
                  count: sectionsToRender.reduce(
                    (total, section) =>
                      total +
                      section.fields.filter((field) =>
                        isVisibleField(field, draft),
                      ).length,
                    0,
                  ),
                })}
              </em>
            </div>
            <div className="configuration-card-body configuration-global-card-body">
              {sectionsToRender.map(renderSectionBody)}
            </div>
          </article>
        </div>
      ) : (
        <div
          className={`configuration-card-grid configuration-${activeTab} ${
            !showAllSections ? activeSection?.gridClassName || "" : ""
          }`}
        >
          {sectionsToRender.map(renderSectionCard)}
        </div>
      )}
    </section>
  );
}

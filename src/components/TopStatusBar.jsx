import { useEffect, useMemo, useState } from "react";
import LogoMark from "./LogoMark.jsx";
import bandwidthIcon from "../assets/status-icons/bandwidth.png";
import encryptionIcon from "../assets/status-icons/encryption.png";
import frequencyIcon from "../assets/status-icons/frequency.png";
import idIcon from "../assets/status-icons/id.png";
import ipAddressIcon from "../assets/status-icons/ip-address.png";
import meshIdIcon from "../assets/status-icons/mesh_id.png";
import rangeIcon from "../assets/status-icons/range.png";
import rfModeIcon from "../assets/status-icons/rf-mode.png";
import { buildDeviceUrl, requestJson as fetchJson } from "../api/deviceApi.js";
import { useI18n } from "../i18n/index.js";

/**
 * Mock data representing network interfaces and active node count.
 * Used as a fallback if the target device is unreachable.
 */
const MOCK_STATUS = {
  nodeNumber: 2,
  devices: [
    { type: "eth0", status: 0 },
    { type: "eth1", status: 0 },
  ],
  configUpdated: false,
};

/**
 * Mock configuration profile representing mesh parameters.
 * Used as a fallback for the dashboard layout.
 */
const MOCK_CONFIG = {
  ip: "192.168.10.33",
  id: 33,
  meshName: "abcdefge",
  freqMode: "single",
  freqList: [132000000],
  freqDefault: 0,
  span: 1,
  rangeMode: "10",
  dataEncryptionMode: 2,
};

/**
 * Bandwidth lookup dictionary.
 * Maps raw span numbers to human-readable MHz bandwidth specifications.
 */
const BW = {
  0: "2.5 MHz",
  1: "5 MHz",
  2: "10 MHz",
  3: "20 MHz",
  4: "10/20 MHz",
  5: "40 MHz",
  8: "1.25 MHz",
  12: "80 MHz",
};

/**
 * Frequency Operating Mode lookup map.
 * Translates raw mode strings into user-friendly description labels.
 */
const FREQ_MODE_KEYS = {
  single: "status.fixed",
  roaming: "status.roam",
  hop: "status.freqHop",
  smart: "status.intelligentAvoidance",
  adaptiveHopping: "status.dynamicFreqHopping",
  smartAdvanced: "status.enhancedIntelligentAvoidance",
};

/**
 * Data Encryption Mode lookup dictionary.
 * Translates raw encryption modes to user-friendly description labels.
 */
const ENCRYPTION = { 0: "status.noEncryption", 1: "AES256", 2: "AES128", 3: "DES" };

/**
 * Maps device status code to CSS dot class name.
 */
function statusDot(status) {
  if (status === 1) return "online";
  if (status === 2) return "warn";
  return "";
}

/**
 * Retrieves the connection status for a specific hardware interface.
 * @param {Array} devices - List of device objects.
 * @param {string} type - Interface name (e.g. 'eth0', 'eth1').
 */
function deviceStatus(devices, type) {
  return devices.find((device) => device.type === type)?.status ?? 0;
}

/**
 * Formats the selected channel frequency to a readable MHz string.
 */
function formatFrequency(config) {
  const hz = config.freqList?.[config.freqDefault ?? 0];
  return Number.isFinite(hz) ? `${hz / 1000000} MHz` : "";
}

function statusValue(value) {
  const text = String(value ?? "").trim();
  return text && text !== "null" && text !== "undefined" && text !== "--"
    ? text
    : "—";
}

/**
 * TopStatusBar Component
 * Renders the top summary banner showing online node counters, Ethernet interface status dots,
 * and current RF/Mesh properties configured on the main device.
 */
const TILE_TARGETS = {
  ipAddress: { tab: "network", section: "Addressing", field: "ip" },
  nodeId: { tab: "network", section: "Network Identity", field: "id" },
  meshId: { tab: "network", section: "Network Identity", field: "meshName" },
  rfMode: { tab: "rf", section: "RF Basic", field: "freqMode" },
  frequency: { tab: "rf", section: "RF Basic", field: "freqDefault" },
  bandwidth: { tab: "rf", section: "RF Basic", field: "span" },
  range: { tab: "rf", section: "RF Basic", field: "rangeMode" },
  encryption: {
    tab: "security",
    section: "Security",
    field: "dataEncryptionMode",
  },
};

const TILE_ICONS = {
  ipAddress: ipAddressIcon,
  nodeId: idIcon,
  meshId: meshIdIcon,
  rfMode: rfModeIcon,
  frequency: frequencyIcon,
  bandwidth: bandwidthIcon,
  range: rangeIcon,
  encryption: encryptionIcon,
};

export default function TopStatusBar({
  deviceIp,
  pollMs = 5000,
  onConfigShortcut,
}) {
  const { t } = useI18n();
  const baseUrl = useMemo(
    () => buildDeviceUrl(deviceIp, "").replace(/\/$/, ""),
    [deviceIp],
  );
  const fallbackConfig = useMemo(
    () => ({ ...MOCK_CONFIG, ip: deviceIp || MOCK_CONFIG.ip }),
    [deviceIp],
  );
  const [status, setStatus] = useState(MOCK_STATUS);
  const [config, setConfig] = useState(fallbackConfig);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let timer;
    
    // Concurrent fetch logic pulling telemetry and settings from the hardware
    async function load() {
      try {
        const [
          nodeNumber,
          devices,
          configUpdated,
          ip,
          id,
          meshName,
          freqMode,
          freqList,
          freqDefault,
          span,
          rangeMode,
          encryption,
        ] = await Promise.all([
          fetchJson(`${baseUrl}/status?content=nodeNumber`, controller.signal),
          fetchJson(`${baseUrl}/status?content=devices`, controller.signal),
          fetchJson(
            `${baseUrl}/status?content=configUpdated`,
            controller.signal,
          ),
          fetchJson(`${baseUrl}/config?content=ip`, controller.signal),
          fetchJson(`${baseUrl}/config?content=id`, controller.signal),
          fetchJson(`${baseUrl}/config?content=meshName`, controller.signal),
          fetchJson(`${baseUrl}/config?content=freqMode`, controller.signal),
          fetchJson(`${baseUrl}/config?content=freqList`, controller.signal),
          fetchJson(`${baseUrl}/config?content=freqDefault`, controller.signal),
          fetchJson(`${baseUrl}/config?content=span`, controller.signal),
          fetchJson(`${baseUrl}/config?content=rangeMode`, controller.signal),
          fetchJson(
            `${baseUrl}/config?content=dataEncryptionMode`,
            controller.signal,
          ),
        ]);
        
        setStatus({
          nodeNumber: nodeNumber.nodeNumber ?? 0,
          devices: devices.devices ?? [],
          configUpdated: Boolean(configUpdated.configUpdated),
        });
        
        setConfig({
          ip: ip.ip ?? "",
          id: id.id ?? "",
          meshName: meshName.meshName ?? "",
          freqMode: freqMode.freqMode ?? "",
          freqList: freqList.freqList ?? [],
          freqDefault: freqDefault.freqDefault ?? 0,
          span: span.span ?? null,
          rangeMode: rangeMode.rangeMode ?? "",
          dataEncryptionMode: encryption.dataEncryptionMode ?? 0,
        });
      } catch (error) {
        if (error?.name === "AbortError") return;
        // Preserve last-known-good values while the status indicator reports
        // the connection problem instead of showing mock device data.
        setStatus({ nodeNumber: 0, devices: [], configUpdated: false });
      }
    }
    const poll = async () => {
      await load();
      if (!stopped && !controller.signal.aborted) timer = setTimeout(poll, pollMs);
    };
    poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [baseUrl, fallbackConfig, pollMs]);

  // Key-value pairs displayed in the grid below the logo bar
  const tiles = [
    { key: "ipAddress", label: t("status.ipAddress", "IP Address"), value: config.ip },
    { key: "nodeId", label: t("status.nodeId", "Node ID"), value: config.id },
    { key: "meshId", label: t("status.meshId", "Mesh ID"), value: config.meshName },
    {
      key: "rfMode",
      label: t("status.rfMode", "RF Mode"),
      value: FREQ_MODE_KEYS[config.freqMode]
        ? t(FREQ_MODE_KEYS[config.freqMode], config.freqMode)
        : config.freqMode,
    },
    { key: "frequency", label: t("status.frequency", "Frequency"), value: formatFrequency(config) },
    { key: "bandwidth", label: t("status.bandwidth", "Bandwidth"), value: BW[config.span] || "" },
    {
      key: "range",
      label: t("status.range", "Range"),
      value: String(config.rangeMode ?? "").trim()
        ? `${config.rangeMode} km`
        : "",
    },
    {
      key: "encryption",
      label: t("status.encryption", "Encryption"),
      value: ENCRYPTION[config.dataEncryptionMode]?.startsWith("status.")
        ? t(ENCRYPTION[config.dataEncryptionMode], "No Encryption")
        : ENCRYPTION[config.dataEncryptionMode] || "",
    },
  ];

  return (
    <section className="top-status-bar">
      <div className="top-row">
        <LogoMark />
        <div className="status-chip">
          <span className="dot online" />
          <strong>{status.nodeNumber} {t("status.online", "Online")}</strong>
        </div>
        <div className="status-chip">
          <span
            className={`dot ${statusDot(deviceStatus(status.devices, "eth0"))}`}
          />
          <strong>{t("status.eth0", "Eth 0")}</strong>
        </div>
        <div className="status-chip">
          <span
            className={`dot ${statusDot(deviceStatus(status.devices, "eth1"))}`}
          />
          <strong>{t("status.eth1", "Eth 1")}</strong>
        </div>
        <div className="status-chip">
          <span className={`dot ${status.configUpdated ? "warn" : ""}`} />
          <strong>{t("status.update", "Update")}</strong>
        </div>
      </div>
      <div className="status-grid">
        {tiles.map(({ key, label, value }) => {
          const target = TILE_TARGETS[key];

          return (
            <button
              className="info-tile"
              key={key}
              type="button"
              onClick={() => onConfigShortcut?.(target)}
              title={
                t("status.openConfiguration", "Open {label} configuration", {
                  label,
                })
              }
            >
              <img
                className="info-tile-icon"
                src={TILE_ICONS[key]}
                alt=""
                aria-hidden="true"
              />
              <span>{label}</span>
              <strong className={statusValue(value) === "—" ? "is-empty" : ""}>
                {statusValue(value)}
              </strong>
            </button>
          );
        })}
      </div>
    </section>
  );
}

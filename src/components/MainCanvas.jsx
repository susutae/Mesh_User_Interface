/**
 * MainCanvas Component - Mesh Network Topology Visualizer
 *
 * This component provides a real-time visualization of a mesh network topology,
 * displaying nodes as interactive elements on a canvas with link quality indicators.
 * It handles data fetching, state management, and rendering of the network graph.
 *
 * Features:
 * - Real-time polling of network status
 * - Interactive node selection and information display
 * - Link quality visualization with color-coded SNR bands
 * - Node search and filtering
 * - Dual view modes: Topology graph and SNR matrix
 * - Responsive layout with adjustable panels
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestJson as fetchJson } from "../api/deviceApi.js";
import { useI18n } from "../i18n/index.js";

/**
 * SNR_BANDS: Defines quality thresholds for Signal-to-Noise Ratio visual links.
 * Used to classify connection quality across the mesh nodes.
 * Each band includes a label, SNR range, and associated color.
 */
const SNR_BANDS = [
  { labelKey: "monitor.excellent", fallback: "Excellent", range: "≥ 27 dB", color: "#48B9D3" },
  { labelKey: "monitor.good", fallback: "Good", range: "13–26 dB", color: "#4ade80" },
  { labelKey: "monitor.average", fallback: "Average", range: "8–12 dB", color: "#facc15" },
  { labelKey: "monitor.fair", fallback: "Fair", range: "3–7 dB", color: "#fb923c" },
  { labelKey: "monitor.poor", fallback: "Poor", range: "≤ 2 dB", color: "#fb7185" },
];

const HETEROGENEOUS_GROUP_COLORS = [
  "#f59e0b",
  "#f472b6",
  "#38bdf8",
  "#a78bfa",
  "#14b8a6",
  "#fb7185",
  "#84cc16",
  "#c084fc",
];

// Fallback color for missing or disconnected links (-10 dB indicates no link)
const EMPTY_COLOR = "rgba(148, 163, 184, 0.26)";

// Default SVG node radius in pixels
const NODE_RADIUS = 22;

/**
 * Reads a stored boolean preference from localStorage.
 * Used for persisting UI state (panel visibility) across sessions.
 * Defaults keep both helper panels visible on first load.
 *
 * @param {string} key - localStorage key to read
 * @param {boolean} fallback - Default value if no stored value exists
 * @returns {boolean} The stored or fallback value
 */
function readStoredToggle(key, fallback) {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(key);
  if (stored === null) return fallback;
  return stored === "true";
}

/**
 * Standard GET request wrapper with AbortSignal support and JSON extraction.
 * Handles error cases and provides a consistent API for data fetching.
 *
 * @param {string} url - API endpoint URL to call
 * @param {AbortSignal} [signal] - Optional signal to cancel request on component unmount
 * @returns {Promise<any>} Parsed JSON response
 * @throws {Error} If the request fails or returns non-OK status
 */
/**
 * Validates and normalises the target device IP and protocol.
 * Ensures a correct base URL format without trailing slashes.
 *
 * @param {string} deviceIp - User input IP address or URL (may include protocol)
 * @param {string} protocol - Selected connection protocol (http or https)
 * @returns {string} Normalised base URL without trailing slash
 */
function normaliseUrl(deviceIp, protocol) {
  if (!deviceIp) return "";
  return /^https?:\/\//i.test(deviceIp)
    ? deviceIp.replace(/\/$/, "")
    : `${protocol}://${deviceIp}`.replace(/\/$/, "");
}

/**
 * Selects the appropriate color for a given SNR decibel level.
 * Maps SNR values to visual colors based on quality thresholds.
 *
 * @param {number|string} snr - Decibel value representing link strength
 * @returns {string} CSS color string for the SNR value
 */
function snrColor(snr) {
  const value = Number(snr);
  if (!Number.isFinite(value) || value === -10) return EMPTY_COLOR;
  if (value >= 27) return "#48B9D3";
  if (value >= 13) return "#4ade80";
  if (value >= 8) return "#facc15";
  if (value >= 3) return "#fb923c";
  return "#fb7185";
}

/**
 * Returns the text quality label matching the SNR color threshold.
 *
 * @param {number|string} snr - Decibel value representing link strength
 * @returns {string} Human-readable quality label
 */
function snrLabel(snr) {
  const value = Number(snr);
  if (!Number.isFinite(value) || value === -10) return "No link";
  if (value >= 27) return "Excellent";
  if (value >= 13) return "Good";
  if (value >= 8) return "Average";
  if (value >= 3) return "Fair";
  return "Poor";
}

function snrLabelKey(label) {
  return `monitor.${String(label)
    .replace(/\s+/g, "")
    .replace(/^./, (char) => char.toLowerCase())}`;
}

/**
 * Normalises heterogeneous link node groups from status API responses.
 * Each nested array represents node IDs that share a heterogeneous link group.
 *
 * @param {any} response - API payload from /status?content=heterogenousLinkNodes
 * @returns {Array<Array<string>>} Cleaned node ID groups
 */
function parseHeterogeneousLinkGroups(response) {
  let payload = response;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }

  const groups = Array.isArray(payload)
    ? payload
    : payload?.heterogeneousLinkNodes ||
      payload?.heterogenousLinkNodes ||
      payload?.heterogeneousLinkNode ||
      payload?.heterogenousLinkNode ||
      payload?.heterogeneousLinks ||
      payload?.heterogenousLinks ||
      [];
  if (!Array.isArray(groups)) return [];
  return groups
    .map((group) =>
      Array.isArray(group)
        ? group
            .map((nodeId) => String(nodeId).trim())
            .filter((nodeId) => nodeId.length > 0)
        : [],
    )
    .filter((group) => group.length > 1);
}

/**
 * Reads heterogeneous link groups with both accepted content spellings.
 *
 * @param {string} baseUrl - Base API URL
 * @param {AbortSignal} signal - Abort signal
 * @returns {Promise<Array<Array<string>>>} Normalised heterogeneous node groups
 */
async function fetchHeterogeneousLinkGroups(baseUrl, signal) {
  const contentNames = ["heterogenousLinkNodes", "heterogeneousLinkNodes"];
  for (const contentName of contentNames) {
    try {
      const result = await fetchJson(
        `${baseUrl}/status?content=${contentName}`,
        signal,
      );
      const groups = parseHeterogeneousLinkGroups(result);
      if (groups.length) return groups;
    } catch {
      // Older firmware may not support this status endpoint.
    }
  }
  return [];
}

/**
 * Formats a raw number with custom decimal places and local formatting.
 * Handles invalid values gracefully with a fallback string.
 *
 * @param {number|string} value - Number to format
 * @param {number} decimals - Maximum decimal places
 * @param {string} fallback - String returned if value is invalid
 * @returns {string} Formatted number or fallback
 */
function formatNumber(value, decimals = 0, fallback = "--") {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return number.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formats geographical coordinates (latitude/longitude) to 5 decimal places.
 *
 * @param {number|string} value - Coordinate value to format
 * @returns {string} Formatted coordinate or "--" if invalid
 */
function formatCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(5) : "--";
}

/**
 * Calculates Mbps based on bytes transferred and time elapsed.
 * Formula: (Bytes * 8 bits/byte) / (Milliseconds / 1000 ms/sec) / 1,000,000 bits/Mbit
 * Simplified to: (Bytes * 8) / milliseconds / 1000
 *
 * @param {number} bytesDelta - Difference in byte counter (positive)
 * @param {number} elapsedMs - Time difference in milliseconds (positive)
 * @returns {number} Data rate in Mbps
 */
function toMbps(bytesDelta, elapsedMs) {
  if (bytesDelta < 0 || elapsedMs <= 0) return 0;
  return (bytesDelta * 8) / elapsedMs / 1000;
}

/**
 * Formats data rate values to a readable Mbps string.
 *
 * @param {number} value - Data rate in Mbps
 * @returns {string} Formatted string with "Mbps" suffix
 */
function formatMbps(value) {
  return `${formatNumber(value, 2, "0.00")} Mbps`;
}

/**
 * Formats raw temperature values into a Celsius string representation.
 *
 * @param {number|string} value - Temperature value
 * @returns {string} Formatted temperature with "C" suffix or "--"
 */
function formatTemperature(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)} C` : "--";
}

/**
 * Converts propagation delay in nanoseconds to distance in kilometers.
 * Uses the speed of light: distance = delay * c, where c = 299,792.458 km/s.
 * The delay value is scaled to match telemetry format.
 *
 * @param {number|string} delay - Path delay value in nanoseconds (scaled format)
 * @returns {number|null} Distance in kilometers or null if invalid
 */
function delayToKm(delay) {
  const numericDelay = Number(delay);
  if (!Number.isFinite(numericDelay)) return null;
  return (numericDelay / 100000000) * 299792.458;
}

/**
 * Computes layout positions (X, Y) for mesh nodes on the 2D canvas screen.
 * Implements a smart Concentric Ring system to distribute nodes neatly.
 *
 * - For low counts (<= 12): Nodes are distributed in one outer ring
 * - For high counts (> 12, max 32): Nodes are split into inner and outer rings
 *   to prevent overlap and optimize visual space
 *
 * @param {Array} nodes - List of active mesh nodes
 * @param {number} width - Current width of the SVG canvas
 * @param {number} height - Current height of the SVG canvas
 * @returns {Object} Mapping of node IDs to coordinate objects {x, y}
 */
function getPositions(nodes, width, height) {
  if (!nodes.length) return {};

  const result = {};
  // Calculate safe margins to avoid overlapping with UI elements
  const safeTop = width < 520 ? 190 : width < 780 ? 150 : 112; // Avoid header controls on smaller screens
  const safeBottom = 104; // Bottom offset to avoid legends/footers
  const usableWidth = Math.max(200, width - 180);
  const usableHeight = Math.max(180, height - safeTop - safeBottom);
  const centerX = width / 2;
  const centerY = safeTop + usableHeight / 2;

  // Single-node exception: center it directly
  if (nodes.length === 1) {
    result[nodes[0].id] = { x: centerX, y: centerY };
    return result;
  }

  const outerRadius = Math.max(
    95,
    Math.min(usableWidth / 2 - 64, usableHeight / 2 - 34),
  );

  // Single ring layout for <= 12 nodes (circular distribution)
  if (nodes.length <= 12) {
    nodes.forEach((node, index) => {
      const angle = -Math.PI / 2 + (index / nodes.length) * Math.PI * 2;
      result[node.id] = {
        x: centerX + outerRadius * Math.cos(angle),
        y: centerY + outerRadius * Math.sin(angle),
      };
    });
    return result;
  }

  // Double ring layout for > 12 nodes (concentric circles)
  // Inner ring: ~34% of nodes, Outer ring: remaining nodes
  const innerCount = Math.min(10, Math.ceil(nodes.length * 0.34));
  const rings = [
    {
      nodes: nodes.slice(0, innerCount),
      radius: outerRadius * 0.46,
      offset: -Math.PI / 2,
    },
    {
      nodes: nodes.slice(innerCount),
      radius: outerRadius,
      offset: -Math.PI / 2 + Math.PI / Math.max(1, nodes.length - innerCount),
    },
  ];

  rings.forEach((ring) => {
    ring.nodes.forEach((node, index) => {
      const angle = ring.offset + (index / ring.nodes.length) * Math.PI * 2;
      result[node.id] = {
        x: centerX + ring.radius * Math.cos(angle),
        y: centerY + ring.radius * Math.sin(angle),
      };
    });
  });

  return result;
}

/**
 * Dynamic sizing adjustments for node circles based on total count
 * to avoid cluttering in dense networks.
 *
 * @param {number} count - Total number of nodes
 * @returns {number} Appropriate node radius in pixels
 */
function nodeRadiusForCount(count) {
  if (count > 24) return 15;
  if (count > 12) return 18;
  return NODE_RADIUS;
}

/**
 * Sizing of the hover/selection outline circle around nodes.
 *
 * @param {number} count - Total number of nodes
 * @returns {number} Selection ring radius in pixels
 */
function selectedRadiusForCount(count) {
  return nodeRadiusForCount(count) + 8;
}

/**
 * Adjust font size depending on node density.
 * Smaller fonts for dense networks to prevent overlap.
 *
 * @param {number} count - Total number of nodes
 * @returns {string} CSS font-size value
 */
function nodeFontForCount(count) {
  if (count > 24) return "10px";
  if (count > 12) return "11px";
  return "var(--topology-value-font)";
}

/**
 * Text label Y-offset positioning relative to node center.
 * Positions labels above nodes with density-aware spacing.
 *
 * @param {number} count - Total number of nodes
 * @returns {number} Y-offset in pixels (negative = above)
 */
function nodeLabelOffsetForCount(count) {
  if (count > 24) return -27;
  if (count > 12) return -30;
  return -34;
}

/**
 * Node label font sizing with density awareness.
 *
 * @param {number} count - Total number of nodes
 * @returns {string} CSS font-size value
 */
function nodeLabelFontForCount(count) {
  if (count > 24) return "9.5px";
  if (count > 12) return "10.5px";
  return "var(--topology-small-font)";
}

/**
 * Generates an SVG curved path definition (Q command) connecting two nodes.
 * Creates an offset bend to separate bidirectional traffic links (A->B and B->A).
 *
 * @param {Object} from - Start node coordinates {x, y}
 * @param {Object} to - End node coordinates {x, y}
 * @param {number} direction - Control parameter to bend path left (1) or right (-1)
 * @param {number} nodeRadius - Current radius of node to start/end path on the circle border
 * @returns {Object} SVG path string "d" and label positioning center
 */
function edgePath(from, to, direction, nodeRadius = NODE_RADIUS) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / distance; // Unit vector X (direction from from to to)
  const uy = dy / distance; // Unit vector Y
  const nx = -uy; // Normal vector X (perpendicular to direction)
  const ny = ux; // Normal vector Y
  const bend = Math.min(34, Math.max(17, distance * 0.11)) * direction;

  // Start and end points are on the node borders (not center)
  const start = { x: from.x + ux * nodeRadius, y: from.y + uy * nodeRadius };
  const end = { x: to.x - ux * nodeRadius, y: to.y - uy * nodeRadius };
  // Control point for quadratic bezier curve
  const control = {
    x: (start.x + end.x) / 2 + nx * bend,
    y: (start.y + end.y) / 2 + ny * bend,
  };

  return {
    d: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    label: {
      x: (start.x + 2 * control.x + end.x) / 4,
      y: (start.y + 2 * control.y + end.y) / 4,
    },
  };
}

/**
 * Metric Component - Displays a single labeled metric value.
 * Used within the details card for structured data display.
 *
 * @param {Object} props
 * @param {string} props.label - Metric label (uppercase, muted styling)
 * @param {string|number} props.value - Metric value (prominent styling)
 * @param {boolean} [props.accent=false] - Whether to use accent color for value
 */
function Metric({ label, value, accent = false }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          color: "var(--muted)",
          fontSize: "var(--topology-label-font)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontWeight: 650,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          color: accent ? "var(--accent-strong)" : "var(--text)",
          fontSize: "var(--topology-value-font)",
          fontWeight: 650,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Panel Component - Styled container with consistent appearance.
 * Provides a themed panel with background, border, and shadow.
 */
function Panel({ children, className, style }) {
  return (
    <div
      className={className}
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--panel-shadow)",
        borderRadius: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * NodeList Component - Side panel for node management and selection.
 *
 * Features:
 * - Shows all online nodes with search functionality
 * - Checkbox toggles for displaying/hiding nodes on the topology
 * - Quick select: Click a node to view its details
 * - Resource utilization bar visualization
 * - "All" / "None" buttons for bulk display management
 */
function NodeList({
  nodes,
  onlineCount,
  selectedId,
  displayedNodeIds,
  query,
  setQuery,
  onSelect,
  onToggleDisplay,
  onShowAll,
  onHideAll,
  t,
}) {
  const searchText = query.trim();
  const resultCount = nodes.length;
  const shownCount = displayedNodeIds.size;
  const searchQueryText = searchText ? ` for "${searchText}"` : "";

  return (
    <Panel
      className="topology-node-list-panel"
      style={{
        padding: "var(--topology-panel-padding)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {/* Header: Title, online count, and status indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--topology-card-gap)",
        }}
      >
        <div>
          <div
            style={{
              color: "var(--text)",
              fontSize: "var(--topology-heading-font)",
              fontWeight: 700,
            }}
          >
            {t("monitor.nodesOnline", "Nodes online")}
          </div>
          <div
            style={{
              color: "var(--muted)",
              fontSize: "var(--topology-small-font)",
              fontWeight: 500,
              marginTop: 2,
            }}
          >
            {t("monitor.onlineShown", "{online} online • {shown} shown on topology", {
              online: onlineCount,
              shown: shownCount,
            })}
          </div>
        </div>
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 99,
            background: "#4ade80",
            boxShadow: "0 0 15px #4ade80",
          }}
        />
      </div>

      {/* Helper text explaining checkbox functionality */}
      <div
        style={{
          display: "grid",
          gap: 3,
          marginBottom: "var(--topology-card-gap)",
          color: "var(--muted)",
          fontSize: "var(--topology-small-font)",
          fontWeight: 550,
          lineHeight: 1.25,
        }}
      >
        <span>
          {t(
            "monitor.displaySelector",
            "Display selector: checked nodes are drawn on the topology canvas.",
          )}
        </span>
        <span>
          {t("monitor.showingResults", "Showing {count} search result{plural}{query}", {
            count: resultCount,
            plural: resultCount === 1 ? "" : "s",
            query: searchQueryText,
          })}
          .
        </span>
      </div>

      {/* Search input with "S" prefix icon */}
      <div
        style={{
          position: "relative",
          marginBottom: "var(--topology-card-gap)",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "calc((var(--topology-input-height) - var(--topology-value-font)) / 2)",
            left: 11,
            color: "var(--muted)",
            fontSize: "var(--topology-value-font)",
          }}
        >
          S
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("monitor.searchPlaceholder", "Search ID, name, or IP")}
          aria-label={t("monitor.searchNodes", "Search nodes")}
          style={{
            boxSizing: "border-box",
            width: "100%",
            height: "var(--topology-input-height)",
            padding: "0 10px 0 31px",
            borderRadius: 8,
            border: "1px solid var(--border-subtle)",
            background: "var(--input-bg)",
            color: "var(--text)",
            outline: "none",
          }}
        />
      </div>

      {/* Bulk display control buttons */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--topology-card-gap)",
          marginBottom: "var(--topology-card-gap)",
        }}
      >
        <button
          type="button"
          onClick={onShowAll}
          style={{
            cursor: "pointer",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            background: "var(--button-bg)",
            color: "var(--button-text)",
            height: 30,
            fontSize: "var(--topology-small-font)",
            fontWeight: 700,
          }}
        >
          {t("monitor.all", "All")}
        </button>
        <button
          type="button"
          onClick={onHideAll}
          style={{
            cursor: "pointer",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            background: "var(--panel)",
            color: "var(--button-text)",
            height: 30,
            fontSize: "var(--topology-small-font)",
            fontWeight: 700,
          }}
        >
          {t("monitor.none", "None")}
        </button>
      </div>

      {/* Scrollable list of node cards */}
      <div
        className="topology-node-card-list"
        style={{
          overflowY: "auto",
          display: "grid",
          gap: "var(--topology-card-gap)",
          paddingRight: 2,
        }}
      >
        {nodes.map((node) => {
          const selected = node.id === selectedId;
          const displayed = displayedNodeIds.has(node.id);
          const utilisation = Math.max(
            0,
            Math.min(1, Number(node.resourceRatio) || 0),
          );
          return (
            <button
              type="button"
              key={node.id}
              onClick={() => onSelect(node.id)}
              style={{
                appearance: "none",
                width: "100%",
                cursor: "pointer",
                textAlign: "left",
                borderRadius: 8,
                border: selected
                  ? "1px solid #48B9D3"
                  : "1px solid rgba(148, 163, 184, 0.10)",
                background: "rgba(255,255,255,0.025)",
                color: "var(--text)",
                padding: "var(--topology-card-padding)",
              }}
            >
              {/* Node card header: ID, selected badge, and display checkbox */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      color: "var(--muted)",
                      fontSize: "var(--topology-label-font)",
                      fontWeight: 800,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {t("monitor.id", "ID")}
                  </div>
                  <div
                    style={{
                      fontWeight: 750,
                      fontSize: "var(--topology-value-font)",
                    }}
                  >
                    #{node.id}
                  </div>
                </div>
                {selected && (
                  <span
                    style={{
                      marginLeft: "auto",
                      borderRadius: 999,
                      background: "rgba(72, 185, 211, .16)",
                      color: "var(--accent-strong)",
                      padding: "3px 7px",
                      fontSize: "var(--topology-small-font)",
                      fontWeight: 750,
                    }}
                  >
                    {t("monitor.selected", "Selected")}
                  </span>
                )}
                <label
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    color: displayed ? "var(--accent-soft)" : "var(--muted)",
                    cursor: "pointer",
                    fontSize: "var(--topology-small-font)",
                    fontWeight: 650,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={displayed}
                    onChange={() => onToggleDisplay(node.id)}
                    aria-label={t("monitor.displayNode", "Display {name} in topology", {
                      name: node.name,
                    })}
                    style={{ margin: 0 }}
                  />
                  {t("monitor.show", "Show")}
                </label>
              </div>

              {/* Node details: Name, IP, Resource utilization */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: "var(--topology-card-gap)",
                  marginTop: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: "var(--muted)",
                      fontSize: "var(--topology-label-font)",
                      fontWeight: 800,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {t("monitor.name", "Name")}
                  </div>
                  <div
                    style={{
                      overflow: "hidden",
                      color: "var(--text)",
                      fontSize: "var(--topology-value-font)",
                      fontWeight: 650,
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {node.name}
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: "var(--muted)",
                      fontSize: "var(--topology-label-font)",
                      fontWeight: 800,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {t("monitor.ip", "IP")}
                  </div>
                  <div
                    style={{
                      color: "var(--text)",
                      fontSize: "var(--topology-value-font)",
                      fontWeight: 650,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {node.ip || t("monitor.unavailable", "Unavailable")}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      color: "var(--muted)",
                      fontSize: "var(--topology-label-font)",
                      fontWeight: 800,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {t("monitor.resource", "Resource")}
                  </div>
                  <div
                    style={{
                      color: "var(--text)",
                      fontSize: "var(--topology-value-font)",
                      fontWeight: 650,
                    }}
                  >
                    {Math.round(utilisation * 100)}%
                  </div>
                </div>
              </div>

              {/* Resource utilization bar */}
              <div
                style={{
                  height: 3,
                  background: "rgba(148,163,184,0.16)",
                  borderRadius: 99,
                  marginTop: 9,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${utilisation * 100}%`,
                    borderRadius: 99,
                    background: utilisation > 0.8 ? "#fb923c" : "#48B9D3",
                  }}
                />
              </div>
            </button>
          );
        })}
        {!nodes.length && (
          <div
            style={{
              color: "var(--muted)",
              textAlign: "center",
              fontSize: "var(--topology-value-font)",
              fontWeight: 500,
              padding:
                "calc(var(--topology-panel-padding) * 1.8) var(--topology-card-padding)",
            }}
          >
            {t("monitor.noMatchingNodes", "No matching nodes")}
          </div>
        )}
      </div>
    </Panel>
  );
}

/**
 * TopologyMatrix Component - SNR matrix table view.
 *
 * Displays link quality as a directional matrix where:
 * - Rows = source (TX) nodes
 * - Columns = destination (RX) nodes
 * - Values = SNR in dB
 *
 * Features:
 * - Color-coded cells based on SNR quality
 * - Click on a cell to view detailed link information
 * - Self-reference cells are disabled
 * - Shows both forward and reverse SNR values
 */
function TopologyMatrix({ nodes, linkQuality, nodeIndexes, t }) {
  const [selectedCell, setSelectedCell] = useState(null);
  const selectedFromNode = selectedCell?.fromNode;
  const selectedToNode = selectedCell?.toNode;
  const selectedSnr = selectedCell?.snr;
  const selectedReverseSnr = selectedCell?.reverseSnr;
  const selectedQuality = t(snrLabelKey(snrLabel(selectedSnr)), snrLabel(selectedSnr));
  const selectedReverseQuality = t(
    snrLabelKey(snrLabel(selectedReverseSnr)),
    snrLabel(selectedReverseSnr),
  );
  const selectedColor = snrColor(selectedSnr);

  return (
    <div
      className="topology-matrix-wrap"
      role="region"
      aria-label={t("monitor.matrixTable", "SNR matrix table")}
    >
      <div className="topology-matrix-reference">
        {t(
          "monitor.matrixReference",
          "Rows = source node, columns = destination node, values = SNR dB",
        )}
      </div>
      <table className="topology-matrix">
        <thead>
          <tr>
            <th scope="col" className="topology-matrix-corner">
              {t("monitor.txRxSnr", "Tx/Rx")}
            </th>
            {nodes.map((node) => (
              <th key={node.id} scope="col" title={node.name}>
                #{node.id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nodes.map((fromNode, rowIndex) => (
            <tr key={fromNode.id}>
              <th scope="row" title={fromNode.name}>
                #{fromNode.id}
              </th>
              {nodes.map((toNode, columnIndex) => {
                const self = fromNode.id === toNode.id;
                const fromIndex = nodeIndexes[fromNode.id] ?? rowIndex;
                const toIndex = nodeIndexes[toNode.id] ?? columnIndex;
                const snr = linkQuality?.[fromIndex]?.[toIndex];
                const reverseSnr = linkQuality?.[toIndex]?.[fromIndex];
                const color = self ? "var(--border-subtle)" : snrColor(snr);
                const label = self
                  ? t("monitor.self", "Self")
                  : t(snrLabelKey(snrLabel(snr)), snrLabel(snr));
                const active =
                  !self && snr !== undefined && Number(snr) !== -10;
                const selected =
                  selectedCell?.fromNode?.id === fromNode.id &&
                  selectedCell?.toNode?.id === toNode.id;

                return (
                  <td key={toNode.id}>
                    <button
                      type="button"
                      className={`topology-matrix-cell ${
                        active ? "is-active" : ""
                      } ${self ? "is-self" : ""} ${selected ? "is-selected" : ""}`}
                      style={{
                        "--cell-accent": color,
                      }}
                      disabled={self}
                      onClick={() =>
                        setSelectedCell({
                          fromNode,
                          toNode,
                          snr,
                          reverseSnr,
                          active,
                        })
                      }
                      aria-label={`${fromNode.name} to ${toNode.name}: ${label}${
                        active ? `, ${snr} dB` : ""
                      }`}
                      title={`${fromNode.name} to ${toNode.name}: ${label}${
                        active ? ` (${snr} dB)` : ""
                      }`}
                    >
                      <span className="topology-matrix-value">
                        {self ? "-" : active ? snr : "-10"}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {!nodes.length && (
        <div className="topology-matrix-empty">
          {t("monitor.noNodesAvailable", "No nodes available")}
        </div>
      )}

      {/* Link detail popover - shows detailed information about the selected link */}
      {selectedCell && selectedFromNode && selectedToNode && (
        <aside className="topology-matrix-detail">
          <button
            type="button"
            aria-label={t("monitor.closeMatrixDetail", "Close matrix link detail")}
            onClick={() => setSelectedCell(null)}
          >
            x
          </button>
          <span>{t("monitor.linkDetail", "Link Detail")}</span>
          <strong>
            {`node${selectedFromNode.id} -> node${selectedToNode.id}`}
          </strong>
          <dl>
            <div>
              <dt>{t("monitor.txNode", "TX Node")}</dt>
              <dd>
                {selectedFromNode.name || `node${selectedFromNode.id}`} #
                {selectedFromNode.id}
              </dd>
            </div>
            <div>
              <dt>{t("monitor.rxNode", "RX Node")}</dt>
              <dd>
                {selectedToNode.name || `node${selectedToNode.id}`} #
                {selectedToNode.id}
              </dd>
            </div>
            <div>
              <dt>{t("monitor.txRxSnr", "TX/RX SNR")}</dt>
              <dd style={{ color: selectedColor }}>
                {Number.isFinite(Number(selectedSnr))
                  ? `${selectedSnr} dB`
                  : "--"}
              </dd>
            </div>
            <div>
              <dt>{t("monitor.linkQuality", "Link Quality")}</dt>
              <dd style={{ color: selectedColor }}>{selectedQuality}</dd>
            </div>
            <div>
              <dt>{t("monitor.reverseSnr", "Reverse SNR")}</dt>
              <dd>
                {Number.isFinite(Number(selectedReverseSnr))
                  ? `${selectedReverseSnr} dB (${selectedReverseQuality})`
                  : "--"}
              </dd>
            </div>
          </dl>
        </aside>
      )}
    </div>
  );
}

/**
 * DetailsCard Component - Detailed node information panel.
 *
 * Displays comprehensive information about a selected node including:
 * - Identity: Node ID, name, IP address, resource usage
 * - Telemetry: GPS coordinates, altitude, temperature, data rates
 * - Incoming links: List of all active connections to this node with SNR and distance
 *
 * This panel appears as a popover overlay on the topology canvas.
 */
function DetailsCard({
  node,
  incomingLinks,
  heterogeneousLink,
  temperature,
  rxMbps,
  txMbps,
  pinned,
  onTogglePinned,
  onClose,
  t,
}) {
  if (!node) return null;

  return (
    <Panel
      className="node-detail-card"
      style={{
        width: "var(--topology-detail-width)",
        maxHeight: "min(var(--topology-detail-max-height), 100%)",
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr)",
        overflow: "hidden",
      }}
    >
      {/* Header with accent color and close button */}
      <div
        style={{
          padding:
            "calc(var(--topology-card-padding) * 1) calc(var(--topology-card-padding) * 1.15)",
          background: "#48B9D3",
          color: "#06202b",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: "var(--topology-value-font)",
            fontWeight: 750,
            letterSpacing: "0.04em",
          }}
        >
          {t("monitor.nodeInformation", "NODE INFORMATION")}
        </div>
        <div className="node-detail-header-actions">
          <button
            type="button"
            aria-pressed={pinned}
            aria-label={
              pinned
                ? t("monitor.unpinNodeInformation", "Unpin node information")
                : t("monitor.pinNodeInformation", "Pin node information")
            }
            title={
              pinned
                ? t("monitor.unpinNodeInformation", "Unpin node information")
                : t("monitor.pinNodeInformation", "Pin node information")
            }
            onClick={onTogglePinned}
            className={pinned ? "node-detail-pin active" : "node-detail-pin"}
          >
            {pinned
              ? t("monitor.pinned", "Pinned")
              : t("monitor.pin", "Pin")}
          </button>
          <button
            type="button"
            aria-label={t("monitor.closeNodeInformation", "Close node information")}
            onClick={onClose}
            className="node-detail-close"
          >
            x
          </button>
        </div>
      </div>

      {/* Scrollable content area */}
      <div
        style={{
          minHeight: 0,
          overflowY: "auto",
          padding: "var(--topology-panel-padding)",
        }}
      >
        <SectionTitle>{t("monitor.identity", "IDENTITY")}</SectionTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "var(--topology-detail-grid)",
            gap: "var(--topology-metric-gap)",
            marginTop: 10,
          }}
        >
          <Metric label={t("monitor.nodeId", "Node ID")} value={`#${node.id}`} accent />
          <Metric label={t("monitor.nodeName", "Node name")} value={node.name} />
          <Metric label={t("monitor.ipAddress", "IP address")} value={node.ip || "--"} />
          <Metric
            label={t("monitor.resourceUse", "Resource use")}
            value={`${Math.round((Number(node.resourceRatio) || 0) * 100)}%`}
          />
        </div>

        <Divider />
        <SectionTitle>{t("monitor.telemetry", "TELEMETRY")}</SectionTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "var(--topology-detail-grid)",
            gap: "var(--topology-metric-gap)",
            marginTop: 10,
          }}
        >
          <Metric label={t("monitor.latitude", "Latitude")} value={formatCoordinate(node.latitude)} />
          <Metric label={t("monitor.longitude", "Longitude")} value={formatCoordinate(node.longitude)} />
          <Metric
            label={t("monitor.altitude", "Altitude")}
            value={
              Number.isFinite(Number(node.altitude))
                ? `${formatNumber(node.altitude)} m`
                : "--"
            }
          />
          <Metric
            label={t("monitor.fpgaTemperature", "FPGA temperature")}
            value={formatTemperature(temperature)}
          />
          <Metric label={t("monitor.deviceReceive", "Device receive")} value={formatMbps(rxMbps)} />
          <Metric label={t("monitor.deviceTransmit", "Device transmit")} value={formatMbps(txMbps)} />
        </div>

        <Divider />
        <SectionTitle>
          {t("monitor.heterogeneousLink", "HETEROGENEOUS LINK")}
        </SectionTitle>
        <div className="node-heterogeneous-detail">
          {heterogeneousLink ? (
            <>
              <div className="node-heterogeneous-summary">
                <span
                  className="node-heterogeneous-dot"
                  style={{ background: heterogeneousLink.color }}
                  aria-hidden="true"
                />
                <div>
                  <strong>
                    {t("monitor.group", "Group {group}", {
                      group: heterogeneousLink.groupIndex + 1,
                    })}
                  </strong>
                  <span>
                    {heterogeneousLink.relatedNodes.length
                      ? t("monitor.relatedNodeCount", "{count} related node{plural}", {
                          count: heterogeneousLink.relatedNodes.length,
                          plural:
                            heterogeneousLink.relatedNodes.length === 1 ? "" : "s",
                        })
                      : t("monitor.noRelatedNode", "No related node reported")}
                  </span>
                </div>
              </div>
              {heterogeneousLink.relatedNodes.length > 0 && (
                <div className="node-heterogeneous-list">
                  {heterogeneousLink.relatedNodes.map((relatedNode) => (
                    <div key={relatedNode.id}>
                      <strong>{relatedNode.name}</strong>
                      <span>
                        {t("monitor.nodeNumber", "Node #{id}", {
                          id: relatedNode.id,
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="node-heterogeneous-empty">
              {t(
                "monitor.noHeterogeneousGroup",
                "This node is not in a heterogeneous link group.",
              )}
            </div>
          )}
        </div>

        <Divider />
        <SectionTitle>
          {t("monitor.receivingLinks", "RECEIVING LINKS")}
        </SectionTitle>
        <div
          style={{
            display: "grid",
            gap: "var(--topology-card-gap)",
            paddingRight: 2,
            marginTop: 8,
          }}
        >
          {incomingLinks.length ? (
            incomingLinks.map((link) => {
              const quality = t(snrLabelKey(snrLabel(link.snr)), snrLabel(link.snr));
              const qualityColor = snrColor(link.snr);
              return (
                <div
                  key={link.fromId}
                  style={{
                    display: "grid",
                    gap: 7,
                    padding: "var(--topology-card-padding)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    background: "rgba(148, 163, 184, .05)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          overflow: "hidden",
                          color: "var(--text)",
                          fontSize: "var(--topology-value-font)",
                          fontWeight: 750,
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {link.fromName}
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          color: "var(--muted)",
                          fontSize: "var(--topology-small-font)",
                          fontWeight: 600,
                        }}
                      >
                        {t("monitor.sourceNode", "Source node #{id}", {
                          id: link.fromId,
                        })}
                      </div>
                    </div>
                    <span
                      style={{
                        flex: "0 0 auto",
                        border: `1px solid ${qualityColor}`,
                        borderRadius: 999,
                        color: qualityColor,
                        padding: "4px 8px",
                        fontSize: "var(--topology-small-font)",
                        fontWeight: 800,
                      }}
                    >
                      {quality}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                      color: "var(--muted)",
                      fontSize: "var(--topology-small-font)",
                      fontWeight: 650,
                    }}
                  >
                    <span>
                      {t("monitor.snr", "SNR")}{" "}
                      <b style={{ color: qualityColor }}>{link.snr} dB</b>
                    </span>
                    <span>
                      {t("monitor.range", "Range")}{" "}
                      <b style={{ color: "var(--text)" }}>
                        {link.distanceKm !== null
                          ? `${link.distanceKm.toFixed(2)} km`
                          : "--"}
                      </b>
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div
              style={{
                color: "var(--muted)",
                fontSize: "var(--topology-small-font)",
              }}
            >
              {t("monitor.noIncomingLinks", "No active incoming links")}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

/**
 * SectionTitle Component - Styled section heading.
 * Used within the details card for visual section separation.
 */
function SectionTitle({ children }) {
  return (
    <div
      style={{
        color: "var(--accent-strong)",
        fontSize: "var(--topology-label-font)",
        fontWeight: 700,
        letterSpacing: "0.09em",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Divider Component - Visual separator line.
 * Used between sections in the details card.
 */
function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: "rgba(148,163,184,0.14)",
        margin: "15px 0",
      }}
    />
  );
}

/**
 * MainCanvas Component - Primary topology visualization component.
 *
 * This is the main entry point for the mesh network visualizer. It manages:
 * - Real-time data polling from the device API
 * - Node state management (list, selection, display filtering)
 * - SVG rendering of the network topology
 * - Interactive features (node selection, link inspection)
 * - Dual view modes (Topology graph, SNR matrix)
 * - Responsive layout with collapsible panels
 *
 * Props:
 * @param {string} deviceIp - IP address or hostname of the target device
 * @param {string} activeSection - Active section identifier (only renders on "monitor")
 * @param {string} theme - Theme variant ("dark" or "light")
 * @param {string} protocol - Connection protocol ("http" or "https")
 * @param {number} pollMs - Polling interval in milliseconds (default: 5000)
 *
 * @returns {JSX.Element} The rendered topology visualization
 */
export default function MainCanvas({
  deviceIp,
  activeSection,
  theme = "dark",
  protocol = "http",
  pollMs = 5000,
}) {
  const { t } = useI18n();
  // --- Component States ---

  // List of raw node objects returned from the core device status endpoint
  const [rawNodes, setRawNodes] = useState([]);
  // Resolved map of node IDs to human-readable names queried from node configurations
  const [names, setNames] = useState({});
  // Bidirectional link quality matrix mapping link strengths between nodes
  const [linkQuality, setLinkQuality] = useState([]);
  // Heterogeneous link relationship groups returned by the device.
  // Nodes in the same nested group share a colored border on the topology.
  const [heterogeneousLinkGroups, setHeterogeneousLinkGroups] = useState([]);
  // Round trip delays baseline from base device to other nodes
  const [delays, setDelays] = useState([]);
  // Nested map containing individual node status telemetry (e.g. temperature, delays)
  const [nodeTelemetry, setNodeTelemetry] = useState({});
  // Network data rate transfer calculations in Mbps
  const [rates, setRates] = useState({ rxMbps: 0, txMbps: 0 });

  // Default topology state: no node is selected, so NODE INFORMATION is hidden.
  // It appears only after the user clicks a node on the canvas or node list.
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [nodeInfoPinned, setNodeInfoPinned] = useState(false);
  // User query text to search and filter nodes
  const [query, setQuery] = useState("");
  // Node display selector. A null value means all online nodes are displayed,
  // which is the default topology behaviour.
  const [displayedNodeSelection, setDisplayedNodeSelection] = useState(null);
  // Current data-fetching status tracker ('idle', 'loading', 'success', 'refreshing', 'error')
  const [status, setStatus] = useState("idle");
  // Holds connection or network API error messages
  const [error, setError] = useState("");
  // Canvas viewport sizing to draw SVG layout cleanly
  const [canvasSize, setCanvasSize] = useState({ width: 980, height: 640 });
  // Topology helper panels. These toggles control the left Nodes Online panel
  // and the bottom Link Quality legend without changing the graph data.
  const [showNodeList, setShowNodeList] = useState(() =>
    readStoredToggle("agil-show-node-list", true),
  );
  const [showLegend, setShowLegend] = useState(() =>
    readStoredToggle("agil-show-link-legend", true),
  );
  // Users can inspect live links as a topology graph or as a directional
  // SNR matrix table where row = source node and column = destination node.
  const [viewMode, setViewMode] = useState(() =>
    typeof window === "undefined"
      ? "topology"
      : window.localStorage.getItem("agil-topology-view") || "topology",
  );

  // --- Refs ---
  // Reference to the SVG viewport container element to observe container size changes
  const stageRef = useRef(null);
  // Holds previous cumulative byte counters and timestamp to compute throughput rate limits
  const countersRef = useRef({ rx: null, tx: null, at: null });

  // Normalised device API base URL
  const baseUrl = useMemo(
    () => normaliseUrl(deviceIp, protocol),
    [deviceIp, protocol],
  );

  // Persist panel visibility preferences to localStorage
  useEffect(() => {
    window.localStorage.setItem("agil-show-node-list", String(showNodeList));
  }, [showNodeList]);

  useEffect(() => {
    window.localStorage.setItem("agil-show-link-legend", String(showLegend));
  }, [showLegend]);

  useEffect(() => {
    window.localStorage.setItem("agil-topology-view", viewMode);
  }, [viewMode]);

  // ResizeObserver to dynamically update viewport canvas dimensions
  useEffect(() => {
    if (!stageRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(500, Math.floor(entry.contentRect.width));
      const height = Math.max(510, Math.floor(entry.contentRect.height));
      setCanvasSize({ width, height });
    });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  /**
   * Performs real-time API calls to retrieve network status and configuration telemetry.
   * Leverages Promise.all for concurrent endpoint querying to minimize latency.
   *
   * Fetches:
   * - Node information (list of all nodes in the mesh)
   * - Link quality matrix (SNR values between all node pairs)
   * - Transmission delays (propagation delays to calculate distances)
   * - Physical layer byte counters (for data rate calculations)
   * - Node configurations (to resolve friendly names)
   * - Per-node telemetry (temperature, delay profiles)
   *
   * @param {AbortSignal} signal - Abort signal to discard stale requests
   */
  const refresh = useCallback(
    async (signal) => {
      if (!baseUrl) return;
      setStatus((current) =>
        current === "success" ? "refreshing" : "loading",
      );

      try {
        // Main topology data. These no-port endpoints draw the graph:
        // node list, link quality matrix, distance baseline, and bandwidth rates.
        const [
          nodeResult,
          linkResult,
          heterogeneousResult,
          delayResult,
          rxResult,
          txResult,
        ] = await Promise.all([
          fetchJson(`${baseUrl}/status?content=nodeInfos`, signal),
          fetchJson(`${baseUrl}/status?content=linkQuality`, signal),
          fetchHeterogeneousLinkGroups(baseUrl, signal),
          fetchJson(`${baseUrl}/status?content=transmissionDelay`, signal),
          fetchJson(`${baseUrl}/statusadvanced?content=phyRxBytes`, signal),
          fetchJson(`${baseUrl}/statusadvanced?content=phyTxBytes`, signal),
        ]);

        const receivedNodes = Array.isArray(nodeResult?.nodeInfos)
          ? nodeResult.nodeInfos
          : [];
        const sortedNodes = [...receivedNodes].sort(
          (a, b) => Number(a.id) - Number(b.id),
        );

        // Extract phy Rx and Tx bytes, supporting space-padded fallback keys
        const rx = Number(
          rxResult?.phyRxBytes ?? rxResult?.[" phyRxBytes "] ?? 0,
        );
        const tx = Number(
          txResult?.phyTxBytes ?? txResult?.[" phyTxBytes "] ?? 0,
        );
        const now = Date.now();
        const previous = countersRef.current;

        // Calculate rate throughput delta if we have a previous baseline
        if (previous.at !== null) {
          const elapsed = Math.max(1, now - previous.at);
          setRates({
            rxMbps: toMbps(rx - previous.rx, elapsed),
            txMbps: toMbps(tx - previous.tx, elapsed),
          });
        }
        countersRef.current = { rx, tx, at: now };

        setRawNodes(sortedNodes);
        setLinkQuality(
          Array.isArray(linkResult?.linkQuality) ? linkResult.linkQuality : [],
        );
        setHeterogeneousLinkGroups(heterogeneousResult);
        setDelays(
          Array.isArray(delayResult?.transmissionDelay)
            ? delayResult.transmissionDelay
            : [],
        );
        // Make sure selected node still exists in the freshly retrieved list
        setSelectedNodeId((current) =>
          sortedNodes.some((node) => node.id === current) ? current : null,
        );
        setError("");
        setStatus("success");

        // Display names are loaded from each node IP. If a node does not reply,
        // we still show a stable fallback such as node31.
        const resolvedNames = await Promise.all(
          sortedNodes.map(async (node) => {
            if (!node.ip) return [node.id, `node${node.id}`];
            try {
              const result = await fetchJson(
                `${protocol}://${node.ip}/config?content=name`,
                signal,
              );
              return [node.id, result?.name || `node${node.id}`];
            } catch {
              return [node.id, `node${node.id}`];
            }
          }),
        );

        setNames(Object.fromEntries(resolvedNames));

        // Node information card data. This is per-node telemetry, so selected
        // nodes show their own temperature and distance values.
        const resolvedTelemetry = await Promise.all(
          sortedNodes.map(async (node) => {
            if (!node.ip) {
              return [node.id, { temp: null, transmissionDelay: [] }];
            }
            try {
              const result = await fetchJson(
                `${protocol}://${node.ip}/status?content=temp,transmissionDelay`,
                signal,
              );
              return [
                node.id,
                {
                  temp: result?.temp ?? null,
                  transmissionDelay: Array.isArray(result?.transmissionDelay)
                    ? result.transmissionDelay
                    : [],
                },
              ];
            } catch {
              return [node.id, { temp: null, transmissionDelay: [] }];
            }
          }),
        );

        setNodeTelemetry(Object.fromEntries(resolvedTelemetry));
      } catch (requestError) {
        if (requestError?.name === "AbortError") return;
        setError(requestError?.message || "Unable to retrieve topology data.");
        setStatus("error");
      }
    },
    [baseUrl, protocol],
  );

  // Polls network status repeatedly using window.setInterval
  useEffect(() => {
    if (!baseUrl) {
      setStatus("idle");
      return undefined;
    }
    const controller = new AbortController();
    refresh(controller.signal);
    const timer = window.setInterval(() => refresh(controller.signal), pollMs);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [baseUrl, pollMs, refresh]);

  // Combine raw node properties with their resolved configuration names
  const nodes = useMemo(
    () =>
      rawNodes.map((node) => ({
        ...node,
        name: names[node.id] || `node${node.id}`,
      })),
    [rawNodes, names],
  );

  // Filters the node list based on user search queries
  const visibleNodes = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return nodes;
    return nodes.filter((node) =>
      [node.id, node.name, node.ip].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(search),
      ),
    );
  }, [nodes, query]);

  // Set of node IDs that should be displayed on the topology
  const displayedNodeIds = useMemo(
    () =>
      new Set(
        displayedNodeSelection === null
          ? nodes.map((node) => node.id)
          : displayedNodeSelection,
      ),
    [nodes, displayedNodeSelection],
  );

  // List of nodes that are actually displayed (filtered by selection)
  const displayedNodes = useMemo(
    () => nodes.filter((node) => displayedNodeIds.has(node.id)),
    [nodes, displayedNodeIds],
  );

  // Clean up stale node IDs from the display selection when nodes are removed
  useEffect(() => {
    if (displayedNodeSelection === null) return;
    const liveIds = new Set(nodes.map((node) => node.id));
    setDisplayedNodeSelection((current) => {
      if (current === null) return null;
      const filtered = current.filter((id) => liveIds.has(id));
      return filtered.length === current.length ? current : filtered;
    });
  }, [nodes, displayedNodeSelection]);

  // Clear selected node if it's no longer being displayed
  useEffect(() => {
    if (selectedNodeId === null || displayedNodeIds.has(selectedNodeId)) return;
    setSelectedNodeId(null);
    setNodeInfoPinned(false);
  }, [displayedNodeIds, selectedNodeId]);

  /**
   * Toggles the display status of a single node.
   * If the node is currently displayed, it will be hidden and vice versa.
   *
   * @param {number|string} nodeId - ID of the node to toggle
   */
  function toggleNodeDisplay(nodeId) {
    setDisplayedNodeSelection((current) => {
      const next = new Set(
        current === null ? nodes.map((node) => node.id) : current,
      );
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return [...next];
    });
  }

  // Calculates spatial coordinates for nodes on the SVG canvas area
  const positions = useMemo(
    () => getPositions(displayedNodes, canvasSize.width, canvasSize.height),
    [displayedNodes, canvasSize],
  );

  // Selected node object helper
  const selectedNode = useMemo(
    () => displayedNodes.find((node) => node.id === selectedNodeId) || null,
    [displayedNodes, selectedNodeId],
  );

  // Creates an index map from Node ID to index positions in raw node array
  const indexes = useMemo(
    () => Object.fromEntries(nodes.map((node, index) => [node.id, index])),
    [nodes],
  );

  const heterogeneousGroupByNodeId = useMemo(() => {
    const result = {};
    heterogeneousLinkGroups.forEach((group, groupIndex) => {
      const color =
        HETEROGENEOUS_GROUP_COLORS[
          groupIndex % HETEROGENEOUS_GROUP_COLORS.length
        ];
      group.forEach((nodeId) => {
        if (!result[nodeId]) {
          result[nodeId] = {
            color,
            groupIndex,
            nodes: group,
          };
        }
      });
    });
    return result;
  }, [heterogeneousLinkGroups]);

  const selectedHeterogeneousLink = useMemo(() => {
    if (!selectedNode) return null;
    const group = heterogeneousGroupByNodeId[String(selectedNode.id)];
    if (!group) return null;

    const nodeById = new Map(nodes.map((item) => [String(item.id), item]));
    const relatedNodes = group.nodes
      .filter((nodeId) => String(nodeId) !== String(selectedNode.id))
      .map((nodeId) => {
        const relatedNode = nodeById.get(String(nodeId));
        return {
          id: nodeId,
          name: relatedNode?.name || `node${nodeId}`,
        };
      });

    return {
      ...group,
      relatedNodes,
    };
  }, [heterogeneousGroupByNodeId, nodes, selectedNode]);

  const heterogeneousLegendGroups = useMemo(() => {
    const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
    return heterogeneousLinkGroups.map((group, groupIndex) => ({
      groupIndex,
      color:
        HETEROGENEOUS_GROUP_COLORS[
          groupIndex % HETEROGENEOUS_GROUP_COLORS.length
        ],
      nodes: group.map((nodeId) => {
        const node = nodeById.get(String(nodeId));
        return {
          id: nodeId,
          name: node?.name || `node${nodeId}`,
        };
      }),
    }));
  }, [heterogeneousLinkGroups, nodes]);

  // Mapping from Node ID to base delays
  const delayByNodeId = useMemo(
    () => Object.fromEntries(delays.map((item) => [item.id, item.delay])),
    [delays],
  );

  // Computes spatial distances in KM between node pairs from propagation delays
  const distanceByNodePair = useMemo(() => {
    const result = {};
    Object.entries(nodeTelemetry).forEach(([nodeId, telemetry]) => {
      const fromId = Number(nodeId);
      if (!Number.isFinite(fromId)) return;
      result[fromId] = {};
      (telemetry?.transmissionDelay || []).forEach((item) => {
        const toId = Number(item.id);
        if (!Number.isFinite(toId)) return;
        result[fromId][toId] = delayToKm(item.delay);
      });
    });
    return result;
  }, [nodeTelemetry]);

  // Build the list of active links/edges between node pairs to draw inside the SVG map
  const pairs = useMemo(() => {
    const edges = [];
    const nodeRadius = nodeRadiusForCount(displayedNodes.length);
    displayedNodes.forEach((nodeA, a) => {
      displayedNodes.slice(a + 1).forEach((nodeB) => {
        const indexA = indexes[nodeA.id];
        const indexB = indexes[nodeB.id];
        if (indexA === undefined || indexB === undefined) return;
        const snrAB = linkQuality?.[indexA]?.[indexB];
        const snrBA = linkQuality?.[indexB]?.[indexA];
        // If neither direction has an active connection (i.e. is undefined or -10 dB), skip this pair
        if (
          (Number(snrAB) === -10 || snrAB === undefined) &&
          (Number(snrBA) === -10 || snrBA === undefined)
        ) {
          return;
        }
        const posA = positions[nodeA.id];
        const posB = positions[nodeB.id];
        if (!posA || !posB) return;
        edges.push({
          key: `${nodeA.id}-${nodeB.id}`,
          nodeA,
          nodeB,
          snrAB,
          snrBA,
          aToB: edgePath(posA, posB, 1, nodeRadius),
          bToA: edgePath(posB, posA, 1, nodeRadius),
        });
      });
    });
    return edges;
  }, [displayedNodes, indexes, linkQuality, positions]);

  // Data shown in NODE INFORMATION -> RECEIVING LINKS for the selected node.
  // Distance is resolved from the selected node first, then the opposite node,
  // then the base device response as a final fallback.
  const incomingLinks = useMemo(() => {
    if (!selectedNode) return [];
    const targetIndex = indexes[selectedNode.id];
    if (targetIndex === undefined) return [];
    return nodes
      .map((source, sourceIndex) => {
        if (source.id === selectedNode.id) return null;
        const snr = linkQuality?.[sourceIndex]?.[targetIndex];
        if (snr === undefined || Number(snr) === -10) return null;
        return {
          fromId: source.id,
          fromName: source.name,
          snr,
          distanceKm:
            distanceByNodePair[selectedNode.id]?.[source.id] ??
            distanceByNodePair[source.id]?.[selectedNode.id] ??
            delayToKm(delayByNodeId[source.id]) ??
            delayToKm(delayByNodeId[selectedNode.id]),
        };
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.snr) - Number(a.snr));
  }, [
    selectedNode,
    nodes,
    indexes,
    linkQuality,
    distanceByNodePair,
    delayByNodeId,
  ]);

  const selectedTelemetry = selectedNode
    ? nodeTelemetry[selectedNode.id] || {}
    : {};

  // If not in monitor mode, show a placeholder
  if (activeSection !== "monitor") {
    return (
      <section className="content-placeholder">
        <h1>{activeSection}</h1>
        <p>
          The {activeSection} section is ready for its detailed form and API
          integration.
        </p>
      </section>
    );
  }

  return (
    <section
      className={`topology-section ${theme}`}
      style={{ fontFamily: "Arial, sans-serif", color: "var(--text)" }}
    >
      {/* Monitor view: left node list + right topology canvas. */}
      <div
        className="topology-layout"
        style={{
          "--topology-columns": showNodeList
            ? "var(--topology-list-width) minmax(0, 1fr)"
            : "minmax(0, 1fr)",
        }}
      >
        {/* Nodes Online side panel. Hidden when the Nodes toggle is off. */}
        {showNodeList && (
          <NodeList
            nodes={visibleNodes}
            onlineCount={nodes.length}
            selectedId={selectedNodeId}
            displayedNodeIds={displayedNodeIds}
            query={query}
            setQuery={setQuery}
            onSelect={setSelectedNodeId}
            onToggleDisplay={toggleNodeDisplay}
            onShowAll={() => setDisplayedNodeSelection(null)}
            onHideAll={() => setDisplayedNodeSelection([])}
            t={t}
          />
        )}

        <Panel
          className="topology-stage-panel"
          style={{
            height: "100%",
            minHeight: "var(--topology-min-height)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            ref={stageRef}
            className="topology-stage-reference"
            style={{
              position: "relative",
              height: "100%",
              minHeight: "var(--topology-min-height)",
              background: "var(--topology-bg)",
              overflow: "hidden",
            }}
          >
            {/* Grid background pattern */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: 0.22,
                backgroundImage:
                  "linear-gradient(rgba(148,163,184,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.16) 1px, transparent 1px)",
                backgroundSize: "36px 36px",
              }}
            />

            {/* Header with controls */}
            <header className="topology-stage-header">
              <div className="topology-heading-copy">
                <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                  <span
                    className="topology-status-dot"
                    style={{
                      background: status === "error" ? "#fb7185" : "#4ade80",
                      boxShadow:
                        status === "error"
                          ? "0 0 14px #fb7185"
                          : "0 0 14px #4ade80",
                    }}
                  />
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "var(--topology-title-font)",
                      fontWeight: 800,
                    }}
                  >
                    {t("monitor.networkTopology", "Network topology")}
                  </h2>
                </div>
                <div
                  style={{
                    color: "var(--muted)",
                    fontSize: "var(--topology-small-font)",
                    marginTop: 5,
                  }}
                >
                  {baseUrl
                    ? `${baseUrl} - ${
                        status === "refreshing"
                          ? t("monitor.refreshing", "Refreshing")
                          : status === "success"
                            ? t("monitor.liveTelemetry", "Live telemetry")
                            : status === "loading"
                              ? t("monitor.connecting", "Connecting")
                              : t("monitor.awaitingDevice", "Awaiting device")
                      }`
                    : t("monitor.provideDeviceIp", "Provide deviceIp to begin monitoring")}
                </div>
              </div>
              <div className="topology-stage-actions">
                {/* View mode tabs */}
                <div
                  className="topology-mode-tabs"
                  role="group"
                  aria-label={t("monitor.topologyDisplayMode", "Topology display mode")}
                >
                  {[
                    ["topology", t("monitor.topology", "Topology")],
                    ["matrix", t("monitor.matrix", "Matrix")],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={viewMode === mode}
                      onClick={() => setViewMode(mode)}
                      style={{
                        cursor: "pointer",
                        background:
                          viewMode === mode
                            ? "var(--button-bg)"
                            : "transparent",
                        color: "var(--button-text)",
                        border: 0,
                        borderRight:
                          mode === "topology"
                            ? "1px solid var(--border-subtle)"
                            : 0,
                        height: 34,
                        padding: "0 11px",
                        fontSize: "var(--topology-small-font)",
                        fontWeight: 650,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Node list toggle */}
                <button
                  type="button"
                  aria-pressed={showNodeList}
                  title={
                    showNodeList
                      ? t("monitor.hideNodesPanel", "Hide Nodes Online panel")
                      : t("monitor.showNodesPanel", "Show Nodes Online panel")
                  }
                  onClick={() => setShowNodeList((current) => !current)}
                  style={{
                    cursor: "pointer",
                    background: showNodeList
                      ? "var(--button-bg)"
                      : "var(--panel)",
                    color: "var(--button-text)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 10,
                    height: 34,
                    padding: "0 11px",
                    fontSize: "var(--topology-small-font)",
                    fontWeight: 650,
                  }}
                >
                  {showNodeList
                    ? t("monitor.hideNodes", "Hide Nodes")
                    : t("monitor.showNodes", "Show Nodes")}
                </button>

                {/* Legend toggle (topology view only) */}
                {viewMode === "topology" && (
                  <button
                    type="button"
                    aria-pressed={showLegend}
                    title={
                      showLegend
                        ? t("monitor.hideLegendTitle", "Hide Link Quality legend")
                        : t("monitor.showLegendTitle", "Show Link Quality legend")
                    }
                    onClick={() => setShowLegend((current) => !current)}
                    style={{
                      cursor: "pointer",
                      background: showLegend
                        ? "var(--button-bg)"
                        : "var(--panel)",
                      color: "var(--button-text)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 10,
                      height: 34,
                      padding: "0 11px",
                      fontSize: "var(--topology-small-font)",
                      fontWeight: 650,
                    }}
                  >
                    {showLegend
                      ? t("monitor.hideLegend", "Hide Legend")
                      : t("monitor.showLegend", "Show Legend")}
                  </button>
                )}

                {/* Manual refresh button */}
                <button
                  type="button"
                  onClick={() => refresh(new AbortController().signal)}
                  disabled={!baseUrl || status === "loading"}
                  style={{
                    cursor: baseUrl ? "pointer" : "not-allowed",
                    background: "var(--button-bg)",
                    color: "var(--button-text)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 10,
                    height: 34,
                    padding: "0 11px",
                    fontSize: "var(--topology-small-font)",
                    fontWeight: 650,
                    opacity: !baseUrl || status === "loading" ? 0.55 : 1,
                  }}
                >
                  {t("common.refresh", "Refresh")}
                </button>
              </div>
            </header>

            {viewMode === "topology" ? (
              <>
                {/* SVG Canvas - Renders the network topology graph */}
                <svg
                  viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                  width="100%"
                  height="100%"
                  style={{ position: "absolute", inset: 0, display: "block" }}
                  aria-label={t("monitor.topologyGraph", "Network topology graph")}
                  role="img"
                  onClick={(event) => {
                    if (event.target === event.currentTarget && !nodeInfoPinned) {
                      setSelectedNodeId(null);
                    }
                  }}
                >
                  {/* SVG definitions: arrow markers for directed links */}
                  <defs>
                    {SNR_BANDS.map((band) => (
                      <marker
                        key={band.color}
                        id={`arrow-${band.color.replace("#", "")}`}
                        markerWidth="9"
                        markerHeight="9"
                        refX="7"
                        refY="3"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path d="M 0 0 L 7 3 L 0 6 z" fill={band.color} />
                      </marker>
                    ))}
                    <marker
                      id="arrow-empty"
                      markerWidth="9"
                      markerHeight="9"
                      refX="7"
                      refY="3"
                      orient="auto"
                      markerUnits="strokeWidth"
                    >
                      <path d="M 0 0 L 7 3 L 0 6 z" fill={EMPTY_COLOR} />
                    </marker>
                  </defs>

                  {/* Render all active links between node pairs */}
                  {pairs.map((edge) => {
                    const renderDirection = (path, snr, key) => {
                      const color = snrColor(snr);
                      const active = Number(snr) !== -10 && snr !== undefined;
                      return active ? (
                        <g key={key}>
                          {/* Link halo (glow effect) */}
                          <path
                            d={path.d}
                            fill="none"
                            stroke="var(--link-halo)"
                            strokeWidth="7"
                            strokeLinecap="round"
                          />
                          {/* Main link path with arrow marker */}
                          <path
                            d={path.d}
                            fill="none"
                            stroke={color}
                            strokeWidth="2"
                            strokeLinecap="round"
                            markerEnd={`url(#arrow-${color.replace("#", "")})`}
                          />
                          {/* SNR value label on the link */}
                          <g
                            transform={`translate(${path.label.x} ${path.label.y})`}
                          >
                            <rect
                              x="-17"
                              y="-11"
                              width="34"
                              height="21"
                              rx="7"
                              fill="var(--snr-label-bg)"
                              stroke="var(--border-subtle)"
                            />
                            <text
                              x="0"
                              y="4"
                              textAnchor="middle"
                              fill={color}
                              style={{
                                fontSize: "var(--topology-chip-font)",
                                fontWeight: 700,
                              }}
                            >
                              {snr}
                            </text>
                          </g>
                        </g>
                      ) : null;
                    };
                    return (
                      <g key={edge.key}>
                        {renderDirection(
                          edge.aToB,
                          edge.snrAB,
                          `${edge.key}-ab`,
                        )}
                        {renderDirection(
                          edge.bToA,
                          edge.snrBA,
                          `${edge.key}-ba`,
                        )}
                      </g>
                    );
                  })}

                  {/* Render all nodes on the topology */}
                  {displayedNodes.map((node) => {
                    const point = positions[node.id];
                    const selected = node.id === selectedNodeId;
                    const heterogeneousGroup =
                      heterogeneousGroupByNodeId[String(node.id)];
                    const nodeRadius = nodeRadiusForCount(
                      displayedNodes.length,
                    );
                    const selectedRadius = selectedRadiusForCount(
                      displayedNodes.length,
                    );
                    if (!point) return null;
                    return (
                      <g
                        key={node.id}
                        className="topology-node"
                        transform={`translate(${point.x} ${point.y})`}
                        style={{ cursor: "pointer" }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedNodeId(node.id);
                        }}
                      >
                        <title>
                          {node.name} (node {node.id})
                        </title>
                        {heterogeneousGroup && (
                          <g>
                            <title>
                              {t(
                                "monitor.heterogeneousGroup",
                                "Heterogeneous group {group}: nodes {nodes}",
                                {
                                  group: heterogeneousGroup.groupIndex + 1,
                                  nodes: heterogeneousGroup.nodes.join(", "),
                                },
                              )}
                            </title>
                            <circle
                              r={nodeRadius + 7}
                              fill="none"
                              stroke={heterogeneousGroup.color}
                              strokeWidth="5"
                              opacity="0.2"
                            />
                            <circle
                              r={nodeRadius + 5}
                              fill="none"
                              stroke={heterogeneousGroup.color}
                              strokeWidth="2.5"
                              opacity="1"
                            />
                          </g>
                        )}
                        {/* Selection ring (visible when node is selected) */}
                        {selected && (
                          <circle
                            r={selectedRadius}
                            fill="rgba(45,212,191,.10)"
                            stroke="rgba(45,212,191,.34)"
                            strokeWidth="1"
                          />
                        )}
                        {/* Node body */}
                        <circle
                          r={nodeRadius}
                          fill="var(--node-fill)"
                          stroke={
                            selected ? "#2dd4bf" : "rgba(191,219,254,.48)"
                          }
                          strokeWidth={selected ? 2.4 : 1.5}
                        />
                        {/* Node inner circle */}
                        <circle
                          r={Math.max(8, nodeRadius - 6)}
                          fill="var(--node-inner)"
                        />
                        {/* Node ID label */}
                        <text
                          x="0"
                          y="5"
                          textAnchor="middle"
                          fill="var(--node-text)"
                          style={{
                            fontSize: nodeFontForCount(displayedNodes.length),
                            fontWeight: 750,
                          }}
                        >
                          {node.id}
                        </text>
                        {/* Node name label */}
                        <text
                          className="topology-node-name"
                          x="0"
                          y={nodeLabelOffsetForCount(displayedNodes.length)}
                          textAnchor="middle"
                          fill="var(--muted-strong)"
                          style={{
                            fontSize: nodeLabelFontForCount(
                              displayedNodes.length,
                            ),
                            fontWeight: 650,
                          }}
                        >
                          {node.name}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Link Quality legend. Hidden when the Legend toggle is off. */}
                {showLegend && (
                  <div
                    style={{
                      position: "absolute",
                      zIndex: 5,
                      left: "var(--topology-legend-left)",
                      bottom: "var(--topology-legend-bottom)",
                      width: "var(--topology-legend-width)",
                      borderRadius: 12,
                      background: "var(--legend-bg)",
                      border: "1px solid var(--border-subtle)",
                      backdropFilter: "blur(12px)",
                      padding: "var(--topology-card-padding)",
                    }}
                  >
                    <div
                      style={{
                        color: "var(--text)",
                        fontSize: "var(--topology-label-font)",
                        fontWeight: 700,
                        letterSpacing: ".08em",
                        marginBottom: "var(--topology-legend-gap)",
                      }}
                    >
                      {t("monitor.linkQualitySnr", "LINK QUALITY - SNR")}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gap: "var(--topology-legend-gap)",
                      }}
                    >
                      {SNR_BANDS.map((band) => (
                        <div
                          key={band.labelKey}
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "var(--topology-legend-template)",
                            alignItems: "center",
                            gap: 8,
                            fontSize: "var(--topology-chip-font)",
                          }}
                        >
                          <span
                            style={{
                              height: 3,
                              borderRadius: 99,
                              background: band.color,
                            }}
                          />
                          <span style={{ color: "var(--text)" }}>
                            {t(band.labelKey, band.fallback)}
                          </span>
                          <span
                            dir="ltr"
                            style={{
                              color: "var(--muted)",
                              unicodeBidi: "isolate",
                              textAlign: "end",
                            }}
                          >
                            {band.range}
                          </span>
                        </div>
                      ))}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "var(--topology-legend-template)",
                          alignItems: "center",
                          gap: 8,
                          fontSize: "var(--topology-chip-font)",
                        }}
                      >
                        <span
                          style={{
                            height: 3,
                            borderRadius: 99,
                            background: EMPTY_COLOR,
                          }}
                        />
                        <span style={{ color: "var(--text)" }}>
                          {t("monitor.noLink", "No link")}
                        </span>
                        <span
                          dir="ltr"
                          style={{
                            color: "var(--muted)",
                            unicodeBidi: "isolate",
                            textAlign: "end",
                          }}
                        >
                          ≤ -10 dB
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {heterogeneousLegendGroups.length > 0 && (
                  <div className="heterogeneous-legend">
                    <div className="heterogeneous-legend-title">
                      {t(
                        "monitor.heterogeneousLegendTitle",
                        "HETEROGENEOUS GROUPS",
                      )}
                    </div>
                    <div className="heterogeneous-legend-list">
                      {heterogeneousLegendGroups.map((group) => (
                        <div
                          key={group.groupIndex}
                          className="heterogeneous-legend-row"
                        >
                          <span
                            className="heterogeneous-legend-ring"
                            style={{ borderColor: group.color }}
                            aria-hidden="true"
                          />
                          <span>
                            {t("monitor.group", "Group {group}", {
                              group: group.groupIndex + 1,
                            })}
                          </span>
                          <em>
                            {group.nodes
                              .map((node) => `${node.name} #${node.id}`)
                              .join(", ")}
                          </em>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Node information card. It is rendered only after a node is selected. */}
                {selectedNode && (
                  <div className="node-detail-popover">
                    <DetailsCard
                      node={selectedNode}
                      incomingLinks={incomingLinks}
                      heterogeneousLink={selectedHeterogeneousLink}
                      temperature={selectedTelemetry.temp}
                      rxMbps={rates.rxMbps}
                      txMbps={rates.txMbps}
                      pinned={nodeInfoPinned}
                      onTogglePinned={() =>
                        setNodeInfoPinned((current) => !current)
                      }
                      onClose={() => {
                        setSelectedNodeId(null);
                        setNodeInfoPinned(false);
                      }}
                      t={t}
                    />
                  </div>
                )}
              </>
            ) : (
              // Matrix view: SNR table
              <TopologyMatrix
                nodes={displayedNodes}
                linkQuality={linkQuality}
                nodeIndexes={indexes}
                t={t}
              />
            )}

            {/* Empty state: No device connected */}
            {status === "idle" && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 7,
                  display: "grid",
                  placeItems: "center",
                  padding: "var(--topology-panel-padding)",
                }}
              >
                <div style={{ textAlign: "center", maxWidth: 350 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "var(--topology-heading-font)",
                    }}
                  >
                    {t("monitor.connectDevice", "Connect a datalink device")}
                  </div>
                  <div
                    style={{
                      color: "var(--muted)",
                      marginTop: 7,
                      fontSize: "var(--topology-value-font)",
                    }}
                  >
                    {t(
                      "monitor.passDeviceIp",
                      "Pass the target IP address through the deviceIp prop.",
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Error state: Display connection issues */}
            {status === "error" && (
              <div
                style={{
                  position: "absolute",
                  zIndex: 7,
                  top: 70,
                  left: 20,
                  right: 350,
                  maxWidth: 480,
                  padding: "var(--topology-card-padding)",
                  borderRadius: 11,
                  border: "1px solid rgba(251,113,133,.40)",
                  background: "rgba(136,19,55,.22)",
                  color: "#fecdd3",
                  fontSize: "var(--topology-small-font)",
                }}
              >
                <b>{t("monitor.connectionIssue", "Connection issue:")}</b>{" "}
                {error}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </section>
  );
}

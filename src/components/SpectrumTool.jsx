/**
 * SpectrumTool Component - Spectrum Analysis and Visualization Tool
 *
 * This component provides real-time spectrum analysis for mesh radio devices,
 * displaying RSSI (Received Signal Strength Indicator) data across frequencies.
 * It visualizes average noise, burst interference, and node-specific RSSI levels.
 *
 * Features:
 * - Spectrum visualization with average noise and burst interference plots
 * - AI-assisted frequency recommendation based on spectrum quality
 * - Node RSSI overlay with toggleable node selection
 * - Interactive point selection with detailed metrics
 * - Real-time data polling from device APIs
 * - Responsive SVG chart with grid lines and labels
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { requestJson as fetchJson } from "../api/deviceApi.js";
import { useI18n } from "../i18n/index.js";

/**
 * Formats a frequency value in Hertz to a human-readable string.
 * Automatically scales to GHz, MHz, or Hz based on magnitude.
 *
 * @param {number|string} value - Frequency in Hertz
 * @returns {string} Formatted frequency string with appropriate unit
 */
function formatFrequency(value) {
  const hz = Number(value);
  if (!Number.isFinite(hz)) return "--";
  if (Math.abs(hz) >= 1_000_000_000)
    return `${(hz / 1_000_000_000).toFixed(3)} GHz`;
  if (Math.abs(hz) >= 1_000_000) return `${(hz / 1_000_000).toFixed(3)} MHz`;
  return `${hz.toFixed(0)} Hz`;
}

/**
 * Formats a frequency value in Hertz to Megahertz with one decimal place.
 * Used for chart axis labels.
 *
 * @param {number|string} value - Frequency in Hertz
 * @returns {string} Formatted frequency in MHz or "--" if invalid
 */
function formatFrequencyMhz(value) {
  const hz = Number(value);
  return Number.isFinite(hz) ? (hz / 1_000_000).toFixed(1) : "--";
}

/**
 * Formats a value in dBm (decibel-milliwatts) with one decimal place.
 *
 * @param {number|string} value - RSSI value in dBm
 * @returns {string} Formatted dBm string or "--" if invalid
 */
function formatDbm(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)} dBm` : "--";
}

/**
 * Formats a value as a percentage.
 * Handles both decimal (0.xx) and percentage (xx) input formats.
 *
 * @param {number|string} value - Value to format as percentage
 * @returns {string} Formatted percentage string or "--" if invalid
 */
function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  const percent = number <= 1 ? number * 100 : number;
  return `${percent.toFixed(1)}%`;
}

/**
 * Normalizes spectrum RSSI data into structured rows with associated frequencies.
 * Handles mismatched data lengths by spreading samples across the frequency range.
 *
 * @param {Array} rssi - Array of RSSI data rows [averageNoise, burstInterference, burstRatio]
 * @param {Array} freqList - List of frequency values in Hz
 * @returns {Array} Normalized rows with id, frequency, averageNoise, burstInterference, burstRatio
 */
function normalizeSpectrumRows(rssi = [], freqList = []) {
  const frequencies = buildSpectrumFrequencyAxis(rssi.length, freqList);
  return rssi.map((row, index) => {
    const values = Array.isArray(row) ? row : [];
    return {
      id: index,
      frequency: frequencies[index],
      averageNoise: values[0],
      burstInterference: values[1],
      burstRatio: values[2],
    };
  });
}

/**
 * Builds a frequency axis for spectrum data.
 * Handles various cases:
 * - Exact match: Uses provided freqList
 * - More samples than frequencies: Spreads samples across the range
 * - Single frequency: Repeats the same frequency
 * - No frequencies: Returns null values
 *
 * @param {number} sampleCount - Number of RSSI samples
 * @param {Array} freqList - List of frequency values in Hz
 * @returns {Array} Array of frequency values matching sampleCount
 */
function buildSpectrumFrequencyAxis(sampleCount, freqList = []) {
  const validFrequencies = freqList.map(Number).filter(Number.isFinite);
  if (!sampleCount) return [];
  if (validFrequencies.length === sampleCount) return validFrequencies;
  if (validFrequencies.length > 1) {
    const start = Math.min(...validFrequencies);
    const end = Math.max(...validFrequencies);
    const step = (end - start) / Math.max(1, sampleCount - 1);
    // Some firmware builds can return more /spectrum RSSI samples than freqList entries.
    // Spread the samples across the configured frequency range so every row is plotted.
    return Array.from(
      { length: sampleCount },
      (_, index) => start + step * index,
    );
  }
  if (validFrequencies.length === 1)
    return Array(sampleCount).fill(validFrequencies[0]);
  return Array(sampleCount).fill(null);
}

/**
 * Calculates the average RSSI from antenna 1 and antenna 2 values.
 *
 * @param {Object} node - Node object containing ant1Rssi and ant2Rssi
 * @returns {number|null} Average RSSI value or null if no valid values
 */
function averageRssi(node) {
  const values = [node?.ant1Rssi, node?.ant2Rssi]
    .map(Number)
    .filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Normalizes burst ratio values to percentage format.
 * Handles both decimal (0.xx) and percentage (xx) input formats.
 *
 * @param {number|string} value - Burst ratio value
 * @returns {number|null} Normalized percentage or null if invalid
 */
function normalizeBurstRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number <= 1 ? number * 100 : number;
}

/**
 * Builds a list of frequency recommendations based on spectrum quality.
 * Uses a scoring algorithm that considers:
 * - Average noise (lower is better)
 * - Burst interference (lower is better)
 * - Burst percentage (lower is better)
 *
 * @param {Array} rows - Spectrum data rows
 * @returns {Array} Sorted recommendations with scores (best first)
 */
function buildFrequencyRecommendations(rows) {
  const candidates = rows
    .map((row) => {
      const averageNoise = Number(row.averageNoise);
      const burstInterference = Number(row.burstInterference);
      const burstPercent = normalizeBurstRatio(row.burstRatio);
      if (
        !Number.isFinite(Number(row.frequency)) ||
        !Number.isFinite(averageNoise) ||
        !Number.isFinite(burstInterference) ||
        !Number.isFinite(burstPercent)
      ) {
        return null;
      }

      // Lower score is better: quieter average noise, quieter burst RSSI, lower burst occupancy.
      const score =
        averageNoise * 0.45 + burstInterference * 0.35 + burstPercent * 0.2;
      return { ...row, averageNoise, burstInterference, burstPercent, score };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score);

  return candidates;
}

function normalizeFrequencyHz(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.abs(number) < 10000 ? number * 1_000_000 : number;
}

function currentFrequencyFromConfig(frequencies, selectedFrequency) {
  const list = Array.isArray(frequencies?.freqList) ? frequencies.freqList : [];
  const index = Number(selectedFrequency?.freqDefault);
  const listValue = Number.isInteger(index) ? list[index] : null;
  const selectedFromList = normalizeFrequencyHz(listValue);
  if (selectedFromList !== null) return selectedFromList;
  return normalizeFrequencyHz(selectedFrequency?.freqDefault);
}

function findNearestFrequencyRow(rows, frequencyHz) {
  if (!Number.isFinite(Number(frequencyHz)) || !rows.length) return null;
  return rows.reduce((nearest, row) => {
    const rowFrequency = Number(row.frequency);
    if (!Number.isFinite(rowFrequency)) return nearest;
    const distance = Math.abs(rowFrequency - frequencyHz);
    if (!nearest || distance < nearest.distance) return { row, distance };
    return nearest;
  }, null)?.row || null;
}

function frequencyVerdict(candidate, index) {
  if (
    candidate.burstPercent >= 20 ||
    candidate.averageNoise > -75 ||
    candidate.burstInterference > -70
  ) {
    return { id: "avoid", label: "Avoid" };
  }
  if (index <= 2 && candidate.burstPercent <= 10) {
    return { id: "recommended", label: "Recommended" };
  }
  return { id: "usable", label: "Usable" };
}

/**
 * Color palette for chart series.
 * Used for average noise, burst interference, and node RSSI lines.
 */
const SERIES_COLORS = [
  "#48B9D3", // Cyan - Average noise
  "#fb7185", // Pink - Burst interference
  "#a3e635", // Lime - Additional series
  "#facc15", // Yellow - Additional series
  "#c084fc", // Purple - Additional series
  "#38bdf8", // Light blue - Additional series
  "#fb923c", // Orange - Additional series
  "#34d399", // Emerald - Additional series
];

const RSSI_VIEW_OPTIONS = [
  { id: "average", label: "Average", suffix: "Avg" },
  { id: "ant1", label: "Antenna 1", suffix: "Ant 1" },
  { id: "ant2", label: "Antenna 2", suffix: "Ant 2" },
];

const LIVE_REFRESH_INTERVALS = [
  { value: 1000, label: "1s" },
  { value: 2000, label: "2s" },
  { value: 5000, label: "5s" },
];

function rssiValueForView(node, viewId) {
  if (viewId === "ant1") return Number(node?.ant1Rssi);
  if (viewId === "ant2") return Number(node?.ant2Rssi);
  return averageRssi(node);
}

function buildPeakHoldRows(history) {
  const snapshots = history.map((entry) => entry.rows || []).filter(Boolean);
  const maxLength = Math.max(0, ...snapshots.map((rows) => rows.length));
  return Array.from({ length: maxLength }, (_, index) => {
    const samples = snapshots
      .map((rows) => rows[index])
      .filter((row) => row && Number.isFinite(Number(row.frequency)));

    if (!samples.length) return null;

    const strongestAverage = Math.max(
      ...samples
        .map((row) => Number(row.averageNoise))
        .filter(Number.isFinite),
    );
    const strongestBurst = Math.max(
      ...samples
        .map((row) => Number(row.burstInterference))
        .filter(Number.isFinite),
    );

    return {
      id: index,
      frequency: samples.at(-1).frequency,
      averageNoise: Number.isFinite(strongestAverage)
        ? strongestAverage
        : null,
      burstInterference: Number.isFinite(strongestBurst)
        ? strongestBurst
        : null,
    };
  }).filter(Boolean);
}

function analyzerHeatColor(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "rgba(2, 6, 23, .16)";
  const ratio = Math.max(0, Math.min(1, (number - -125) / 82));
  if (ratio < 0.22) return `rgba(37, 99, 235, ${0.18 + ratio * 1.8})`;
  if (ratio < 0.42) return `rgba(6, 182, 212, ${0.28 + ratio * 1.1})`;
  if (ratio < 0.64) return `rgba(34, 197, 94, ${0.26 + ratio * .95})`;
  if (ratio < 0.84) return `rgba(250, 204, 21, ${0.22 + ratio * .82})`;
  return `rgba(251, 113, 133, ${0.24 + ratio * .78})`;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * SpectrumTool Component - Main spectrum analysis component.
 *
 * Manages spectrum data fetching, state management, and rendering of:
 * - Spectrum RSSI chart with average noise and burst interference
 * - Node RSSI overlay with toggleable selection
 * - AI-assisted frequency recommendations
 * - Interactive point selection with detailed metrics
 *
 * Props:
 * @param {string} deviceIp - IP address or hostname of the target device
 * @param {string} [protocol="http"] - Connection protocol ("http" or "https")
 *
 * @returns {JSX.Element} The rendered spectrum analysis tool
 */
export default function SpectrumTool({ deviceIp, protocol = "http" }) {
  const { t } = useI18n();
  const loadInFlightRef = useRef(false);
  // --- Component States ---
  // Spectrum data: rows of [averageNoise, burstInterference, burstRatio]
  const [spectrumRows, setSpectrumRows] = useState([]);
  // Frequency list from device configuration
  const [freqList, setFreqList] = useState([]);
  // Currently selected RF frequency from freqDefault + freqList
  const [currentFrequencyHz, setCurrentFrequencyHz] = useState(null);
  // Node information from device status
  const [nodeInfos, setNodeInfos] = useState([]);
  // RSSI values for each node (ant1Rssi, ant2Rssi)
  const [nodesRssi, setNodesRssi] = useState([]);
  // Currently selected node IDs for RSSI overlay
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  // Selected RSSI overlays for node lines: average, antenna 1, antenna 2.
  const [selectedRssiViews, setSelectedRssiViews] = useState(["average"]);
  // Spectrum is presented as a real-time analyzer view only.
  const displayMode = "realtime";
  // Real-time polling controls.
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [liveIntervalMs, setLiveIntervalMs] = useState(2000);
  const [peakHoldEnabled, setPeakHoldEnabled] = useState(true);
  const [liveHistory, setLiveHistory] = useState([]);
  // Selected point for detailed view
  const [selectedPointId, setSelectedPointId] = useState(null);
  // Hovered point for tooltip display
  const [hoveredPointId, setHoveredPointId] = useState(null);
  // Data-fetching status tracker ('idle', 'loading', 'success', 'refreshing', 'error')
  const [status, setStatus] = useState("idle");
  // Holds connection or network API error messages
  const [error, setError] = useState("");

  // Normalised device API base URL
  const baseUrl = useMemo(
    () => `${protocol}://${deviceIp}`.replace(/\/$/, ""),
    [deviceIp, protocol],
  );

  /**
   * Fetches spectrum data from the device API.
   * Retrieves:
   * - Spectrum RSSI data (/spectrum)
   * - Frequency list (/config?content=freqList)
   * - Node status and RSSI values (/status?content=nodeInfos,nodesRssi)
   *
   * @param {AbortSignal} signal - Abort signal to discard stale requests
   */
  async function load(signal) {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setStatus((current) => (current === "success" ? "refreshing" : "loading"));
    try {
      const [spectrum, frequencies, selectedFrequency, statusResult] =
        await Promise.all([
          fetchJson(`${baseUrl}/spectrum`, signal),
          fetchJson(`${baseUrl}/config?content=freqList`, signal),
          fetchJson(`${baseUrl}/config?content=freqDefault`, signal),
          fetchJson(`${baseUrl}/status?content=nodeInfos,nodesRssi`, signal),
        ]);

      const nextFreqList = Array.isArray(frequencies?.freqList)
        ? frequencies.freqList
        : [];
      const nextNodeInfos = Array.isArray(statusResult?.nodeInfos)
        ? statusResult.nodeInfos
        : [];
      const nextNodesRssi = Array.isArray(statusResult?.nodesRssi)
        ? statusResult.nodesRssi
        : [];
      const nextSpectrumRows = normalizeSpectrumRows(
        spectrum?.rssi || [],
        nextFreqList,
      );

      setFreqList(nextFreqList);
      setCurrentFrequencyHz(
        currentFrequencyFromConfig(frequencies, selectedFrequency),
      );
      setSpectrumRows(nextSpectrumRows);
      setLiveHistory((current) => [
        ...current.slice(-79),
        { timestamp: Date.now(), rows: nextSpectrumRows },
      ]);
      setNodeInfos(
        [...nextNodeInfos].sort((a, b) => Number(a.id) - Number(b.id)),
      );
      setNodesRssi(
        [...nextNodesRssi].sort((a, b) => Number(a.id) - Number(b.id)),
      );
      setSelectedNodeIds((current) => {
        const validIds = nextNodeInfos.map((node) => String(node.id));
        const preserved = current.filter((id) => validIds.includes(String(id)));
        return preserved.length ? preserved : validIds;
      });
      setError("");
      setStatus("success");
    } catch (requestError) {
      if (requestError?.name === "AbortError") return;
      setError(
        requestError?.message ||
          t("spectrum.loadFailed", "Unable to load spectrum data."),
      );
      setStatus("error");
    } finally {
      loadInFlightRef.current = false;
    }
  }

  // Initial data load on component mount or baseUrl change
  useEffect(() => {
    const controller = new AbortController();
    setLiveHistory([]);
    setSelectedPointId(null);
    setHoveredPointId(null);
    load(controller.signal);
    return () => controller.abort();
  }, [baseUrl]);

  useEffect(() => {
    if (displayMode !== "realtime" || !liveEnabled) {
      return undefined;
    }

    const controllers = new Set();
    const timer = window.setInterval(() => {
      const controller = new AbortController();
      controllers.add(controller);
      load(controller.signal).finally(() => controllers.delete(controller));
    }, liveIntervalMs);

    return () => {
      window.clearInterval(timer);
      controllers.forEach((controller) => controller.abort());
    };
  }, [displayMode, liveEnabled, liveIntervalMs, baseUrl]);

  // --- Data Processing for Chart ---

  // Selected nodes with their RSSI values
  const selectedNodes = nodesRssi.filter((node) =>
    selectedNodeIds.includes(String(node.id)),
  );
  const nodeInfoById = useMemo(
    () =>
      new Map(
        nodeInfos.map((node) => [
          String(node.id),
          node.name || node.nodeName || `node${node.id}`,
        ]),
      ),
    [nodeInfos],
  );

  // Filter out rows with invalid frequencies
  const chartRows = spectrumRows.filter((row) =>
    Number.isFinite(Number(row.frequency)),
  );

  // Build series data for selected nodes and RSSI views.
  const selectedNodeSeries = selectedNodes
    .flatMap((node, nodeIndex) =>
      RSSI_VIEW_OPTIONS.filter((view) =>
        selectedRssiViews.includes(view.id),
      ).map((view, viewIndex) => {
        const suffix = t(`spectrum.rssiViewSuffixes.${view.id}`, view.suffix);
        return {
          id: `${node.id}-${view.id}`,
          nodeId: node.id,
          label:
            view.id === "average"
              ? nodeInfoById.get(String(node.id)) || `node${node.id}`
              : `${nodeInfoById.get(String(node.id)) || `node${node.id}`} ${suffix}`,
          value: rssiValueForView(node, view.id),
          color:
            SERIES_COLORS[
              (nodeIndex * RSSI_VIEW_OPTIONS.length + viewIndex + 2) %
                SERIES_COLORS.length
            ],
        };
      }),
    )
    .filter((node) => Number.isFinite(Number(node.value)));

  const peakHoldRows = useMemo(
    () => buildPeakHoldRows(liveHistory).filter((row) =>
      Number.isFinite(Number(row.frequency)),
    ),
    [liveHistory],
  );
  const showPeakHold =
    displayMode === "realtime" && peakHoldEnabled && peakHoldRows.length > 0;
  const liveSampleCount = liveHistory.length;
  const latestLiveSample = liveHistory.at(-1) || null;
  const validFrequencyCount = freqList.map(Number).filter(Number.isFinite).length;
  const frequencyAxisInterpolated =
    spectrumRows.length > 0 &&
    validFrequencyCount > 1 &&
    validFrequencyCount !== spectrumRows.length;

  // Collect all values for Y-axis range calculation
  const chartValues = [
    ...chartRows.flatMap((row) => [
      Number(row.averageNoise),
      Number(row.burstInterference),
    ]),
    ...(showPeakHold
      ? peakHoldRows.flatMap((row) => [
          Number(row.averageNoise),
          Number(row.burstInterference),
        ])
      : []),
    ...selectedNodeSeries.map((node) => Number(node.value)),
  ].filter(Number.isFinite);

  // Calculate X-axis (frequency) range
  const frequencyValues = chartRows.map((row) => Number(row.frequency));
  const xMin = frequencyValues.length ? Math.min(...frequencyValues) : 0;
  const xMax = frequencyValues.length ? Math.max(...frequencyValues) : 1;

  // Calculate Y-axis (RSSI) range with padding
  const rawYMin = chartValues.length ? Math.min(...chartValues) : -120;
  const rawYMax = chartValues.length ? Math.max(...chartValues) : -40;
  const yMin = Math.floor(Math.min(-40, rawYMin) / 10) * 10;
  const yMax = Math.ceil(Math.max(-140, rawYMax) / 10) * 10;

  // Chart dimensions and coordinate mappings
  const chart = {
    width: 920,
    height: 320,
    left: 58,
    right: 18,
    top: 18,
    bottom: 44,
  };
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;

  // Coordinate conversion functions
  const xFor = (frequency) =>
    chart.left + ((Number(frequency) - xMin) / (xMax - xMin || 1)) * plotWidth;
  const yFor = (value) =>
    chart.top + ((yMax - Number(value)) / (yMax - yMin || 1)) * plotHeight;

  // Generate SVG path data for lines
  const lineForRows = (rows, key) =>
    rows
      .filter((row) => Number.isFinite(Number(row[key])))
      .map(
        (row) =>
          `${xFor(row.frequency).toFixed(1)},${yFor(row[key]).toFixed(1)}`,
      )
      .join(" ");
  const lineFor = (key) => lineForRows(chartRows, key);
  const areaForRows = (rows, key) => {
    const points = rows
      .filter((row) => Number.isFinite(Number(row[key])))
      .map((row) => ({
        x: xFor(row.frequency),
        y: yFor(row[key]),
      }));
    if (!points.length) return "";
    const baseline = chart.height - chart.bottom;
    return [
      `M ${points[0].x.toFixed(1)} ${baseline.toFixed(1)}`,
      ...points.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`),
      `L ${points.at(-1).x.toFixed(1)} ${baseline.toFixed(1)}`,
      "Z",
    ].join(" ");
  };

  // Generate axis ticks
  const xTicks = Array.from(
    { length: Math.min(5, chartRows.length || 1) },
    (_, index) => {
      if (!chartRows.length) return 0;
      const ratio = index / Math.max(1, Math.min(5, chartRows.length) - 1);
      return xMin + (xMax - xMin) * ratio;
    },
  );
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => yMin + ((yMax - yMin) / 4) * index,
  );
  const realtimeWaterfallRows = liveHistory
    .slice(-34)
    .map((entry) => ({
      ...entry,
      rows: (entry.rows || []).filter((row) =>
        Number.isFinite(Number(row.frequency)),
      ),
    }))
    .filter((entry) => entry.rows.length);

  // Frequency recommendations
  const recommendedFrequencies = buildFrequencyRecommendations(chartRows);
  const bestFrequency = recommendedFrequencies[0] || null;
  const alternateFrequencies = recommendedFrequencies.slice(1, 4);
  const hasChartData = chartRows.length > 0;
  const currentFrequencyVisible =
    hasChartData &&
    Number.isFinite(Number(currentFrequencyHz)) &&
    currentFrequencyHz >= xMin &&
    currentFrequencyHz <= xMax;
  const nearestCurrentRow = findNearestFrequencyRow(chartRows, currentFrequencyHz);
  const rankedTopFrequencies = recommendedFrequencies.slice(0, 5);
  const currentRecommendedRow = recommendedFrequencies.find(
    (row) => nearestCurrentRow && row.id === nearestCurrentRow.id,
  );
  const rankedFrequencies = [
    ...rankedTopFrequencies,
    ...(currentRecommendedRow &&
    !rankedTopFrequencies.some((row) => row.id === currentRecommendedRow.id)
      ? [currentRecommendedRow]
      : []),
  ].map((row) => {
    const recommendationIndex = recommendedFrequencies.findIndex(
      (candidate) => candidate.id === row.id,
    );
    return {
      ...row,
      isCurrent: nearestCurrentRow?.id === row.id,
      rank: recommendationIndex + 1,
      verdict: frequencyVerdict(row, recommendationIndex),
    };
  });

  // Hover tooltip positioning
  const hoveredPoint =
    chartRows.find((row) => row.id === hoveredPointId) || null;
  const hoveredPointX = hoveredPoint
    ? xFor(hoveredPoint.frequency)
    : chart.left;
  const hoveredPointY = hoveredPoint
    ? Math.min(
        yFor(hoveredPoint.averageNoise),
        yFor(hoveredPoint.burstInterference),
      )
    : chart.top;
  const hoveredPointPanel = {
    x: Math.min(
      chart.width - chart.right - 226,
      Math.max(chart.left + 8, hoveredPointX + 12),
    ),
    y: Math.min(
      chart.height - chart.bottom - 104,
      Math.max(chart.top + 8, hoveredPointY - 44),
    ),
  };

  /**
   * Toggles a node's inclusion in the RSSI overlay.
   *
   * @param {number|string} nodeId - ID of the node to toggle
   */
  function toggleNode(nodeId) {
    setSelectedNodeIds((current) =>
      current.includes(String(nodeId))
        ? current.filter((id) => id !== String(nodeId))
        : [...current, String(nodeId)],
    );
  }

  function toggleRssiView(viewId) {
    setSelectedRssiViews((current) => {
      if (current.includes(viewId)) {
        const next = current.filter((id) => id !== viewId);
        return next.length ? next : current;
      }
      return [...current, viewId];
    });
  }

  function handleClearLiveSession() {
    setLiveHistory([]);
    setSelectedPointId(null);
    setHoveredPointId(null);
  }

  function handleExportSpectrumCsv() {
    const headers = [
      "frequency_hz",
      "frequency_mhz",
      "average_noise_dbm",
      "burst_interference_dbm",
      "burst_percent",
    ];
    const rows = chartRows.map((row) => [
      row.frequency,
      Number(row.frequency) / 1_000_000,
      row.averageNoise,
      row.burstInterference,
      normalizeBurstRatio(row.burstRatio),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spectrum-${deviceIp || "device"}-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="tools-card spectrum-card">
      <div className="tools-card-title">{t("tools.spectrum", "Spectrum")}</div>
      <div className="tools-card-body">
        {/* Header: Sample count and refresh button */}
        <div className="spectrum-head">
          <div>
            <strong>
              {t("spectrum.frequencySamples", "{count} frequency samples", {
                count: spectrumRows.length,
              })}
            </strong>
            <span>
              {t("spectrum.onlineNodesDiscovered", "{count} online nodes discovered", {
                count: nodeInfos.length,
              })}
            </span>
          </div>
          <div className="spectrum-head-actions">
            <button
              type="button"
              disabled={!chartRows.length}
              onClick={handleExportSpectrumCsv}
            >
              {t("common.export", "Export")}
            </button>
            <button
              type="button"
              disabled={status === "loading"}
              onClick={() => load(new AbortController().signal)}
            >
              {status === "refreshing"
                ? t("common.refreshing", "Refreshing")
                : t("common.refresh", "Refresh")}
            </button>
          </div>
        </div>

        {/* Error display */}
        {error && <div className="tools-error">{error}</div>}

        <div className="spectrum-mode-toolbar">
          <div className="spectrum-live-controls">
            <button
              type="button"
              className={liveEnabled ? "is-live" : ""}
              onClick={() => setLiveEnabled((current) => !current)}
            >
              {liveEnabled
                ? t("spectrum.pauseLive", "Pause")
                : t("spectrum.startLive", "Start Live")}
            </button>
            <label>
              <span>{t("spectrum.refreshRate", "Refresh rate")}</span>
              <select
                value={liveIntervalMs}
                onChange={(event) => setLiveIntervalMs(Number(event.target.value))}
              >
                {LIVE_REFRESH_INTERVALS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="spectrum-peak-toggle">
              <input
                type="checkbox"
                checked={peakHoldEnabled}
                onChange={(event) => setPeakHoldEnabled(event.target.checked)}
              />
              {t("spectrum.peakHold", "Peak Hold")}
            </label>
            <button type="button" onClick={handleClearLiveSession}>
              {t("spectrum.clearSession", "Clear")}
            </button>
            <span
              className={
                liveEnabled
                  ? "spectrum-live-status is-live"
                  : "spectrum-live-status"
              }
            >
              <i aria-hidden="true" />
              {liveEnabled
                ? t("spectrum.liveRunning", "Live")
                : t("spectrum.livePaused", "Paused")}{" "}
              ·{" "}
              {t("spectrum.liveSamples", "{count} samples", {
                count: liveSampleCount,
              })}
            </span>
          </div>
        </div>

        {/* Spectrum controls: node visibility and RSSI source are kept together. */}
        <div className="spectrum-controls-toolbar">
          <div className="spectrum-control-group">
            <strong>{t("spectrum.selectNodes", "Select nodes")}</strong>
            <div className="spectrum-node-checks">
              {nodeInfos.map((node) => (
                <label key={node.id}>
                  <input
                    type="checkbox"
                    checked={selectedNodeIds.includes(String(node.id))}
                    onChange={() => toggleNode(node.id)}
                  />
                  {node.name || node.nodeName || `node${node.id}`}
                </label>
              ))}
              {!nodeInfos.length && (
                <span>{t("spectrum.noOnlineNodes", "No online nodes reported")}</span>
              )}
            </div>
          </div>
          <div className="spectrum-node-actions">
            <button
              type="button"
              onClick={() =>
                setSelectedNodeIds(nodeInfos.map((node) => String(node.id)))
              }
            >
              {t("monitor.all", "All")}
            </button>
            <button type="button" onClick={() => setSelectedNodeIds([])}>
              {t("monitor.none", "None")}
            </button>
          </div>
          <div className="spectrum-toolbar-divider" aria-hidden="true" />
          <div className="spectrum-control-group">
            <strong>{t("spectrum.rssiView", "RSSI View")}</strong>
            <div className="spectrum-node-checks">
              {RSSI_VIEW_OPTIONS.map((view) => (
                <label key={view.id}>
                  <input
                    type="checkbox"
                    checked={selectedRssiViews.includes(view.id)}
                    onChange={() => toggleRssiView(view.id)}
                  />
                  {t(`spectrum.rssiViews.${view.id}`, view.label)}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Spectrum Chart */}
        <div
          className={
            displayMode === "realtime"
              ? "spectrum-graph spectrum-graph-live"
              : "spectrum-graph"
          }
        >
          <div className="spectrum-graph-title">
            <strong>
              {t("spectrum.realtimeTitle", "Real-Time Spectrum")}
            </strong>
            <span>
              {t(
                "spectrum.realtimeAxis",
                "X-axis: frequency in MHz. Y-axis: RSSI level in dBm.",
              )}
            </span>
            {frequencyAxisInterpolated && (
              <small className="spectrum-axis-note">
                {t(
                  "spectrum.interpolatedAxis",
                  "Frequency axis interpolated from configured frequency range.",
                )}
              </small>
            )}
            {displayMode === "realtime" && (
              <small>
                {latestLiveSample
                  ? t("spectrum.lastSample", "Last sample {time}", {
                      time: new Date(
                        latestLiveSample.timestamp,
                      ).toLocaleTimeString(),
                    })
                  : t("spectrum.waitingForLiveSample", "Waiting for live sample")}
              </small>
            )}
          </div>
          <div
            className={
              bestFrequency ? "spectrum-ai-inline has-data" : "spectrum-ai-inline"
            }
          >
            <span>{t("tools.aiAssistant", "AI Assistant")}</span>
            {bestFrequency ? (
              <>
                <strong>
                  {t("spectrum.recommendedFrequency", "Recommended frequency:")}{" "}
                  {formatFrequency(bestFrequency.frequency)}
                </strong>
                <small>
                  {t("spectrum.avgNoise", "Avg Noise")}{" "}
                  {formatDbm(bestFrequency.averageNoise)} ·{" "}
                  {t("spectrum.burstRssi", "Burst RSSI")}{" "}
                  {formatDbm(bestFrequency.burstInterference)} ·{" "}
                  {t("spectrum.burst", "Burst")}{" "}
                  {bestFrequency.burstPercent.toFixed(1)}%
                </small>
                {!!alternateFrequencies.length && (
                  <div className="spectrum-ai-alternates">
                    <span>{t("spectrum.alternates", "Alternates")}</span>
                    {alternateFrequencies.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setSelectedPointId(row.id)}
                      >
                        {formatFrequency(row.frequency)}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <strong>
                {t(
                  "spectrum.aiWaiting",
                  "AI Assistant is waiting for spectrum data. Click Refresh to analyze.",
                )}
              </strong>
            )}
          </div>

          <div className="spectrum-ranking">
            <div className="spectrum-ranking-head">
              <strong>{t("spectrum.bestChannelRanking", "Best Channel Ranking")}</strong>
              <span>
                {Number.isFinite(Number(currentFrequencyHz))
                  ? t("spectrum.currentFrequencyValue", "Current {frequency}", {
                      frequency: formatFrequency(currentFrequencyHz),
                    })
                  : t("spectrum.currentFrequencyUnavailable", "Current frequency unavailable")}
              </span>
            </div>
            {rankedFrequencies.length ? (
              <div
                className="spectrum-ranking-table"
                role="table"
                aria-label={t("spectrum.bestChannelRanking", "Best Channel Ranking")}
              >
                <div className="spectrum-ranking-row spectrum-ranking-header" role="row">
                  <span role="columnheader">{t("spectrum.rank", "Rank")}</span>
                  <span role="columnheader">{t("spectrum.frequency", "Frequency")}</span>
                  <span role="columnheader">{t("spectrum.avgNoise", "Avg Noise")}</span>
                  <span role="columnheader">{t("spectrum.burstRssi", "Burst RSSI")}</span>
                  <span role="columnheader">{t("spectrum.burst", "Burst")}</span>
                  <span role="columnheader">{t("spectrum.verdict", "Verdict")}</span>
                </div>
                {rankedFrequencies.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={
                      row.isCurrent
                        ? "spectrum-ranking-row is-current"
                        : "spectrum-ranking-row"
                    }
                    role="row"
                    onClick={() => setSelectedPointId(row.id)}
                  >
                    <span role="cell">#{row.rank}</span>
                    <span role="cell">
                      {formatFrequency(row.frequency)}
                      {row.isCurrent && (
                        <em>{t("spectrum.current", "Current")}</em>
                      )}
                    </span>
                    <span role="cell">{formatDbm(row.averageNoise)}</span>
                    <span role="cell">{formatDbm(row.burstInterference)}</span>
                    <span role="cell">{row.burstPercent.toFixed(1)}%</span>
                    <span role="cell">
                      <i className={`spectrum-verdict ${row.verdict.id}`}>
                        {t(
                          `spectrum.verdicts.${row.verdict.id}`,
                          row.verdict.label,
                        )}
                      </i>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="spectrum-ranking-empty">
                {t(
                  "spectrum.rankingWaiting",
                  "Ranking will appear when valid RSSI samples are available.",
                )}
              </div>
            )}
          </div>

          <div
            className={
              displayMode === "realtime"
                ? "spectrum-chart-wrap spectrum-analyzer-wrap"
                : "spectrum-chart-wrap"
            }
          >
            <svg
              className={
                displayMode === "realtime"
                  ? "spectrum-chart spectrum-analyzer-chart"
                  : "spectrum-chart"
              }
              viewBox={`0 0 ${chart.width} ${chart.height}`}
              role="img"
              aria-label={t(
                "spectrum.realtimeAriaLabel",
                "Real-time spectrum analyzer",
              )}
            >
              <defs>
                <linearGradient id="spectrumAnalyzerFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity=".82" />
                  <stop offset="42%" stopColor="#22c55e" stopOpacity=".50" />
                  <stop offset="100%" stopColor="#16a34a" stopOpacity=".12" />
                </linearGradient>
                <linearGradient id="spectrumAnalyzerBurstFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#67e8f9" stopOpacity=".55" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity=".04" />
                </linearGradient>
              </defs>
              {/* Chart background */}
              <rect
                className="spectrum-chart-bg"
                x={chart.left}
                y={chart.top}
                width={plotWidth}
                height={plotHeight}
              />

              {displayMode === "realtime" && (
                <>
                  <g className="spectrum-analyzer-heat">
                    {realtimeWaterfallRows.map((entry, historyIndex) => {
                      const rowHeight = Math.max(
                        4,
                        plotHeight / Math.max(1, realtimeWaterfallRows.length),
                      );
                      const y =
                        chart.top +
                        plotHeight -
                        (historyIndex + 1) * rowHeight;
                      return entry.rows.map((row, rowIndex) => {
                        const currentX = xFor(row.frequency);
                        const nextFrequency =
                          entry.rows[rowIndex + 1]?.frequency ||
                          row.frequency +
                            (entry.rows[rowIndex]?.frequency -
                              (entry.rows[rowIndex - 1]?.frequency || row.frequency));
                        const nextX = xFor(nextFrequency);
                        return (
                          <rect
                            key={`rt-${entry.timestamp}-${row.id}`}
                            x={Math.min(currentX, nextX)}
                            y={y}
                            width={Math.max(3, Math.abs(nextX - currentX))}
                            height={Math.ceil(rowHeight + 1)}
                            fill={analyzerHeatColor(row.averageNoise)}
                          />
                        );
                      });
                    })}
                  </g>
                  <g className="spectrum-analyzer-scale" aria-hidden="true">
                    {Array.from({ length: 24 }, (_, index) => {
                      const ratio = 1 - index / 23;
                      const value = -125 + ratio * 82;
                      return (
                        <rect
                          key={`scale-${index}`}
                          x="18"
                          y={chart.top + index * (plotHeight / 24)}
                          width="13"
                          height={Math.ceil(plotHeight / 24) + 1}
                          fill={analyzerHeatColor(value)}
                        />
                      );
                    })}
                    <text x="36" y={chart.top + 10}>-40</text>
                    <text x="36" y={chart.top + plotHeight - 3}>-125</text>
                  </g>
                </>
              )}

              {/* Y-axis grid lines and labels */}
              {yTicks.map((tick) => (
                <g key={`y-${tick}`}>
                  <line
                    className="spectrum-grid-line"
                    x1={chart.left}
                    x2={chart.width - chart.right}
                    y1={yFor(tick)}
                    y2={yFor(tick)}
                  />
                  <text x={chart.left - 10} y={yFor(tick) + 4} textAnchor="end">
                    {tick.toFixed(0)}
                  </text>
                </g>
              ))}

              {/* X-axis grid lines and labels */}
              {xTicks.map((tick) => (
                <g key={`x-${tick}`}>
                  <line
                    className="spectrum-grid-line"
                    x1={xFor(tick)}
                    x2={xFor(tick)}
                    y1={chart.top}
                    y2={chart.height - chart.bottom}
                  />
                  <text
                    x={xFor(tick)}
                    y={chart.height - 18}
                    textAnchor="middle"
                  >
                    {formatFrequencyMhz(tick)}
                  </text>
                </g>
              ))}

              {/* Axis labels */}
              <text
                className="spectrum-axis-label"
                x={chart.left + plotWidth / 2}
                y={chart.height - 4}
                textAnchor="middle"
              >
                {t("spectrum.frequencyMhz", "Frequency (MHz)")}
              </text>
              <text
                className="spectrum-axis-label"
                x="14"
                y={chart.top + plotHeight / 2}
                textAnchor="middle"
                transform={`rotate(-90 14 ${chart.top + plotHeight / 2})`}
              >
                {t("spectrum.rssiDbm", "RSSI (dBm)")}
              </text>

              {currentFrequencyVisible && (
                <g
                  className="spectrum-current-frequency-marker"
                  transform={`translate(${xFor(currentFrequencyHz)} 0)`}
                >
                  <line
                    x1="0"
                    x2="0"
                    y1={chart.top}
                    y2={chart.height - chart.bottom}
                  />
                  <rect x="-55" y={chart.top + 8} width="110" height="22" rx="7" />
                  <text x="0" y={chart.top + 23} textAnchor="middle">
                    {t("spectrum.current", "Current")}{" "}
                    {formatFrequency(currentFrequencyHz)}
                  </text>
                </g>
              )}

              {/* Average noise line */}
              {hasChartData && (
                <>
                  {displayMode === "realtime" && (
                    <path
                      className="spectrum-analyzer-fill"
                      d={areaForRows(chartRows, "averageNoise")}
                    />
                  )}
                  <polyline
                    className={
                      displayMode === "realtime"
                        ? "spectrum-line spectrum-analyzer-trace"
                        : "spectrum-line"
                    }
                    points={lineFor("averageNoise")}
                    style={{ "--series-color": SERIES_COLORS[0] }}
                  />
                </>
              )}

              {/* Burst interference line */}
              {hasChartData && (
                <>
                  {displayMode === "realtime" && (
                    <path
                      className="spectrum-analyzer-burst-fill"
                      d={areaForRows(chartRows, "burstInterference")}
                    />
                  )}
                  <polyline
                    className={
                      displayMode === "realtime"
                        ? "spectrum-line spectrum-analyzer-burst-trace"
                        : "spectrum-line"
                    }
                    points={lineFor("burstInterference")}
                    style={{ "--series-color": SERIES_COLORS[1] }}
                  />
                </>
              )}

              {showPeakHold && (
                <>
                  <polyline
                    className="spectrum-line spectrum-peak-line"
                    points={lineForRows(peakHoldRows, "averageNoise")}
                    style={{ "--series-color": "#22d3ee" }}
                  />
                  <polyline
                    className="spectrum-line spectrum-peak-line burst"
                    points={lineForRows(peakHoldRows, "burstInterference")}
                    style={{ "--series-color": "#f97316" }}
                  />
                </>
              )}

              {/* Data points with hover and click interactions */}
              {chartRows.map((row) => {
                const x = xFor(row.frequency);
                const averageY = yFor(row.averageNoise);
                const burstY = yFor(row.burstInterference);
                const selected =
                  row.id === selectedPointId || row.id === hoveredPointId;
                return (
                  <g key={row.id}>
                    {/* Invisible hitbox for mouse interaction */}
                    <g
                      className="spectrum-point-hitbox"
                      role="button"
                      tabIndex="0"
                      aria-label={t("spectrum.showPoint", "Show spectrum point {id}", {
                        id: row.id,
                      })}
                      onMouseEnter={() => setHoveredPointId(row.id)}
                      onMouseLeave={() => setHoveredPointId(null)}
                      onFocus={() => setHoveredPointId(row.id)}
                      onBlur={() => setHoveredPointId(null)}
                      onClick={() => setSelectedPointId(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          setSelectedPointId(row.id);
                        }
                      }}
                    >
                      <circle cx={x} cy={averageY} r="8" />
                      <circle cx={x} cy={burstY} r="8" />
                    </g>
                    {/* Average noise point */}
                    <circle
                      className={
                        selected ? "spectrum-point selected" : "spectrum-point"
                      }
                      cx={x}
                      cy={averageY}
                      r={selected ? "4.3" : "3"}
                      style={{ "--series-color": SERIES_COLORS[0] }}
                    />
                    {/* Burst interference point */}
                    <circle
                      className={
                        selected ? "spectrum-point selected" : "spectrum-point"
                      }
                      cx={x}
                      cy={burstY}
                      r={selected ? "4.3" : "3"}
                      style={{ "--series-color": SERIES_COLORS[1] }}
                    />
                  </g>
                );
              })}

              {/* Node RSSI reference lines */}
              {hasChartData &&
                selectedNodeSeries.map((node) => (
                <g key={node.id}>
                  <line
                    className="spectrum-node-reference-line"
                    x1={chart.left}
                    x2={chart.width - chart.right}
                    y1={yFor(node.value)}
                    y2={yFor(node.value)}
                    style={{ "--series-color": node.color }}
                  />
                  <text
                    className="spectrum-node-reference-label"
                    x={chart.width - chart.right - 6}
                    y={yFor(node.value) - 5}
                    textAnchor="end"
                    style={{ "--series-color": node.color }}
                  >
                    {node.label}
                  </text>
                </g>
              ))}

              {!hasChartData && (
                <g className="spectrum-empty-state">
                  <circle
                    cx={chart.left + plotWidth / 2}
                    cy={chart.top + plotHeight / 2 - 36}
                    r="22"
                  />
                  <text
                    x={chart.left + plotWidth / 2}
                    y={chart.top + plotHeight / 2 + 4}
                    textAnchor="middle"
                  >
                    {t("spectrum.noSpectrumData", "No Spectrum Data Available")}
                  </text>
                  <text
                    x={chart.left + plotWidth / 2}
                    y={chart.top + plotHeight / 2 + 26}
                    textAnchor="middle"
                  >
                    {t(
                      "spectrum.clickRefresh",
                      "Click Refresh to analyze RSSI samples.",
                    )}
                  </text>
                </g>
              )}

              {/* Hover tooltip: Detailed point information */}
              {hoveredPoint && (
                <g
                  className="spectrum-point-card"
                  transform={`translate(${hoveredPointPanel.x} ${hoveredPointPanel.y})`}
                >
                  <rect width="218" height="96" rx="8" />
                  <text x="10" y="18">
                    {t("spectrum.frequency", "Frequency")}{" "}
                    {formatFrequency(hoveredPoint.frequency)}
                  </text>
                  <text x="10" y="40">
                    {t("spectrum.avgNoise", "Avg Noise")}{" "}
                    {formatDbm(hoveredPoint.averageNoise)}
                  </text>
                  <text x="10" y="62">
                    {t("spectrum.burstRssi", "Burst RSSI")}{" "}
                    {formatDbm(hoveredPoint.burstInterference)}
                  </text>
                  <text x="10" y="84">
                    {t("spectrum.burst", "Burst")}{" "}
                    {formatPercent(hoveredPoint.burstRatio)}
                  </text>
                </g>
              )}
            </svg>
          </div>

          {/* Chart legend */}
          <div className="spectrum-legend">
            <span style={{ "--series-color": SERIES_COLORS[0] }}>
              {t("spectrum.averageNoiseRssi", "Average noise RSSI")}
            </span>
            <span style={{ "--series-color": SERIES_COLORS[1] }}>
              {t("spectrum.burstInterferenceRssi", "Burst interference RSSI")}
            </span>
            {showPeakHold && (
              <>
                <span style={{ "--series-color": "#22d3ee" }}>
                  {t("spectrum.peakAverageNoise", "Peak avg noise")}
                </span>
                <span style={{ "--series-color": "#f97316" }}>
                  {t("spectrum.peakBurstRssi", "Peak burst RSSI")}
                </span>
              </>
            )}
            {selectedNodeSeries.map((node) => (
              <span key={node.id} style={{ "--series-color": node.color }}>
                {node.label} {t("spectrum.rssi", "RSSI")} {formatDbm(node.value)}
              </span>
            ))}
          </div>

          {/* Empty state */}
        </div>
      </div>
    </section>
  );
}

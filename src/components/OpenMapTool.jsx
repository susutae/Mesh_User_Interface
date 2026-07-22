/**
 * OpenMapTool Component - Interactive Map Visualization for Mesh Network Nodes
 *
 * This component provides a geographic visualization of mesh network nodes
 * using the Maptalks library. It displays nodes on an interactive map with
 * OpenStreetMap-based tiles and provides range calculation between nodes.
 *
 * Features:
 * - Interactive map with multiple base layers (Roadmap, Terrain, Satellite, Hybrid)
 * - Node markers with click-to-select functionality
 * - GPS coordinate validation and display
 * - Distance calculation between nodes using Haversine formula
 * - AI-assisted range analysis with nearest/farthest/average distances
 * - External OpenStreetMap link integration
 * - Responsive sidebar with node list and details
 * - Auto-fit map to show all nodes on load
 */

import { useEffect, useMemo, useRef, useState } from "react";
import "maptalks/dist/maptalks.css";
import { postJson, requestJson as fetchJson } from "../api/deviceApi.js";
import { useI18n } from "../i18n/index.js";
import GpsPresetPanel from "./map/GpsPresetPanel.jsx";
import GpsPresetReviewModal from "./map/GpsPresetReviewModal.jsx";
import MapNodeInfoCard from "./map/MapNodeInfoCard.jsx";
import MapNodeSidebar from "./map/MapNodeSidebar.jsx";
import MapToolbar from "./map/MapToolbar.jsx";
import { useMaptalksMap } from "./map/useMaptalksMap.js";
import {
  DEFAULT_MAP_CENTER,
  MAP_LAYER_OPTIONS,
  OFFLINE_MAP_EXPORT_TYPE,
  OFFLINE_MAP_CALIBRATION_KEY,
  OFFLINE_MAP_IMAGE_KEY,
  OFFLINE_MAP_IMAGE_META_KEY,
  OFFLINE_MAP_VIEW_KEY,
  buildRangeSummary,
  createOfflineCalibration,
  distanceKmBetweenCoordinates,
  formatAltitude,
  formatCoord,
  getBestSnrBetweenNodes,
  isCoordinateValid,
  isOfflineCalibrationValid,
  loadConfiguredNodeName,
  projectNodeToOfflineImage,
  readStoredOfflineCalibration,
  readStoredOfflineImage,
  readStoredOfflineImageMeta,
  snrColor,
  snrLabel,
} from "./map/mapUtils.js";

function resolveOfflineImageMeta(imageData, fileName = "") {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        fileName,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        capturedAt: new Date().toISOString(),
      });
    };
    image.onerror = () => {
      resolve({
        fileName,
        capturedAt: new Date().toISOString(),
      });
    };
    image.src = imageData;
  });
}

function clampNumber(value, min, max, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(max, Math.max(min, numericValue));
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function estimateCoverageRadiusKm({ frequencyMhz, outputPowerDbm }) {
  if (!Number.isFinite(frequencyMhz) || !Number.isFinite(outputPowerDbm)) return null;
  // Conservative planning assumptions; this remains an estimate because
  // terrain, antenna height, obstruction, and interference are not modeled.
  const receiverSensitivityDbm = -98;
  const fadeMarginDb = 15;
  const antennaGainDb = 2;
  const cableLossDb = 1;
  const maxPathLossDb =
    outputPowerDbm + antennaGainDb - cableLossDb + antennaGainDb - cableLossDb -
    receiverSensitivityDbm - fadeMarginDb;
  const distanceKm = 10 ** (
    (maxPathLossDb - 32.44 - 20 * Math.log10(Math.max(1, frequencyMhz))) / 20
  );
  return Number.isFinite(distanceKm)
    ? Math.min(200, Math.max(0.1, distanceKm))
    : null;
}

async function loadNodeRfProfile(node, protocol, signal) {
  if (!node?.ip) return [node?.id, null];
  const nodeBaseUrl = `${protocol}://${node.ip}`;
  const read = async (path) => {
    try {
      return await fetchJson(`${nodeBaseUrl}${path}`, signal);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return null;
    }
  };
  const [defaultResult, listResult, maxPowerResult, attenuationResult] =
    await Promise.all([
      read("/config?content=freqDefault"),
      read("/config?content=freqList"),
      read("/deviceinfo?content=powerMaxAtten"),
      read("/config?content=pwAtten1"),
    ]);
  const frequencyList = Array.isArray(listResult?.freqList) ? listResult.freqList : [];
  const defaultValue = numberValue(defaultResult?.freqDefault);
  const frequencyHz =
    frequencyList[defaultValue ?? 0] ??
    (defaultValue > 1_000_000 ? defaultValue : null);
  const frequencyMhz = frequencyHz ? frequencyHz / 1_000_000 : null;
  const maxPowerDbm = numberValue(maxPowerResult?.powerMaxAtten);
  const attenuationDb = numberValue(attenuationResult?.pwAtten1) ?? 0;
  const outputPowerDbm = maxPowerDbm === null ? null : maxPowerDbm - attenuationDb;
  return [node.id, {
    frequencyMhz,
    outputPowerDbm,
    estimatedRadiusKm: estimateCoverageRadiusKm({ frequencyMhz, outputPowerDbm }),
  }];
}

function buildOfflineCoverageCircle(offlineCalibration, node, position, radiusKm) {
  const latitude = Number(node.latitude);
  const longitude = Number(node.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const metersPerDegree = 111_320;
  const longitudeScale = Math.max(0.12, Math.cos((latitude * Math.PI) / 180));
  const longitudeOffset = (radiusKm * 1000) / (metersPerDegree * longitudeScale);
  const edgePosition = projectNodeToOfflineImage(offlineCalibration, {
    ...node,
    longitude: longitude + longitudeOffset,
  });
  const radius = Math.abs((edgePosition?.x ?? position.x) - position.x) * 100;
  return Math.max(2.5, Math.min(80, radius || radiusKm));
}

/**
 * OpenMapTool Component - Main map visualization component.
 *
 * Manages map initialization, node data fetching, marker rendering,
 * and user interactions with the map and sidebar.
 *
 * Props:
 * @param {string} deviceIp - IP address of the target device
 * @param {string} [protocol="http"] - Connection protocol
 *
 * @returns {JSX.Element} The rendered map tool
 */
export default function OpenMapTool({ deviceIp, protocol = "http" }) {
  const { t } = useI18n();
  const gpsPresetFields = useMemo(
    () => [
      {
        key: "presetLatitude",
        label: t("configuration.fields.presetLatitude", "Preset Latitude"),
        format: formatCoord,
      },
      {
        key: "presetLongitude",
        label: t("configuration.fields.presetLongitude", "Preset Longitude"),
        format: formatCoord,
      },
      {
        key: "presetAltitude",
        label: t("configuration.fields.presetAltitude", "Preset Altitude"),
        format: formatAltitude,
      },
    ],
    [t],
  );
  // --- Refs ---
  const offlineFileInputRef = useRef(null);

  // --- Component States ---
  const [nodes, setNodes] = useState([]);
  const [rfProfiles, setRfProfiles] = useState({});
  const [linkQuality, setLinkQuality] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [layer, setLayer] = useState("roadmap");
  const [showSnrLinks, setShowSnrLinks] = useState(true);
  const [coverageEnabled, setCoverageEnabled] = useState(false);
  const [coverageUseRfEstimate, setCoverageUseRfEstimate] = useState(true);
  const [coverageRadiusKm, setCoverageRadiusKm] = useState(3);
  const [coverageOpacity, setCoverageOpacity] = useState(0.22);
  // Planner state is intentionally separate from live device nodes. Nothing
  // in this mode is posted to a device; it is a placement simulation only.
  const [plannerMode, setPlannerMode] = useState(false);
  const [plannerAction, setPlannerAction] = useState("nodes");
  const [plannerFrequencyMhz, setPlannerFrequencyMhz] = useState(1320);
  const [plannerPowerDbm, setPlannerPowerDbm] = useState(30);
  const [plannerAreaRadiusKm, setPlannerAreaRadiusKm] = useState(1.5);
  const [plannerAreaCenter, setPlannerAreaCenter] = useState(null);
  const [plannedPoints, setPlannedPoints] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [offlineImage, setOfflineImage] = useState(readStoredOfflineImage);
  const [offlineImageMeta, setOfflineImageMeta] = useState(readStoredOfflineImageMeta);
  const [offlineCalibration, setOfflineCalibration] = useState(
    readStoredOfflineCalibration,
  );
  const [offlineMessage, setOfflineMessage] = useState("");
  const [mapManagementOpen, setMapManagementOpen] = useState(false);
  const [measurementMode, setMeasurementMode] = useState(false);
  const [measurementPoints, setMeasurementPoints] = useState([]);
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [calibrationDraft, setCalibrationDraft] = useState([]);
  const [calibrationPoint, setCalibrationPoint] = useState(null);
  const [presetMode, setPresetMode] = useState(false);
  const [presetDraft, setPresetDraft] = useState(null);
  const [presetReview, setPresetReview] = useState(null);
  const [presetStatus, setPresetStatus] = useState("");
  const [presetBusy, setPresetBusy] = useState(false);
  const presetModeRef = useRef(false);
  const selectedNodeRef = useRef(null);

  // Normalised device API base URL
  const baseUrl = useMemo(
    () => `${protocol}://${deviceIp}`.replace(/\/$/, ""),
    [deviceIp, protocol],
  );

  /**
   * Loads node data from the device API.
   * Fetches node infos and resolves configured names for each node.
   *
   * @param {AbortSignal} signal - Abort signal
   */
  async function load(signal) {
    setStatus((current) => (current === "success" ? "refreshing" : "loading"));
    try {
      const [result, linkResult] = await Promise.all([
        fetchJson(`${baseUrl}/status?content=nodeInfos`, signal),
        fetchJson(`${baseUrl}/status?content=linkQuality`, signal).catch(
          (requestError) => {
            if (requestError?.name === "AbortError") throw requestError;
            return { linkQuality: [] };
          },
        ),
      ]);
      const nodeInfos = Array.isArray(result?.nodeInfos)
        ? result.nodeInfos
        : [];
      const namedNodes = await Promise.all(
        nodeInfos.map((node, linkIndex) =>
          loadConfiguredNodeName({ ...node, linkIndex }, protocol, signal),
        ),
      );
      setNodes([...namedNodes].sort((a, b) => Number(a.id) - Number(b.id)));
      const profiles = await Promise.all(
        namedNodes.map((node) => loadNodeRfProfile(node, protocol, signal)),
      );
      setRfProfiles(Object.fromEntries(profiles.filter(([, profile]) => profile)));
      setLinkQuality(
        Array.isArray(linkResult?.linkQuality) ? linkResult.linkQuality : [],
      );
      setStatus("success");
      setError("");
    } catch (requestError) {
      if (requestError?.name === "AbortError") return;
      setStatus("error");
      setError(requestError?.message || "Unable to load node locations.");
    }
  }

  // Initial data load
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [baseUrl]);

  // Computed values
  const validNodes = useMemo(() => nodes.filter(isCoordinateValid), [nodes]);
  const selectedNode = nodes.find(
    (node) => String(node.id) === String(selectedNodeId),
  );
  const rangeSummary = useMemo(
    () => buildRangeSummary(validNodes, selectedNode),
    [selectedNode, validNodes],
  );
  const isCalibratedOffline =
    layer === "offline" &&
    Boolean(offlineImage) &&
    isOfflineCalibrationValid(offlineCalibration);
  const calibratedNodePositions = useMemo(() => {
    if (!isCalibratedOffline) return [];
    return validNodes
      .map((node) => ({
        node,
        position: projectNodeToOfflineImage(offlineCalibration, node),
      }))
      .filter((entry) => entry.position?.visible);
  }, [isCalibratedOffline, offlineCalibration, validNodes]);
  const normalisedCoverageRadiusKm = clampNumber(coverageRadiusKm, 0.1, 200, 3);
  const normalisedCoverageOpacity = clampNumber(coverageOpacity, 0.08, 0.46, 0.22);
  const coveragePoints = useMemo(() => {
    if (!coverageEnabled) return [];
    return validNodes.map((node) => ({
      nodeId: node.id,
      nodeName: node.name || `node${node.id}`,
      latitude: node.latitude,
      longitude: node.longitude,
      radiusKm:
        coverageUseRfEstimate && rfProfiles[node.id]?.estimatedRadiusKm
          ? rfProfiles[node.id].estimatedRadiusKm
          : normalisedCoverageRadiusKm,
      radiusMeters:
        (coverageUseRfEstimate && rfProfiles[node.id]?.estimatedRadiusKm
          ? rfProfiles[node.id].estimatedRadiusKm
          : normalisedCoverageRadiusKm) * 1000,
      frequencyMhz: rfProfiles[node.id]?.frequencyMhz ?? null,
      outputPowerDbm: rfProfiles[node.id]?.outputPowerDbm ?? null,
      estimated: Boolean(
        coverageUseRfEstimate && rfProfiles[node.id]?.estimatedRadiusKm,
      ),
    }));
  }, [
    coverageEnabled,
    coverageUseRfEstimate,
    normalisedCoverageRadiusKm,
    rfProfiles,
    validNodes,
  ]);
  const mapCenter =
    selectedNode && isCoordinateValid(selectedNode)
      ? selectedNode
      : validNodes[0] || DEFAULT_MAP_CENTER;
  const measureDistanceKm = useMemo(() => {
    if (measurementPoints.length !== 2) return null;
    return distanceKmBetweenCoordinates(measurementPoints[0], measurementPoints[1]);
  }, [measurementPoints]);
  const plannerRadiusKm = useMemo(
    () => estimateCoverageRadiusKm({
      frequencyMhz: numberValue(plannerFrequencyMhz),
      outputPowerDbm: numberValue(plannerPowerDbm),
    }) || 0.1,
    [plannerFrequencyMhz, plannerPowerDbm],
  );
  const plannedNodes = useMemo(
    () => plannedPoints.map((point) => ({
      ...point,
      radiusKm: plannerRadiusKm,
      radiusMeters: plannerRadiusKm * 1000,
      frequencyMhz: numberValue(plannerFrequencyMhz),
      outputPowerDbm: numberValue(plannerPowerDbm),
    })),
    [plannedPoints, plannerFrequencyMhz, plannerPowerDbm, plannerRadiusKm],
  );
  const plannerCoverageAnalysis = useMemo(() => {
    if (!plannerMode) return null;

    const targetRadiusKm = clampNumber(plannerAreaRadiusKm, 0.1, 200, 1.5);
    const nodeRadiusKm = Math.max(0.1, plannerRadiusKm);
    if (!plannerAreaCenter) {
      return {
        state: "needs-area",
        plannedCount: plannedNodes.length,
        targetRadiusKm,
        nodeRadiusKm,
        reachKm: 0,
      };
    }

    if (!plannedNodes.length) {
      return {
        state: "needs-nodes",
        plannedCount: 0,
        targetRadiusKm,
        nodeRadiusKm,
        reachKm: 0,
      };
    }

    const furthestNodeKm = Math.max(
      ...plannedNodes.map((node) =>
        distanceKmBetweenCoordinates(plannerAreaCenter, node),
      ),
    );
    const reachKm = furthestNodeKm + nodeRadiusKm;
    return {
      state: reachKm >= targetRadiusKm ? "ready" : "edge-gap",
      plannedCount: plannedNodes.length,
      targetRadiusKm,
      nodeRadiusKm,
      reachKm,
      edgeMarginKm: reachKm - targetRadiusKm,
    };
  }, [plannerAreaCenter, plannerAreaRadiusKm, plannerMode, plannerRadiusKm, plannedNodes]);
  

  useEffect(() => {
    presetModeRef.current = presetMode;
    selectedNodeRef.current = selectedNode || null;
  }, [presetMode, selectedNode]);

  const {
    fitMapToNodes,
    getCurrentMapView,
    mapContainerRef,
    recenterMap,
    restoreMapView,
    selectNodeOnMap,
    zoom,
    zoomIn,
    zoomOut,
  } = useMaptalksMap({
    coverageEnabled,
    coverageOpacity: normalisedCoverageOpacity,
    coveragePoints,
    plannerMode,
    plannerAction,
    plannedNodes,
    plannerAreaCenter,
    plannerAreaRadiusKm: clampNumber(plannerAreaRadiusKm, 0.1, 200, 1.5),
    layer,
    linkQuality,
    onPresetCoordinate: (coordinate) => {
      if (!presetModeRef.current) return;
      buildPresetDraft(coordinate, "map");
    },
    onMeasureCoordinate: (coordinate) => {
      if (!measurementMode) return;
      setMeasurementPoints((current) =>
        current.length >= 2 ? [current[1], coordinate] : [...current, coordinate],
      );
    },
    onPlanCoordinate: (coordinate) => {
      if (plannerAction === "area") {
        setPlannerAreaCenter({ x: coordinate.x, y: coordinate.y });
        return;
      }
      setPlannedPoints((current) => [
        ...current,
        { id: `P${current.length + 1}`, x: coordinate.x, y: coordinate.y },
      ]);
    },
    measurePoints: measurementPoints,
    onSetLayer: setLayer,
    presetDraft,
    selectedNode,
    selectedNodeId,
    setSelectedNodeId,
    showSnrLinks,
    suppressVectors: isCalibratedOffline,
    t,
    validNodes,
  });

  function clearMeasurement() {
    setMeasurementPoints([]);
    setMeasurementMode(false);
  }

  function clearPlanner() {
    setPlannedPoints([]);
    setPlannerAreaCenter(null);
    setPlannerMode(false);
  }

  function autoPlacePlannerNodes() {
    if (!plannerAreaCenter) {
      setOfflineMessage(t("map.setAreaBeforeAutoPlace", "Set the target area center first."));
      return;
    }

    const centerLatitude = Number(plannerAreaCenter.y);
    const centerLongitude = Number(plannerAreaCenter.x);
    const targetRadiusKm = clampNumber(plannerAreaRadiusKm, 0.1, 200, 1.5);
    const nodeRadiusKm = Math.max(0.1, plannerRadiusKm);
    const spacingKm = Math.max(0.08, nodeRadiusKm * 1.22);
    // Keep node centers inside an inset boundary. Without this margin, nodes
    // placed on the target edge appear outside the target because their own
    // coverage rings extend beyond the dashed planning circle.
    const placementMarginKm = Math.min(
      targetRadiusKm * 0.3,
      Math.max(0.25, nodeRadiusKm * 0.3),
    );
    const placementRadiusKm = Math.max(0.05, targetRadiusKm - placementMarginKm);
    // candidateX/candidateY are distances in kilometres. Convert those
    // offsets with degrees-per-kilometre, rather than degrees-per-grid-step;
    // multiplying by the latter expands the placement grid by spacingKm.
    const latitudeDegreesPerKm = 1 / 111.32;
    const longitudeDegreesPerKm = 1 / (
      111.32 * Math.max(0.12, Math.cos((centerLatitude * Math.PI) / 180))
    );
    const candidates = [];

    for (let y = -targetRadiusKm; y <= targetRadiusKm; y += spacingKm * 0.86) {
      const rowOffset = Math.abs(Math.round(y / (spacingKm * 0.86)) % 2) * spacingKm * 0.43;
      for (let x = -targetRadiusKm; x <= targetRadiusKm; x += spacingKm) {
        const candidateX = x + rowOffset;
        if ((candidateX * candidateX) + (y * y) > placementRadiusKm * placementRadiusKm) continue;
        candidates.push({
          x: centerLongitude + candidateX * longitudeDegreesPerKm,
          y: centerLatitude + y * latitudeDegreesPerKm,
        });
      }
    }

    // Generate the full in-area grid before applying the 64-node display cap.
    // Capping during the row loop would keep only the first few rows and make
    // the auto-placement appear outside or on one edge of the target area.
    const maxPlannerNodes = 64;
    const selectedCandidates = candidates.length <= maxPlannerNodes
      ? candidates
      : Array.from({ length: maxPlannerNodes }, (_, index) => {
          const candidateIndex = Math.round(
            (index * (candidates.length - 1)) / (maxPlannerNodes - 1),
          );
          return candidates[candidateIndex];
        });
    const points = selectedCandidates.map((point, index) => ({
      ...point,
      id: `P${index + 1}`,
    }));

    if (!points.length) {
      points.push({ id: "P1", x: centerLongitude, y: centerLatitude });
    }
    setPlannedPoints(points);
    setPlannerAction("nodes");
    setOfflineMessage(t("map.autoPlaceComplete", "{count} nodes placed for the target area.", {
      count: points.length,
    }));
  }

  function exportPlanner() {
    const packageData = {
      type: "agil-coverage-plan",
      version: 1,
      exportedAt: new Date().toISOString(),
      targetArea: plannerAreaCenter
        ? {
            center: plannerAreaCenter,
            radiusKm: clampNumber(plannerAreaRadiusKm, 0.1, 200, 1.5),
          }
        : null,
      assumptions: {
        frequencyMhz: numberValue(plannerFrequencyMhz),
        outputPowerDbm: numberValue(plannerPowerDbm),
        estimatedRadiusKm: plannerRadiusKm,
      },
      plannedNodes,
    };
    const blob = new Blob([JSON.stringify(packageData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `agil-coverage-plan-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setOfflineMessage(t("map.planExported", "Coverage plan exported."));
  }

  const externalMapUrl = `https://www.openstreetmap.org/?mlat=${mapCenter.latitude}&mlon=${mapCenter.longitude}#map=${zoom}/${mapCenter.latitude}/${mapCenter.longitude}`;

  function handleOfflineCanvasClick(event) {
    if (!calibrationMode || layer !== "offline" || !offlineImage) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setCalibrationPoint({
      imageX: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
      imageY: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
      latitude: "",
      longitude: "",
    });
    setOfflineMessage("");
  }

  function addCalibrationPoint() {
    if (!calibrationPoint) return;
    const latitude = Number(calibrationPoint.latitude);
    const longitude = Number(calibrationPoint.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setOfflineMessage(
        t("map.calibrationInvalidPoint", "Enter valid latitude and longitude for the calibration point."),
      );
      return;
    }

    setCalibrationDraft((current) => [
      ...current.slice(0, 2),
      {
        imageX: Number(calibrationPoint.imageX.toFixed(6)),
        imageY: Number(calibrationPoint.imageY.toFixed(6)),
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6)),
      },
    ]);
    setCalibrationPoint(null);
  }

  function useSelectedNodeForCalibration() {
    if (!selectedNode || !isCoordinateValid(selectedNode) || !calibrationPoint) {
      setOfflineMessage(
        t("map.calibrationSelectNode", "Select a mapped node to copy its GPS coordinates."),
      );
      return;
    }

    setCalibrationPoint((current) => ({
      ...current,
      latitude: formatCoord(selectedNode.latitude),
      longitude: formatCoord(selectedNode.longitude),
    }));
  }

  function saveOfflineCalibration() {
    const calibration = createOfflineCalibration(calibrationDraft);
    if (!calibration) {
      setOfflineMessage(
        t("map.calibrationNeedThree", "Add three non-collinear calibration points before saving."),
      );
      return;
    }

    setOfflineCalibration(calibration);
    window.localStorage.setItem(
      OFFLINE_MAP_CALIBRATION_KEY,
      JSON.stringify(calibration),
    );
    setCalibrationMode(false);
    setCalibrationDraft([]);
    setCalibrationPoint(null);
    setLayer("offline");
    setOfflineMessage(t("map.calibrationSaved", "Offline calibration saved."));
  }

  function clearOfflineCalibration() {
    setOfflineCalibration(null);
    setCalibrationDraft([]);
    setCalibrationPoint(null);
    window.localStorage.removeItem(OFFLINE_MAP_CALIBRATION_KEY);
    setOfflineMessage(t("map.calibrationCleared", "Offline calibration cleared."));
  }

  function startCalibrationMode() {
    if (!offlineImage) {
      setOfflineMessage(
        t("map.calibrationNeedImage", "Upload an offline image snapshot before calibration."),
      );
      return;
    }

    setLayer("offline");
    setCalibrationMode((current) => !current);
    setCalibrationDraft(offlineCalibration?.points || []);
    setCalibrationPoint(null);
    setMapManagementOpen(false);
  }

  function buildPresetDraft(coordinate, source = "map") {
    const activeNode = selectedNodeRef.current || selectedNode;
    if (!activeNode) {
      setPresetStatus(
        t("map.selectNodeForPreset", "Select a node before setting a GPS preset."),
      );
      return;
    }

    const longitude = Number(coordinate?.x ?? coordinate?.longitude);
    const latitude = Number(coordinate?.y ?? coordinate?.latitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    setPresetDraft({
      nodeId: activeNode.id,
      nodeName: activeNode.name || `node${activeNode.id}`,
      nodeIp: activeNode.ip || deviceIp,
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
      altitude: Number.isFinite(Number(activeNode.altitude))
        ? Number(Number(activeNode.altitude).toFixed(1))
        : 0,
      source,
    });
    setPresetStatus("");
  }

  function useSelectedNodeLocationAsPreset() {
    if (!selectedNode || !isCoordinateValid(selectedNode)) {
      setPresetStatus(
        t(
          "map.selectedNodeInvalidPreset",
          "Selected node does not have valid GPS coordinates.",
        ),
      );
      return;
    }
    buildPresetDraft(
      {
        latitude: selectedNode.latitude,
        longitude: selectedNode.longitude,
      },
      "node",
    );
  }

  function clearPresetDraft() {
    setPresetDraft(null);
    setPresetReview(null);
    setPresetStatus("");
  }

  async function preparePresetReview() {
    if (!presetDraft) return;
    const targetBaseUrl = `${protocol}://${presetDraft.nodeIp}`.replace(/\/$/, "");
    const controller = new AbortController();
    setPresetBusy(true);
    setPresetStatus("");
    try {
      const currentValues = {};
      const reads = await Promise.allSettled(
        gpsPresetFields.map((field) =>
          fetchJson(`${targetBaseUrl}/config?content=${field.key}`, controller.signal),
        ),
      );

      reads.forEach((result, index) => {
        const key = gpsPresetFields[index].key;
        currentValues[key] =
          result.status === "fulfilled" ? result.value?.[key] : undefined;
      });

      const nextValues = {
        presetLatitude: presetDraft.latitude,
        presetLongitude: presetDraft.longitude,
        presetAltitude: presetDraft.altitude,
      };

      setPresetReview({
        draft: { ...presetDraft },
        targetBaseUrl,
        rows: gpsPresetFields.map((field) => ({
          key: field.key,
          label: field.label,
          oldValue:
            currentValues[field.key] == null
              ? t("common.unavailable", "Unavailable")
              : field.format(currentValues[field.key]),
          newValue: field.format(nextValues[field.key]),
          value: nextValues[field.key],
        })),
      });
    } catch (requestError) {
      setPresetStatus(
        requestError?.message ||
          t("map.gpsPresetReviewFailed", "Unable to prepare GPS preset review."),
      );
    } finally {
      setPresetBusy(false);
    }
  }

  async function confirmPresetReview() {
    if (!presetReview) return;
    const controller = new AbortController();
    setPresetBusy(true);
    setPresetStatus("");
    try {
      await Promise.all(
        presetReview.rows.map((row) =>
          postJson(
            `${presetReview.targetBaseUrl}/config?content=${row.key}`,
            { [row.key]: row.value },
            controller.signal,
          ),
        ),
      );
      setPresetStatus(
        t("map.gpsPresetApplied", "GPS preset updated for node #{id}.", {
          id: presetReview.draft.nodeId,
        }),
      );
      setPresetReview(null);
      setPresetDraft(null);
      load(new AbortController().signal);
    } catch (requestError) {
      setPresetStatus(
        requestError?.message ||
          t("map.gpsPresetFailed", "Unable to apply GPS preset."),
      );
    } finally {
      setPresetBusy(false);
    }
  }

  function saveCurrentMapView() {
    const savedView = getCurrentMapView();
    if (!savedView) return;
    window.localStorage.setItem(OFFLINE_MAP_VIEW_KEY, JSON.stringify(savedView));
    setOfflineMessage(
      layer === "offline"
        ? t("map.offlineImageViewSaved", "Offline image view saved in this browser.")
        : t(
            "map.onlineMapViewSaved",
            "Current online map view saved. Browser tile cache availability depends on the map provider.",
          ),
    );
  }

  function loadSavedMapView() {
    const rawView = window.localStorage.getItem(OFFLINE_MAP_VIEW_KEY);
    if (!rawView) {
      setOfflineMessage(t("map.noSavedMapView", "No saved map view found in this browser."));
      return;
    }

    try {
      const savedView = JSON.parse(rawView);
      restoreMapView(savedView, (savedLayer) => Boolean(MAP_LAYER_OPTIONS[savedLayer]));
      setOfflineMessage(t("map.savedMapViewRestored", "Saved map view restored."));
    } catch {
      setOfflineMessage(t("map.savedMapViewUnreadable", "Saved map view could not be read."));
    }
  }

  function importOfflinePackage(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const packageData = JSON.parse(String(reader.result || "{}"));
        if (packageData.type !== OFFLINE_MAP_EXPORT_TYPE) {
          setOfflineMessage(t("map.offlinePackageUnrecognised", "Offline package format is not recognised."));
          return;
        }

        const packageImage = packageData.offlineImage || packageData.image || "";
        if (packageImage) {
          const packageImageMeta =
            packageData.imageMeta ||
            packageData.offlineImageMeta ||
            (await resolveOfflineImageMeta(packageImage, file.name));
          setOfflineImage(packageImage);
          setOfflineImageMeta(packageImageMeta);
          window.localStorage.setItem(OFFLINE_MAP_IMAGE_KEY, packageImage);
          window.localStorage.setItem(
            OFFLINE_MAP_IMAGE_META_KEY,
            JSON.stringify(packageImageMeta),
          );
        }

        const offlineView = {
          ...(packageData.view || {
            zoom,
            center: {
              longitude: DEFAULT_MAP_CENTER.longitude,
              latitude: DEFAULT_MAP_CENTER.latitude,
            },
          }),
          layer: "offline",
        };
        window.localStorage.setItem(
          OFFLINE_MAP_VIEW_KEY,
          JSON.stringify(offlineView),
        );
        restoreMapView(offlineView, (savedLayer) => Boolean(MAP_LAYER_OPTIONS[savedLayer]));

        if (isOfflineCalibrationValid(packageData.calibration)) {
          setOfflineCalibration(packageData.calibration);
          window.localStorage.setItem(
            OFFLINE_MAP_CALIBRATION_KEY,
            JSON.stringify(packageData.calibration),
          );
        } else {
          window.localStorage.removeItem(OFFLINE_MAP_CALIBRATION_KEY);
          setOfflineCalibration(null);
        }

        setLayer("offline");
        setOfflineMessage(t("map.offlinePackageImported", "Offline snapshot package imported."));
      } catch {
        setOfflineMessage(t("map.offlinePackageUnreadable", "Offline package could not be read."));
      }
    };
    reader.readAsText(file);
  }

  function handleOfflineMapUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (
      file.type === "application/json" ||
      file.name.toLowerCase().endsWith(".agilmap") ||
      file.name.toLowerCase().endsWith(".json")
    ) {
      importOfflinePackage(file);
      event.target.value = "";
      return;
    }

    if (!file.type.startsWith("image/")) {
      setOfflineMessage(t("map.uploadImageOrPackage", "Please upload an image snapshot or .agilmap package."));
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const imageData = String(reader.result || "");
      const imageMeta = await resolveOfflineImageMeta(imageData, file.name);
      setOfflineImage(imageData);
      setOfflineImageMeta(imageMeta);
      setOfflineCalibration(null);
      setCalibrationMode(false);
      setCalibrationDraft([]);
      setCalibrationPoint(null);
      try {
        window.localStorage.setItem(OFFLINE_MAP_IMAGE_KEY, imageData);
        window.localStorage.setItem(
          OFFLINE_MAP_IMAGE_META_KEY,
          JSON.stringify(imageMeta),
        );
        window.localStorage.removeItem(OFFLINE_MAP_CALIBRATION_KEY);
        setOfflineMessage(t("map.offlineImageSaved", "Offline image snapshot saved in this browser."));
      } catch {
        setOfflineMessage(t("map.offlineImageTooLarge", "Offline image is too large for browser storage."));
      }
      setLayer("offline");
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function downloadOfflineMap() {
    if (!offlineImage) {
      setOfflineMessage(t("map.uploadBeforeDownload", "Upload an offline image snapshot before downloading an offline package."));
      return;
    }

    const currentView = getCurrentMapView();
    const packageData = {
      type: OFFLINE_MAP_EXPORT_TYPE,
      version: 1,
      exportedAt: new Date().toISOString(),
      offlineImage,
      imageMeta: offlineImageMeta,
      calibration: isOfflineCalibrationValid(offlineCalibration)
        ? offlineCalibration
        : null,
      view: currentView
        ? {
            ...currentView,
            layer: "offline",
          }
        : {
            layer: "offline",
            zoom,
            center: {
              longitude: DEFAULT_MAP_CENTER.longitude,
              latitude: DEFAULT_MAP_CENTER.latitude,
            },
          },
    };
    const blob = new Blob([JSON.stringify(packageData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `agil-offline-map-${new Date()
      .toISOString()
      .slice(0, 10)}.agilmap`;
    link.click();
    URL.revokeObjectURL(url);
    setOfflineMessage(t("map.offlinePackageDownloaded", "Offline snapshot package downloaded."));
  }

  return (
    <section className="tools-card tools-map-card">
      <div className="tools-card-title">{t("tools.maptalks", "Maptalks")}</div>
      <div className="tools-card-body">
        <div className={`tools-map-workspace${plannerMode ? " is-planner" : ""}`}>
          {/* Main Map Area */}
          <div className="tools-map-main">
            <input
              ref={offlineFileInputRef}
              className="visually-hidden"
              type="file"
              accept="image/*,.agilmap,application/json"
              onChange={handleOfflineMapUpload}
            />

            <MapToolbar
              coverageEnabled={coverageEnabled}
              coverageUseRfEstimate={coverageUseRfEstimate}
              coverageOpacity={normalisedCoverageOpacity}
              coverageRadiusKm={normalisedCoverageRadiusKm}
              plannerMode={plannerMode}
              plannerAction={plannerAction}
              plannerFrequencyMhz={plannerFrequencyMhz}
              plannerPowerDbm={plannerPowerDbm}
              plannerAreaRadiusKm={plannerAreaRadiusKm}
              plannerAreaCenter={plannerAreaCenter}
              plannedNodes={plannedNodes}
              measureDistanceKm={measureDistanceKm}
              measurementMode={measurementMode}
              measurementPoints={measurementPoints}
              externalMapUrl={externalMapUrl}
              isCalibratedOffline={isCalibratedOffline}
              layer={layer}
              mapManagementOpen={mapManagementOpen}
              presetMode={presetMode}
              showSnrLinks={showSnrLinks}
              status={status}
              zoom={zoom}
              onDownloadOfflineMap={downloadOfflineMap}
              onFitMapToNodes={() => fitMapToNodes()}
              onLoadSavedMapView={loadSavedMapView}
              onOpenOfflineUpload={() => {
                offlineFileInputRef.current?.click();
                setMapManagementOpen(false);
              }}
              offlineCalibration={offlineCalibration}
              offlineImage={offlineImage}
              onRecenterMap={recenterMap}
              onRefresh={() => load(new AbortController().signal)}
              onSaveCurrentMapView={saveCurrentMapView}
              onSetCalibrationMode={startCalibrationMode}
              onClearOfflineCalibration={clearOfflineCalibration}
              onSetCoverageEnabled={setCoverageEnabled}
              onSetCoverageUseRfEstimate={setCoverageUseRfEstimate}
              onSetCoverageOpacity={setCoverageOpacity}
              onSetCoverageRadiusKm={setCoverageRadiusKm}
              onSetPlannerMode={(updater) => {
                const nextMode = typeof updater === "function" ? updater(plannerMode) : updater;
                setPlannerMode(nextMode);
                if (nextMode) {
                  setMeasurementMode(false);
                  setMeasurementPoints([]);
                  setPresetMode(false);
                }
              }}
              onSetPlannerAction={setPlannerAction}
              onSetPlannerFrequencyMhz={setPlannerFrequencyMhz}
              onSetPlannerPowerDbm={setPlannerPowerDbm}
              onSetPlannerAreaRadiusKm={setPlannerAreaRadiusKm}
              onClearPlanner={clearPlanner}
              onExportPlanner={exportPlanner}
              onAutoPlacePlanner={autoPlacePlannerNodes}
              onSetMeasurementMode={(updater) => {
                const nextMode =
                  typeof updater === "function" ? updater(measurementMode) : updater;
                setMeasurementMode(nextMode);
                setMeasurementPoints([]);
                if (nextMode) setPresetMode(false);
              }}
              onClearMeasurement={clearMeasurement}
              onSetLayer={(nextLayer) => {
                setLayer(nextLayer);
                window.requestAnimationFrame(() => fitMapToNodes());
              }}
              onSetMapManagementOpen={setMapManagementOpen}
              onSetPresetMode={(updater) => {
                const nextMode =
                  typeof updater === "function" ? updater(presetMode) : updater;
                setPresetMode(nextMode);
                setPresetStatus("");
                if (nextMode) {
                  setMeasurementMode(false);
                  setMeasurementPoints([]);
                }
              }}
              onSetShowSnrLinks={setShowSnrLinks}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
            />

            {offlineMessage && (
              <div className="tools-map-warning">
                <span>{offlineMessage}</span>
                <button
                  type="button"
                  aria-label={t("map.dismissMessage", "Dismiss map message")}
                  onClick={() => setOfflineMessage("")}
                >
                  x
                </button>
              </div>
            )}

            {calibrationMode && (
              <div className="tools-map-calibration-panel">
                <div>
                  <strong>{t("map.calibrationTitle", "Three-point calibration")}</strong>
                  <span>
                    {t(
                      "map.calibrationHint",
                      "Click three known points on the offline image and enter their GPS coordinates.",
                    )}
                  </span>
                </div>
                <div className="tools-map-calibration-points">
                  {[0, 1, 2].map((index) => {
                    const point = calibrationDraft[index];
                    return (
                      <span key={index}>
                        {point
                          ? t("map.calibrationPointSummary", "P{index}: {lat}, {lng}", {
                              index: index + 1,
                              lat: point.latitude.toFixed(6),
                              lng: point.longitude.toFixed(6),
                            })
                          : t("map.calibrationPointEmpty", "P{index}: not set", {
                              index: index + 1,
                            })}
                      </span>
                    );
                  })}
                </div>
                {calibrationPoint && (
                  <div className="tools-map-calibration-form">
                    <label>
                      {t("configuration.fields.presetLatitude", "Preset Latitude")}
                      <input
                        value={calibrationPoint.latitude}
                        onChange={(event) =>
                          setCalibrationPoint((current) => ({
                            ...current,
                            latitude: event.target.value,
                          }))
                        }
                        placeholder="1.352100"
                      />
                    </label>
                    <label>
                      {t("configuration.fields.presetLongitude", "Preset Longitude")}
                      <input
                        value={calibrationPoint.longitude}
                        onChange={(event) =>
                          setCalibrationPoint((current) => ({
                            ...current,
                            longitude: event.target.value,
                          }))
                        }
                        placeholder="103.819800"
                      />
                    </label>
                    <button type="button" onClick={useSelectedNodeForCalibration}>
                      {t("map.useSelectedNode", "Use selected node")}
                    </button>
                    <button type="button" onClick={addCalibrationPoint}>
                      {t("map.addCalibrationPoint", "Add point")}
                    </button>
                  </div>
                )}
                <div className="tools-map-calibration-actions">
                  <button type="button" onClick={() => setCalibrationMode(false)}>
                    {t("common.cancel", "Cancel")}
                  </button>
                  <button type="button" onClick={() => setCalibrationDraft([])}>
                    {t("map.resetCalibrationPoints", "Reset points")}
                  </button>
                  <button
                    type="button"
                    disabled={calibrationDraft.length !== 3}
                    onClick={saveOfflineCalibration}
                  >
                    {t("map.saveCalibration", "Save calibration")}
                  </button>
                </div>
              </div>
            )}

            <GpsPresetPanel
              presetBusy={presetBusy}
              presetDraft={presetDraft}
              presetMode={presetMode}
              presetStatus={presetStatus}
              onClearPresetDraft={clearPresetDraft}
              onPreparePresetReview={preparePresetReview}
              onUseSelectedNodeLocation={useSelectedNodeLocationAsPreset}
            />

            {layer === "offline" && !offlineImage && (
              <div className="tools-map-warning">
                <span>
                  {t(
                    "map.uploadOfflinePrompt",
                    "Upload an offline image snapshot or load a saved map view.",
                  )}
                </span>
              </div>
            )}

            {/* Map Container */}
            <div
              className={`tools-map-canvas maptalks-map-canvas map-layer-${layer}${
                calibrationMode ? " is-calibrating" : ""
              }`}
              aria-label={t("map.nodePreview", "Maptalks node preview")}
            >
              {calibrationMode && layer === "offline" && offlineImage && (
                <div className="tools-map-calibration-badge">
                  <strong>{t("map.calibrationModeBadge", "Calibration mode")}</strong>
                  <span>
                    {t("map.calibrationProgress", "Click point {current} of 3", {
                      current: Math.min(calibrationDraft.length + 1, 3),
                    })}
                  </span>
                </div>
              )}
              {layer === "offline" && offlineImage && (
                <img
                  className="tools-map-offline-image"
                  src={offlineImage}
                  alt={t("map.uploadedOfflineMap", "Uploaded offline image snapshot")}
                />
              )}
              {layer === "offline" && offlineImage && !isCalibratedOffline && (
                <div className="tools-map-offline-note">
                  {t(
                    "map.offlineSnapshotLimit",
                    "Offline image snapshot: nodes align only when the image matches the saved map view. This is not a georeferenced offline tile layer.",
                  )}
                </div>
              )}
              {layer === "offline" && offlineImage && isCalibratedOffline && (
                <div className="tools-map-offline-note calibrated">
                  {t(
                    "map.offlineCalibrated",
                    "Three-point calibration active. Nodes and SNR links use the saved calibration metadata.",
                  )}
                </div>
              )}
              <div ref={mapContainerRef} className="tools-maptalks-host" />
              {coverageEnabled && (
                <div className="tools-map-coverage-legend">
                  <strong>{t("map.coverageLegendTitle", "Coverage overlay")}</strong>
                  <span>
                    {coveragePoints.length
                      ? t("map.coverageLegendDetail", "{count} node radius overlays", {
                          count: coveragePoints.length,
                        })
                      : t("map.coverageLegendEmpty", "No mapped nodes for coverage")}
                  </span>
                  <span>
                    {coverageUseRfEstimate
                      ? t(
                          "map.coverageRfEstimateSummary",
                          "Radius estimated per node from frequency and RF output power",
                        )
                      : t("map.coverageRadiusSummary", "Radius {radius} km", {
                          radius: normalisedCoverageRadiusKm.toFixed(1),
                        })}
                  </span>
                  <em>{t("map.coverageOverlapHint", "Overlaps appear stronger.")}</em>
                </div>
              )}
              {plannerMode && (
                <div className="tools-map-planner-legend">
                  <strong>{t("map.plannerLegendTitle", "Coverage planning")}</strong>
                  <span>
                    {t("map.plannerLegendDetail", "Dashed amber rings are simulated coverage, not live device status.")}
                  </span>
                  <span>
                    {plannerAreaCenter
                      ? t("map.plannerNodeHint", "Click Place Node to add a node, or use Auto Place Nodes.")
                      : t("map.plannerSetAreaHint", "Set an area center to enable Auto Place.")}
                  </span>
                </div>
              )}
              {isCalibratedOffline && (
                <div className="tools-map-calibrated-overlay">
                  {coverageEnabled && calibratedNodePositions.length > 0 && (
                    <svg
                      className="tools-map-calibrated-coverage"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      {calibratedNodePositions
                        .map(({ node, position }) => {
                          const radius = buildOfflineCoverageCircle(
                            offlineCalibration,
                            node,
                            position,
                            coverageUseRfEstimate && rfProfiles[node.id]?.estimatedRadiusKm
                              ? rfProfiles[node.id].estimatedRadiusKm
                              : normalisedCoverageRadiusKm,
                          );
                          if (!radius) return null;
                          return (
                            <circle
                              key={node.id}
                              cx={position.x * 100}
                              cy={position.y * 100}
                              r={radius}
                              fill="#22d3ee"
                              opacity={normalisedCoverageOpacity}
                            />
                          );
                        })
                        .filter(Boolean)}
                    </svg>
                  )}
                  {showSnrLinks && calibratedNodePositions.length >= 2 && (
                    <svg
                      className="tools-map-calibrated-links"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      {calibratedNodePositions.flatMap((fromEntry, fromIndex) =>
                        calibratedNodePositions
                          .slice(fromIndex + 1)
                          .map((toEntry) => {
                            const snr = getBestSnrBetweenNodes(
                              linkQuality,
                              fromEntry.node,
                              toEntry.node,
                            );
                            if (snr === null) return null;
                            const fromName =
                              fromEntry.node.name || `node${fromEntry.node.id}`;
                            const toName =
                              toEntry.node.name || `node${toEntry.node.id}`;
                            return (
                              <line
                                key={`${fromEntry.node.id}-${toEntry.node.id}`}
                                x1={fromEntry.position.x * 100}
                                y1={fromEntry.position.y * 100}
                                x2={toEntry.position.x * 100}
                                y2={toEntry.position.y * 100}
                                stroke={snrColor(snr)}
                              >
                                <title>
                                  {`${fromName} to ${toName}: ${snr} dB (${snrLabel(snr)})`}
                                </title>
                              </line>
                            );
                          })
                          .filter(Boolean),
                      )}
                    </svg>
                  )}
                  {calibratedNodePositions.map(({ node, position }) => (
                    <button
                      key={node.id}
                      type="button"
                      className={
                        String(node.id) === String(selectedNodeId)
                          ? "tools-map-calibrated-node selected"
                          : "tools-map-calibrated-node"
                      }
                      style={{
                        left: `${position.x * 100}%`,
                        top: `${position.y * 100}%`,
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedNodeId(String(node.id));
                      }}
                      title={`${node.name || `node${node.id}`} #${node.id}`}
                    >
                      {node.id}
                    </button>
                  ))}
                </div>
              )}
              {calibrationMode && layer === "offline" && offlineImage && (
                <div
                  className="tools-map-calibration-click-layer"
                  role="button"
                  tabIndex={0}
                  aria-label={t("map.calibrationClickLayer", "Pick calibration point on offline image")}
                  onClick={handleOfflineCanvasClick}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setCalibrationPoint(null);
                  }}
                />
              )}
              {calibrationMode && calibrationPoint && (
                <span
                  className="tools-map-calibration-crosshair"
                  style={{
                    left: `${calibrationPoint.imageX * 100}%`,
                    top: `${calibrationPoint.imageY * 100}%`,
                  }}
                />
              )}

              <MapNodeInfoCard
                node={selectedNode}
                onClose={() => setSelectedNodeId("")}
              />
            </div>
          </div>

          <MapNodeSidebar
            nodes={nodes}
            rangeSummary={rangeSummary}
            plannerMode={plannerMode}
            plannerAnalysis={plannerCoverageAnalysis}
            selectedNodeId={selectedNodeId}
            validNodeCount={validNodes.length}
            onSelectNode={selectNodeOnMap}
          />
        </div>
        {error && <div className="tools-error">{error}</div>}
      </div>
      <GpsPresetReviewModal
        presetBusy={presetBusy}
        presetReview={presetReview}
        onCancel={() => setPresetReview(null)}
        onConfirm={confirmPresetReview}
      />
    </section>
  );
}

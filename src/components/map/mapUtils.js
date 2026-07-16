import * as maptalks from "maptalks";
import { requestJson as fetchJson } from "../../api/deviceApi.js";

/**
 * Formats a coordinate value to 6 decimal places.
 *
 * @param {number|string} value - Coordinate value
 * @returns {string} Formatted coordinate or "--" if invalid
 */
export function formatCoord(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(6) : "--";
}

/**
 * Formats altitude with "m" suffix.
 *
 * @param {number|string} value - Altitude in meters
 * @returns {string} Formatted altitude string
 */
export function formatAltitude(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)} m` : "--";
}

/**
 * Validates if a node has valid GPS coordinates.
 */
export function isCoordinateValid(node) {
  if (!node) return false;
  const latitude = Number(node.latitude);
  const longitude = Number(node.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return false;
  }
  return !(latitude === -90 && longitude === -180);
}

export const DEFAULT_MAP_CENTER = {
  latitude: 1.3521,
  longitude: 103.8198,
};

export const MAP_LAYER_OPTIONS = {
  offline: {
    label: "Offline Image",
    attribution: "Local offline image",
    urlTemplate:
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  },
  roadmap: {
    label: "Roadmap",
    attribution: "OpenStreetMap",
    urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c"],
  },
  terrain: {
    label: "Terrain",
    attribution: "OpenTopoMap",
    urlTemplate: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    subdomains: ["a", "b", "c"],
  },
  satellite: {
    label: "Satellite",
    attribution: "Esri World Imagery",
    urlTemplate:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  },
  hybrid: {
    label: "Hybrid",
    attribution: "Esri World Imagery",
    urlTemplate:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  },
};

export const OFFLINE_MAP_IMAGE_KEY = "agil-offline-map-image";
export const OFFLINE_MAP_IMAGE_META_KEY = "agil-offline-map-image-meta";
export const OFFLINE_MAP_VIEW_KEY = "agil-offline-map-view";
export const OFFLINE_MAP_CALIBRATION_KEY = "agil-offline-map-calibration";
export const OFFLINE_MAP_EXPORT_TYPE = "agil-offline-map";

export function readStoredOfflineImage() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(OFFLINE_MAP_IMAGE_KEY) || "";
}

export function readStoredOfflineImageMeta() {
  if (typeof window === "undefined") return null;
  try {
    const rawMeta = window.localStorage.getItem(OFFLINE_MAP_IMAGE_META_KEY);
    return rawMeta ? JSON.parse(rawMeta) : null;
  } catch {
    return null;
  }
}

export function readStoredOfflineCalibration() {
  if (typeof window === "undefined") return null;
  try {
    const rawCalibration = window.localStorage.getItem(OFFLINE_MAP_CALIBRATION_KEY);
    return rawCalibration ? JSON.parse(rawCalibration) : null;
  } catch {
    return null;
  }
}

function determinant3(matrix) {
  return (
    matrix[0][0] * (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1]) -
    matrix[0][1] * (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0]) +
    matrix[0][2] * (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0])
  );
}

function solveAffineCoefficients(points, key) {
  const base = points.map((point) => [point.imageX, point.imageY, 1]);
  const determinant = determinant3(base);
  if (Math.abs(determinant) < 1e-9) return null;

  return [0, 1, 2].map((columnIndex) => {
    const matrix = base.map((row, rowIndex) =>
      row.map((value, index) =>
        index === columnIndex ? Number(points[rowIndex][key]) : value,
      ),
    );
    return determinant3(matrix) / determinant;
  });
}

export function createOfflineCalibration(points) {
  if (!Array.isArray(points) || points.length !== 3) return null;
  const normalizedPoints = points.map((point) => ({
    imageX: Number(point.imageX),
    imageY: Number(point.imageY),
    longitude: Number(point.longitude),
    latitude: Number(point.latitude),
  }));

  const valid = normalizedPoints.every(
    (point) =>
      Number.isFinite(point.imageX) &&
      Number.isFinite(point.imageY) &&
      point.imageX >= 0 &&
      point.imageX <= 1 &&
      point.imageY >= 0 &&
      point.imageY <= 1 &&
      Number.isFinite(point.longitude) &&
      Number.isFinite(point.latitude) &&
      point.longitude >= -180 &&
      point.longitude <= 180 &&
      point.latitude >= -90 &&
      point.latitude <= 90,
  );
  if (!valid) return null;

  const longitudeCoefficients = solveAffineCoefficients(
    normalizedPoints,
    "longitude",
  );
  const latitudeCoefficients = solveAffineCoefficients(
    normalizedPoints,
    "latitude",
  );
  if (!longitudeCoefficients || !latitudeCoefficients) return null;

  const [a, b, c] = longitudeCoefficients;
  const [d, e, f] = latitudeCoefficients;
  const inverseDeterminant = a * e - b * d;
  if (Math.abs(inverseDeterminant) < 1e-12) return null;

  const corners = [
    { imageX: 0, imageY: 0 },
    { imageX: 1, imageY: 0 },
    { imageX: 0, imageY: 1 },
    { imageX: 1, imageY: 1 },
  ].map((corner) => ({
    longitude: a * corner.imageX + b * corner.imageY + c,
    latitude: d * corner.imageX + e * corner.imageY + f,
  }));

  return {
    version: 1,
    method: "three-point-affine",
    createdAt: new Date().toISOString(),
    points: normalizedPoints,
    transform: {
      longitude: { a, b, c },
      latitude: { a: d, b: e, c: f },
    },
    bounds: {
      west: Math.min(...corners.map((corner) => corner.longitude)),
      east: Math.max(...corners.map((corner) => corner.longitude)),
      south: Math.min(...corners.map((corner) => corner.latitude)),
      north: Math.max(...corners.map((corner) => corner.latitude)),
    },
  };
}

export function isOfflineCalibrationValid(calibration) {
  const transform = calibration?.transform;
  return (
    calibration?.method === "three-point-affine" &&
    Array.isArray(calibration?.points) &&
    calibration.points.length === 3 &&
    Number.isFinite(Number(transform?.longitude?.a)) &&
    Number.isFinite(Number(transform?.longitude?.b)) &&
    Number.isFinite(Number(transform?.longitude?.c)) &&
    Number.isFinite(Number(transform?.latitude?.a)) &&
    Number.isFinite(Number(transform?.latitude?.b)) &&
    Number.isFinite(Number(transform?.latitude?.c))
  );
}

export function projectNodeToOfflineImage(calibration, node) {
  if (!isOfflineCalibrationValid(calibration) || !isCoordinateValid(node)) {
    return null;
  }

  const longitude = Number(node.longitude);
  const latitude = Number(node.latitude);
  const { longitude: lng, latitude: lat } = calibration.transform;
  const a = Number(lng.a);
  const b = Number(lng.b);
  const c = Number(lng.c);
  const d = Number(lat.a);
  const e = Number(lat.b);
  const f = Number(lat.c);
  const determinant = a * e - b * d;
  if (Math.abs(determinant) < 1e-12) return null;

  const x = (e * (longitude - c) - b * (latitude - f)) / determinant;
  const y = (-d * (longitude - c) + a * (latitude - f)) / determinant;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return {
    x,
    y,
    visible: x >= 0 && x <= 1 && y >= 0 && y <= 1,
  };
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

export function distanceKmBetweenCoordinates(fromPoint, toPoint) {
  const earthRadiusKm = 6371;
  const fromLatitude = toRadians(fromPoint.latitude ?? fromPoint.y);
  const toLatitude = toRadians(toPoint.latitude ?? toPoint.y);
  const latitudeDelta = toRadians(
    Number(toPoint.latitude ?? toPoint.y) - Number(fromPoint.latitude ?? fromPoint.y),
  );
  const longitudeDelta = toRadians(
    Number(toPoint.longitude ?? toPoint.x) - Number(fromPoint.longitude ?? fromPoint.x),
  );
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    earthRadiusKm *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function distanceKmBetweenNodes(fromNode, toNode) {
  return distanceKmBetweenCoordinates(fromNode, toNode);
}

export function formatRange(distanceKm) {
  if (!Number.isFinite(distanceKm)) return "--";
  if (distanceKm < 1) return `${(distanceKm * 1000).toFixed(0)} m`;
  return `${distanceKm.toFixed(2)} km`;
}

export function buildRangeSummary(validNodes, selectedNode) {
  const pairs = [];

  validNodes.forEach((fromNode, fromIndex) => {
    validNodes.slice(fromIndex + 1).forEach((toNode) => {
      pairs.push({
        from: fromNode,
        to: toNode,
        distanceKm: distanceKmBetweenNodes(fromNode, toNode),
      });
    });
  });

  const sortedPairs = [...pairs].sort((a, b) => a.distanceKm - b.distanceKm);
  const nearestPair = sortedPairs[0] || null;
  const longestPair = sortedPairs.at(-1) || null;
  const selectedDistances =
    selectedNode && isCoordinateValid(selectedNode)
      ? validNodes
          .filter((node) => String(node.id) !== String(selectedNode.id))
          .map((node) => ({
            node,
            distanceKm: distanceKmBetweenNodes(selectedNode, node),
          }))
          .sort((a, b) => a.distanceKm - b.distanceKm)
      : [];

  return {
    hasEnoughNodes: validNodes.length >= 2,
    nearestPair,
    longestPair,
    selectedDistances,
    averageDistanceKm: pairs.length
      ? pairs.reduce((total, pair) => total + pair.distanceKm, 0) / pairs.length
      : null,
  };
}

export function createBaseLayer(layerKey) {
  const option = MAP_LAYER_OPTIONS[layerKey] || MAP_LAYER_OPTIONS.roadmap;
  return new maptalks.TileLayer("base", {
    attribution: option.attribution,
    cssFilter: layerKey === "hybrid" ? "contrast(1.04) saturate(1.1)" : "",
    subdomains: option.subdomains,
    urlTemplate: option.urlTemplate,
  });
}

export function markerSymbol(node, selected) {
  return {
    markerType: "ellipse",
    markerFill: selected ? "#ffd84d" : "#48B9D3",
    markerFillOpacity: 0.94,
    markerLineColor: selected ? "#0f172a" : "rgba(255,255,255,.88)",
    markerLineWidth: selected ? 3 : 2,
    markerWidth: selected ? 26 : 22,
    markerHeight: selected ? 26 : 22,
    textName: String(node.id),
    textFill: "#071923",
    textSize: 11,
    textWeight: "bold",
    textDy: 1,
  };
}

const EMPTY_SNR_COLOR = "rgba(148, 163, 184, 0.42)";

export function snrColor(snr) {
  const value = Number(snr);
  if (!Number.isFinite(value) || value === -10) return EMPTY_SNR_COLOR;
  if (value >= 27) return "#48B9D3";
  if (value >= 13) return "#4ade80";
  if (value >= 8) return "#facc15";
  if (value >= 3) return "#fb923c";
  return "#fb7185";
}

export function snrLabel(snr) {
  const value = Number(snr);
  if (!Number.isFinite(value) || value === -10) return "No link";
  if (value >= 27) return "Excellent";
  if (value >= 13) return "Good";
  if (value >= 8) return "Average";
  if (value >= 3) return "Fair";
  return "Poor";
}

function activeSnrValue(snr) {
  const value = Number(snr);
  return Number.isFinite(value) && value !== -10 ? value : null;
}

export function getBestSnrBetweenNodes(linkQuality, fromNode, toNode) {
  const fromIndex = Number(fromNode?.linkIndex);
  const toIndex = Number(toNode?.linkIndex);
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return null;

  const values = [
    activeSnrValue(linkQuality?.[fromIndex]?.[toIndex]),
    activeSnrValue(linkQuality?.[toIndex]?.[fromIndex]),
  ].filter((value) => value !== null);

  if (!values.length) return null;
  return Math.max(...values);
}

export async function loadConfiguredNodeName(node, protocol, signal) {
  if (!node?.ip) return node;
  try {
    const result = await fetchJson(
      `${protocol}://${node.ip}/config?content=name`,
      signal,
    );
    const configuredName =
      typeof result?.name === "string" ? result.name.trim() : "";
    return {
      ...node,
      name: configuredName || node.name || `node${node.id}`,
    };
  } catch (requestError) {
    if (requestError?.name === "AbortError") throw requestError;
    return {
      ...node,
      name: node.name || `node${node.id}`,
    };
  }
}

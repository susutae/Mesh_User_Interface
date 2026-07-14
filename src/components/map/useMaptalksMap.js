import { useCallback, useEffect, useRef, useState } from "react";
import * as maptalks from "maptalks";
import {
  DEFAULT_MAP_CENTER,
  createBaseLayer,
  getBestSnrBetweenNodes,
  isCoordinateValid,
  markerSymbol,
  snrColor,
  snrLabel,
} from "./mapUtils.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function useMaptalksMap({
  coverageEnabled = false,
  coverageOpacity = 0.22,
  coveragePoints = [],
  layer,
  linkQuality,
  onPresetCoordinate,
  onSetLayer,
  presetDraft,
  selectedNode,
  selectedNodeId,
  setSelectedNodeId,
  showSnrLinks,
  suppressVectors = false,
  t,
  validNodes,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const coverageLayerRef = useRef(null);
  const linkLayerRef = useRef(null);
  const markerLayerRef = useRef(null);
  const presetLayerRef = useRef(null);
  const presetCoordinateRef = useRef(onPresetCoordinate);
  const validNodeSignature = validNodes.map((node) => node.id).join("|");
  const [zoom, setZoom] = useState(13);
  const [hasAutoFitted, setHasAutoFitted] = useState(false);

  useEffect(() => {
    presetCoordinateRef.current = onPresetCoordinate;
  }, [onPresetCoordinate]);

  const fitMapToNodes = useCallback(
    (nodesToFit = validNodes) => {
      const map = mapRef.current;
      if (!map) return;

      if (!nodesToFit.length) {
        map.setCenterAndZoom(
          [DEFAULT_MAP_CENTER.longitude, DEFAULT_MAP_CENTER.latitude],
          12,
        );
        setZoom(12);
        return;
      }

      if (nodesToFit.length === 1) {
        const node = nodesToFit[0];
        map.setCenterAndZoom([Number(node.longitude), Number(node.latitude)], 16);
        setZoom(16);
        return;
      }

      const longitudes = nodesToFit.map((node) => Number(node.longitude));
      const latitudes = nodesToFit.map((node) => Number(node.latitude));
      const extent = new maptalks.Extent({
        xmin: Math.min(...longitudes),
        ymin: Math.min(...latitudes),
        xmax: Math.max(...longitudes),
        ymax: Math.max(...latitudes),
      });

      map.fitExtent(extent, -1, { animation: true });
      setZoom(map.getZoom());
    },
    [validNodes],
  );

  const recenterMap = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextCenter = isCoordinateValid(selectedNode)
      ? selectedNode
      : validNodes[0] || DEFAULT_MAP_CENTER;
    map.setCenterAndZoom(
      [Number(nextCenter.longitude), Number(nextCenter.latitude)],
      map.getZoom(),
    );
  }, [selectedNode, validNodes]);

  const getCurrentMapView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return null;
    const center = map.getCenter();
    return {
      layer,
      zoom: map.getZoom(),
      center: {
        longitude: center.x,
        latitude: center.y,
      },
      savedAt: new Date().toISOString(),
    };
  }, [layer]);

  const restoreMapView = useCallback(
    (savedView, isKnownLayer = () => true) => {
      const nextLayer = isKnownLayer(savedView?.layer) ? savedView.layer : "roadmap";
      onSetLayer(nextLayer);
      window.requestAnimationFrame(() => {
        mapRef.current?.setCenterAndZoom(
          [
            Number(savedView?.center?.longitude) || DEFAULT_MAP_CENTER.longitude,
            Number(savedView?.center?.latitude) || DEFAULT_MAP_CENTER.latitude,
          ],
          Number(savedView?.zoom) || 12,
        );
        setZoom(mapRef.current?.getZoom() ?? Number(savedView?.zoom) ?? 12);
      });
    },
    [onSetLayer],
  );

  const selectNodeOnMap = useCallback(
    (node) => {
      setSelectedNodeId(String(node.id));
      if (isCoordinateValid(node)) {
        mapRef.current?.setCenter([
          Number(node.longitude),
          Number(node.latitude),
        ]);
      }
    },
    [setSelectedNodeId],
  );

  const zoomIn = useCallback(() => {
    mapRef.current?.zoomIn();
    setZoom(mapRef.current?.getZoom() ?? zoom);
  }, [zoom]);

  const zoomOut = useCallback(() => {
    mapRef.current?.zoomOut();
    setZoom(mapRef.current?.getZoom() ?? zoom);
  }, [zoom]);

  useEffect(() => {
    setHasAutoFitted(false);
  }, [validNodeSignature]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined;

    const map = new maptalks.Map(mapContainerRef.current, {
      center: [DEFAULT_MAP_CENTER.longitude, DEFAULT_MAP_CENTER.latitude],
      zoom,
      minZoom: 2,
      maxZoom: 19,
      dragRotate: false,
      dragPitch: false,
      zoomControl: {
        position: "bottom-right",
      },
      scaleControl: {
        position: "bottom-left",
      },
      baseLayer: createBaseLayer(layer),
    });

    coverageLayerRef.current = new maptalks.VectorLayer("coverage-overlay", {
      zIndex: 1,
    }).addTo(map);
    linkLayerRef.current = new maptalks.VectorLayer("snr-links", {
      zIndex: 2,
    }).addTo(map);
    markerLayerRef.current = new maptalks.VectorLayer("node-markers", {
      zIndex: 3,
    }).addTo(map);
    presetLayerRef.current = new maptalks.VectorLayer("gps-preset", {
      zIndex: 4,
    }).addTo(map);

    map.on("zoomend", () => setZoom(map.getZoom()));
    map.on("click", (event) => presetCoordinateRef.current?.(event.coordinate));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      coverageLayerRef.current = null;
      linkLayerRef.current = null;
      markerLayerRef.current = null;
      presetLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setBaseLayer(createBaseLayer(layer));
  }, [layer]);

  useEffect(() => {
    const layerRef = coverageLayerRef.current;
    if (!layerRef) return;

    layerRef.clear();
    if (suppressVectors || !coverageEnabled || !coveragePoints.length) return;

    const geometries = coveragePoints.map((point) => {
      const circle =
        new maptalks.Circle(
          [Number(point.longitude), Number(point.latitude)],
          point.radiusMeters || 2400,
          {
            properties: {
              nodeId: point.nodeId,
            },
            symbol: {
              polygonFill: "#22d3ee",
              polygonOpacity: coverageOpacity,
              lineColor: "#67e8f9",
              lineOpacity: 0.62,
              lineWidth: 2,
            },
          },
        );

      return circle;
    });

    if (geometries.length) layerRef.addGeometry(geometries);
  }, [coverageEnabled, coverageOpacity, coveragePoints, suppressVectors, t]);

  useEffect(() => {
    const layerRef = markerLayerRef.current;
    if (!layerRef) return;

    layerRef.clear();
    if (suppressVectors) return;
    const markers = validNodes.map((node) => {
      const selected = String(node.id) === String(selectedNodeId);
      return new maptalks.Marker(
        [Number(node.longitude), Number(node.latitude)],
        {
          properties: { id: node.id },
          symbol: markerSymbol(node, selected),
        },
      ).on("click", () => setSelectedNodeId(String(node.id)));
    });

    if (markers.length) layerRef.addGeometry(markers);
  }, [selectedNodeId, setSelectedNodeId, suppressVectors, validNodes]);

  useEffect(() => {
    const layerRef = linkLayerRef.current;
    if (!layerRef) return;

    layerRef.clear();
    if (suppressVectors) return;
    if (!showSnrLinks || validNodes.length < 2) return;

    const geometries = [];

    validNodes.forEach((fromNode, fromIndex) => {
      validNodes.slice(fromIndex + 1).forEach((toNode) => {
        const snr = getBestSnrBetweenNodes(linkQuality, fromNode, toNode);
        if (snr === null) return;

        const color = snrColor(snr);
        geometries.push(
          new maptalks.LineString(
            [
              [Number(fromNode.longitude), Number(fromNode.latitude)],
              [Number(toNode.longitude), Number(toNode.latitude)],
            ],
            {
              properties: {
                snr,
                quality: snrLabel(snr),
                fromNodeId: fromNode.id,
                toNodeId: toNode.id,
              },
              symbol: {
                lineColor: color,
                lineOpacity: 0.84,
                lineWidth: 3,
                shadowBlur: 8,
                shadowColor: color,
              },
            },
          ),
        );
      });
    });

    if (geometries.length) layerRef.addGeometry(geometries);
  }, [linkQuality, showSnrLinks, suppressVectors, validNodes]);

  useEffect(() => {
    const layerRef = presetLayerRef.current;
    if (!layerRef) return;

    layerRef.clear();
    if (!presetDraft) return;

    const marker = new maptalks.Marker(
      [presetDraft.longitude, presetDraft.latitude],
      {
        symbol: {
          markerType: "pin",
          markerFill: "#facc15",
          markerLineColor: "#0f172a",
          markerLineWidth: 2,
          markerWidth: 28,
          markerHeight: 34,
          textName: t("map.presetShort", "Preset"),
          textFill: "#fde68a",
          textSize: 10,
          textWeight: "bold",
          textDy: -28,
        },
      },
    );
    layerRef.addGeometry(marker);
  }, [presetDraft, t]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !validNodes.length || hasAutoFitted) return;
    window.requestAnimationFrame(() => {
      map.checkSize();
      fitMapToNodes(validNodes);
      setHasAutoFitted(true);
    });
  }, [fitMapToNodes, hasAutoFitted, validNodes]);

  return {
    fitMapToNodes,
    getCurrentMapView,
    mapContainerRef,
    recenterMap,
    restoreMapView,
    selectNodeOnMap,
    zoom,
    zoomIn,
    zoomOut,
  };
}

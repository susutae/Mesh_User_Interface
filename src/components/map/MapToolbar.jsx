import { useEffect, useRef } from "react";
import { MAP_LAYER_OPTIONS } from "./mapUtils.js";
import { useI18n } from "../../i18n/index.js";

export default function MapToolbar({
  coverageEnabled = false,
  coverageUseRfEstimate = true,
  coverageOpacity = 0.22,
  coverageRadiusKm = 3,
  plannerMode = false,
  plannerAction = "nodes",
  plannerFrequencyMhz = 1320,
  plannerPowerDbm = 30,
  plannerAreaRadiusKm = 1.5,
  plannerAreaCenter = null,
  plannedNodes = [],
  measureDistanceKm = null,
  measurementMode = false,
  measurementPoints = [],
  isCalibratedOffline = false,
  layer,
  mapManagementOpen,
  onDownloadOfflineMap,
  onClearOfflineCalibration,
  onFitMapToNodes,
  onLoadSavedMapView,
  onOpenOfflineUpload,
  onRecenterMap,
  onRefresh,
  onSaveCurrentMapView,
  onSetCalibrationMode,
  onSetCoverageEnabled,
  onSetCoverageUseRfEstimate,
  onSetCoverageOpacity,
  onSetCoverageRadiusKm,
  onSetPlannerMode,
  onSetPlannerAction,
  onSetPlannerFrequencyMhz,
  onSetPlannerPowerDbm,
  onSetPlannerAreaRadiusKm,
  onClearPlanner,
  onExportPlanner,
  onAutoPlacePlanner,
  onSetMeasurementMode,
  onClearMeasurement,
  onSetLayer,
  onSetMapManagementOpen,
  onSetPresetMode,
  onSetShowSnrLinks,
  onZoomIn,
  onZoomOut,
  presetMode,
  showSnrLinks,
  status,
  externalMapUrl,
  offlineCalibration,
  offlineImage,
  zoom,
}) {
  const { t } = useI18n();
  const managementRef = useRef(null);

  useEffect(() => {
    if (!mapManagementOpen) return undefined;

    function handlePointerDown(event) {
      if (!managementRef.current?.contains(event.target)) {
        onSetMapManagementOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [mapManagementOpen, onSetMapManagementOpen]);

  function runManagementAction(action) {
    action?.();
    onSetMapManagementOpen(false);
  }

  return (
    <div className="tools-map-toolbar">
      <label>
        <span>{t("map.layer", "Layer")}</span>
        <select
          value={layer}
          onChange={(event) => onSetLayer(event.target.value)}
        >
          {Object.entries(MAP_LAYER_OPTIONS).map(([id, option]) => (
            <option key={id} value={id}>
              {t(`map.layers.${id}`, option.label)}
            </option>
          ))}
        </select>
      </label>

      {isCalibratedOffline ? (
        <div className="tools-map-fixed-view">
          {t("map.calibratedFixedView", "Calibrated snapshot")}
        </div>
      ) : (
        <div
          className="tools-map-zoom"
          aria-label={t("map.zoomControls", "Map zoom controls")}
        >
          <button type="button" onClick={onZoomOut}>
            -
          </button>
          <span>{zoom.toFixed(0)}</span>
          <button type="button" onClick={onZoomIn}>
            +
          </button>
        </div>
      )}

      <div className="tools-map-toolbar-actions">
        <button
          type="button"
          className={plannerMode ? "active tools-map-planner-toggle" : "tools-map-planner-toggle"}
          onClick={() => onSetPlannerMode((current) => !current)}
        >
          {plannerMode
            ? t("map.exitPlanner", "Exit Planner")
            : t("map.planCoverage", "Plan Coverage")}
        </button>
        {plannerMode && (
          <div className="tools-map-planner-controls">
            <div className="tools-map-planner-actions" role="group" aria-label={t("map.plannerActions", "Planner actions")}>
              <button
                type="button"
                className={plannerAction === "area" ? "active" : ""}
                onClick={() => onSetPlannerAction("area")}
              >
                {t("map.setTargetArea", "Set Area Center")}
              </button>
              <button
                type="button"
                className={plannerAction === "nodes" ? "active" : ""}
                onClick={() => onSetPlannerAction("nodes")}
              >
                {t("map.placePlannedNode", "Place Node")}
              </button>
              <button
                type="button"
                disabled={!plannerAreaCenter}
                title={
                  plannerAreaCenter
                    ? t("map.autoPlaceHint", "Place a coverage grid inside the target area")
                    : t("map.setAreaBeforeAutoPlace", "Set the target area center first.")
                }
                onClick={onAutoPlacePlanner}
              >
                {t("map.autoPlace", "Auto Place Nodes")}
              </button>
              {plannedNodes.length > 0 && (
                <>
                  <button type="button" onClick={onExportPlanner}>
                    {t("map.exportPlan", "Export Plan")}
                  </button>
                  <button type="button" onClick={onClearPlanner}>
                    {t("map.clearPlan", "Clear Plan")}
                  </button>
                </>
              )}
            </div>
            <label className="tools-map-planner-number">
              <span>{t("map.plannerFrequency", "Frequency MHz")}</span>
              <input
                type="number"
                min="1"
                step="0.1"
                value={plannerFrequencyMhz}
                onChange={(event) => onSetPlannerFrequencyMhz(event.target.value)}
              />
            </label>
            <label className="tools-map-planner-number">
              <span>{t("map.plannerPower", "TX Power dBm")}</span>
              <input
                type="number"
                min="-20"
                max="80"
                step="0.1"
                value={plannerPowerDbm}
                onChange={(event) => onSetPlannerPowerDbm(event.target.value)}
              />
            </label>
            <label className="tools-map-planner-number">
              <span>{t("map.plannerAreaRadius", "Target area km")}</span>
              <input
                type="number"
                min="0.1"
                max="200"
                step="0.1"
                value={plannerAreaRadiusKm}
                onChange={(event) => onSetPlannerAreaRadiusKm(event.target.value)}
              />
            </label>
            <span className="tools-map-planner-summary">
              {t("map.plannerSummary", "{count} planned nodes · {radius} km estimated radius", {
                count: plannedNodes.length,
                radius: plannedNodes[0]?.radiusKm?.toFixed?.(2) || "--",
              })}
              {plannerAreaCenter
                ? ` · ${t("map.targetAreaSet", "target area set")}`
                : ` · ${t("map.plannerSetAreaHint", "set an area center to enable Auto Place")}`}
            </span>
          </div>
        )}
        <button
          type="button"
          className={measurementMode ? "active" : ""}
          onClick={() => onSetMeasurementMode((current) => !current)}
        >
          {measurementMode
            ? t("map.cancelMeasure", "Cancel Measure")
            : t("map.measureDistance", "Measure Distance")}
        </button>
        {measurementPoints.length > 0 && (
          <button type="button" onClick={onClearMeasurement}>
            {t("map.clearMeasure", "Clear Measure")}
          </button>
        )}
        {measurementPoints.length === 1 && (
          <span className="tools-map-measure-status">
            {t("map.measureNextPoint", "Select the second point")}
          </span>
        )}
        {measurementPoints.length === 2 && Number.isFinite(measureDistanceKm) && (
          <span className="tools-map-measure-result">
            {t("map.measureResult", "Distance: {distance}", {
              distance: formatMeasurementDistance(measureDistanceKm),
            })}
          </span>
        )}
        <label className="tools-map-coverage-toggle">
          <input
            type="checkbox"
            checked={coverageEnabled}
            onChange={(event) => onSetCoverageEnabled(event.target.checked)}
          />
          <span>{t("map.coverageOverlay", "Coverage Overlay")}</span>
        </label>
        {coverageEnabled && (
          <label className="tools-map-coverage-toggle">
            <input
              type="checkbox"
              checked={coverageUseRfEstimate}
              onChange={(event) => onSetCoverageUseRfEstimate(event.target.checked)}
            />
            <span>{t("map.coverageRfEstimate", "RF estimate")}</span>
          </label>
        )}
        {coverageEnabled && !coverageUseRfEstimate && (
          <>
            <label className="tools-map-coverage-number">
              <span>{t("map.coverageRadiusKm", "Radius (km)")}</span>
              <input
                type="number"
                min="0.1"
                max="200"
                step="0.1"
                value={coverageRadiusKm}
                onChange={(event) => onSetCoverageRadiusKm(event.target.value)}
              />
            </label>
            <label className="tools-map-coverage-range">
              <span>{t("map.coverageOpacity", "Opacity")}</span>
              <input
                type="range"
                min="0.08"
                max="0.46"
                step="0.02"
                value={coverageOpacity}
                onChange={(event) => onSetCoverageOpacity(event.target.value)}
              />
            </label>
          </>
        )}
        <button
          type="button"
          disabled={status === "loading"}
          onClick={onRefresh}
        >
          {status === "refreshing"
            ? t("common.refreshing", "Refreshing")
            : t("common.refresh", "Refresh")}
        </button>
        <button type="button" disabled={isCalibratedOffline} onClick={onFitMapToNodes}>
          {t("map.viewAll", "View All")}
        </button>
        <button type="button" disabled={isCalibratedOffline} onClick={onRecenterMap}>
          {t("map.recenter", "Recenter")}
        </button>
        <button
          type="button"
          className={showSnrLinks ? "active" : ""}
          onClick={() => onSetShowSnrLinks((current) => !current)}
        >
          {showSnrLinks ? t("map.hideSnr", "Hide SNR") : t("map.showSnr", "Show SNR")}
        </button>
        <button
          type="button"
          className={presetMode ? "active" : ""}
          onClick={() => onSetPresetMode((current) => !current)}
        >
          {presetMode
            ? t("map.exitPresetMode", "Exit Preset")
            : t("map.presetLocation", "Preset Location")}
        </button>
      </div>

      <div className="tools-map-management" ref={managementRef}>
        <button
          type="button"
          onClick={() => onSetMapManagementOpen((current) => !current)}
        >
          {t("map.mapManagement", "Map Management")}
        </button>
        {mapManagementOpen && (
          <div className="tools-map-management-menu">
            <button type="button" onClick={() => runManagementAction(onOpenOfflineUpload)}>
              {t("map.uploadOffline", "Upload Snapshot")}
            </button>
            <button type="button" onClick={() => runManagementAction(onDownloadOfflineMap)}>
              {t("map.downloadOffline", "Download Snapshot")}
            </button>
            <button type="button" onClick={() => runManagementAction(onSetCalibrationMode)}>
              {t("map.calibrateSnapshot", "Calibrate Snapshot")}
            </button>
            {offlineImage && offlineCalibration && (
              <button type="button" onClick={() => runManagementAction(onClearOfflineCalibration)}>
                {t("map.clearCalibration", "Clear Calibration")}
              </button>
            )}
            <button type="button" onClick={() => runManagementAction(onSaveCurrentMapView)}>
              {t("map.saveView", "Save View")}
            </button>
            <button type="button" onClick={() => runManagementAction(onLoadSavedMapView)}>
              {t("map.loadSaved", "Load Saved")}
            </button>
            <a
              className="tools-map-open-link"
              href={externalMapUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => onSetMapManagementOpen(false)}
            >
              {t("map.openInOsm", "Open in OSM")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function formatMeasurementDistance(distanceKm) {
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${distanceKm.toFixed(2)} km`;
}

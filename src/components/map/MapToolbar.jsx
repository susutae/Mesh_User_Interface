import { useEffect, useRef } from "react";
import { MAP_LAYER_OPTIONS } from "./mapUtils.js";
import { useI18n } from "../../i18n/index.js";

export default function MapToolbar({
  coverageEnabled = false,
  coverageOpacity = 0.22,
  coverageRadiusKm = 3,
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
  onSetCoverageOpacity,
  onSetCoverageRadiusKm,
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
        <label className="tools-map-coverage-toggle">
          <input
            type="checkbox"
            checked={coverageEnabled}
            onChange={(event) => onSetCoverageEnabled(event.target.checked)}
          />
          <span>{t("map.coverageOverlay", "Coverage Overlay")}</span>
        </label>
        {coverageEnabled && (
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

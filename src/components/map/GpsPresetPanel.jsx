import { useI18n } from "../../i18n/index.js";
import { formatAltitude, formatCoord } from "./mapUtils.js";

export default function GpsPresetPanel({
  onClearPresetDraft,
  onPreparePresetReview,
  onUseSelectedNodeLocation,
  presetBusy,
  presetDraft,
  presetMode,
  presetStatus,
}) {
  const { t } = useI18n();

  if (!presetMode && !presetDraft && !presetStatus) return null;

  return (
    <div className="tools-map-preset-panel">
      <div>
        <strong>{t("map.gpsPresetLocation", "GPS Preset Location")}</strong>
        <span>
          {presetMode
            ? t(
                "map.presetModeHint",
                "Select a node, then click the map to set its preset coordinates.",
              )
            : t(
                "map.presetModeOffHint",
                "Enable preset mode to pick a coordinate from the map.",
              )}
        </span>
      </div>
      {presetDraft && (
        <dl>
          <div>
            <dt>{t("monitor.nodeId", "Node ID")}</dt>
            <dd>#{presetDraft.nodeId}</dd>
          </div>
          <div>
            <dt>{t("monitor.nodeName", "Node Name")}</dt>
            <dd>{presetDraft.nodeName}</dd>
          </div>
          <div>
            <dt>{t("monitor.latitude", "Latitude")}</dt>
            <dd>{formatCoord(presetDraft.latitude)}</dd>
          </div>
          <div>
            <dt>{t("monitor.longitude", "Longitude")}</dt>
            <dd>{formatCoord(presetDraft.longitude)}</dd>
          </div>
          <div>
            <dt>{t("monitor.altitude", "Altitude")}</dt>
            <dd>{formatAltitude(presetDraft.altitude)}</dd>
          </div>
        </dl>
      )}
      {presetStatus && <p>{presetStatus}</p>}
      <div className="tools-map-preset-actions">
        <button
          type="button"
          disabled={!presetDraft || presetBusy}
          onClick={onPreparePresetReview}
        >
          {presetBusy
            ? t("map.preparingReview", "Preparing review")
            : t("map.reviewGpsPreset", "Review GPS Preset")}
        </button>
        <button type="button" onClick={onClearPresetDraft}>
          {t("common.clear", "Clear")}
        </button>
        <button type="button" onClick={onUseSelectedNodeLocation}>
          {t("map.useNodeLocation", "Use Node Location")}
        </button>
      </div>
    </div>
  );
}

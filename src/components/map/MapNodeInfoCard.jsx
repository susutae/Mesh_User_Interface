import { useI18n } from "../../i18n/index.js";
import { formatAltitude, formatCoord } from "./mapUtils.js";

export default function MapNodeInfoCard({ node, onClose }) {
  const { t } = useI18n();

  if (!node) return null;

  return (
    <div className="tools-map-overlay tools-map-selected">
      <div className="tools-map-selected-header">
        <span>{t("monitor.nodeInformation", "NODE INFORMATION")}</span>
        <button
          type="button"
          className="tools-map-selected-close"
          aria-label={t("monitor.closeNodeInformation", "Close node information")}
          onClick={onClose}
        >
          x
        </button>
      </div>
      <div className="tools-map-selected-body">
        <span className="tools-map-selected-section">
          {t("monitor.identity", "Identity")}
        </span>
        <dl className="tools-map-selected-details">
          <div>
            <dt>{t("monitor.nodeId", "Node ID")}</dt>
            <dd>#{node.id}</dd>
          </div>
          <div>
            <dt>{t("monitor.nodeName", "Node Name")}</dt>
            <dd>{node.name || `node${node.id}`}</dd>
          </div>
          <div>
            <dt>{t("monitor.ipAddress", "IP Address")}</dt>
            <dd>{node.ip || "--"}</dd>
          </div>
        </dl>

        <span className="tools-map-selected-section">
          {t("map.location", "Location")}
        </span>
        <dl className="tools-map-selected-details">
          <div>
            <dt>{t("monitor.latitude", "Latitude")}</dt>
            <dd>{formatCoord(node.latitude)}</dd>
          </div>
          <div>
            <dt>{t("monitor.longitude", "Longitude")}</dt>
            <dd>{formatCoord(node.longitude)}</dd>
          </div>
          <div>
            <dt>{t("monitor.altitude", "Altitude")}</dt>
            <dd>{formatAltitude(node.altitude)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

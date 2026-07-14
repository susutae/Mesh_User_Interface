import { useI18n } from "../../i18n/index.js";
import { formatRange, isCoordinateValid } from "./mapUtils.js";

export default function MapNodeSidebar({
  nodes,
  onSelectNode,
  rangeSummary,
  selectedNodeId,
  validNodeCount,
}) {
  const { t } = useI18n();

  return (
    <aside className="tools-map-side">
      <div className="tools-map-side-head">
        <strong>{t("map.nodesOnline", "Nodes Online")}</strong>
        <span>
          {t("map.mappedCount", "{valid}/{total} mapped", {
            valid: validNodeCount,
            total: nodes.length,
          })}
        </span>
      </div>

      {!nodes.length ? (
        <div className="tools-map-side-empty">
          <strong>{t("map.noMappedNodes", "No mapped nodes discovered")}</strong>
          <span>
            {t(
              "map.gpsHint",
              "Ensure GPS coordinates are configured in Network Settings.",
            )}
          </span>
        </div>
      ) : (
        <>
          {rangeSummary.hasEnoughNodes && rangeSummary.nearestPair && (
            <section className="tools-map-range-summary">
              <div className="tools-map-range-summary-title">
                <span>{t("map.rangeSummary", "Range Summary")}</span>
              </div>
              <div className="tools-map-range-row">
                <span>{t("map.nearest", "Nearest")}</span>
                <strong>
                  {t("map.nodePair", "node{from} → node{to}", {
                    from: rangeSummary.nearestPair.from.id,
                    to: rangeSummary.nearestPair.to.id,
                  })}
                </strong>
                <em>{formatRange(rangeSummary.nearestPair.distanceKm)}</em>
              </div>
              <div className="tools-map-range-row">
                <span>{t("map.average", "Average")}</span>
                <strong>{t("map.allMappedNodes", "All mapped nodes")}</strong>
                <em>{formatRange(rangeSummary.averageDistanceKm)}</em>
              </div>
            </section>
          )}

          <div className="tools-map-list">
            {nodes.map((node) => {
              const valid = isCoordinateValid(node);
              return (
                <div
                  className={
                    String(node.id) === String(selectedNodeId)
                      ? "tools-map-node selected"
                      : "tools-map-node"
                  }
                  key={node.id}
                  role="button"
                  tabIndex="0"
                  onClick={() => onSelectNode(node)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      onSelectNode(node);
                    }
                  }}
                >
                  <div>
                    <span>{t("map.nodeId", "Node ID")}</span>
                    <strong>#{node.id}</strong>
                  </div>
                  <div>
                    <span>{t("map.nodeName", "Node Name")}</span>
                    <strong>{node.name || `node${node.id}`}</strong>
                  </div>
                  {!valid && <em>{t("map.invalidGps", "Invalid GPS")}</em>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}

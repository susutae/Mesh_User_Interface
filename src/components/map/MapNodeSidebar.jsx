import { useI18n } from "../../i18n/index.js";
import { formatRange, isCoordinateValid } from "./mapUtils.js";

export default function MapNodeSidebar({
  nodes,
  onSelectNode,
  rangeSummary,
  plannerMode = false,
  plannerAnalysis = null,
  selectedNodeId,
  validNodeCount,
}) {
  const { t } = useI18n();

  return (
    <aside className={`tools-map-side${plannerMode ? " is-planner" : ""}`}>
      <div className="tools-map-side-head">
        <strong>{t("map.nodesOnline", "Nodes Online")}</strong>
        <span>
          {t("map.mappedCount", "{valid}/{total} mapped", {
            valid: validNodeCount,
            total: nodes.length,
          })}
        </span>
      </div>

      {(nodes.length || plannerMode) ? (
        <>
          <section
            className={`tools-map-insights${plannerMode ? " is-planner" : ""}`}
            aria-label={t("map.nodeInsights", "Node Insights")}
          >
            <div className="tools-map-insights-head">
              <span>{t("tools.aiAssistant", "AI Assistant")}</span>
              <strong>{t("map.nodeInsights", "Node Insights")}</strong>
            </div>
            <p>
              {validNodeCount === nodes.length
                ? t(
                    "map.allNodesGpsValid",
                    "All {count} nodes have valid GPS coordinates.",
                    { count: validNodeCount },
                  )
                : t(
                    "map.gpsStatusSummary",
                    "{valid} of {total} nodes have valid GPS coordinates.",
                    { valid: validNodeCount, total: nodes.length },
                  )}
            </p>
            {rangeSummary.hasEnoughNodes && rangeSummary.nearestPair ? (
              <div className="tools-map-insight-metrics">
                <div>
                  <span>{t("map.nearest", "Nearest")}</span>
                  <strong>
                    {formatRange(rangeSummary.nearestPair.distanceKm)}
                    <small>
                      {t("map.nodePair", "node{from} → node{to}", {
                        from: rangeSummary.nearestPair.from.id,
                        to: rangeSummary.nearestPair.to.id,
                      })}
                    </small>
                  </strong>
                </div>
                <div>
                  <span>{t("map.average", "Average")}</span>
                  <strong>{formatRange(rangeSummary.averageDistanceKm)}</strong>
                </div>
              </div>
            ) : (
              <div className="tools-map-insight-note">
                {t(
                  "map.rangeNeedsNodes",
                  "At least two mapped nodes are needed to calculate range.",
                )}
              </div>
            )}
            {plannerMode && plannerAnalysis && (
              <div className="tools-map-planner-insights">
                <div className="tools-map-planner-insights-title">
                  {t("map.plannerCoverageAnalysis", "Planner coverage analysis")}
                </div>
                <div className="tools-map-planner-insights-metrics">
                  <div>
                    <span>{t("map.plannedNodes", "Planned nodes")}</span>
                    <strong>{plannerAnalysis.plannedCount}</strong>
                  </div>
                  <div>
                    <span>{t("map.targetRadius", "Target radius")}</span>
                    <strong>{plannerAnalysis.targetRadiusKm.toFixed(2)} km</strong>
                  </div>
                  <div>
                    <span>{t("map.estimatedNodeRadius", "Node radius")}</span>
                    <strong>{plannerAnalysis.nodeRadiusKm.toFixed(2)} km</strong>
                  </div>
                </div>
                <p className={`tools-map-planner-status ${plannerAnalysis.state}`}>
                  {plannerAnalysis.state === "needs-area"
                    ? t("map.plannerNeedsArea", "Set an area center to analyze coverage.")
                    : plannerAnalysis.state === "needs-nodes"
                      ? t("map.plannerNeedsNodes", "Place or auto-place nodes to analyze coverage.")
                      : plannerAnalysis.state === "ready"
                        ? t("map.plannerCoverageReady", "Planned coverage reaches the target boundary. Verify terrain and link budget before deployment.")
                        : t("map.plannerCoverageGap", "Coverage may leave an edge gap. Add nodes or increase RF output power.")}
                </p>
              </div>
            )}
          </section>

          {nodes.length ? <div className="tools-map-list">
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
          </div> : (
            <div className="tools-map-side-empty compact">
              <strong>{t("map.noMappedNodes", "No mapped nodes discovered")}</strong>
              <span>
                {t(
                  "map.gpsHint",
                  "Ensure GPS coordinates are configured in Network Settings.",
                )}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="tools-map-side-empty">
          <strong>{t("map.noMappedNodes", "No mapped nodes discovered")}</strong>
          <span>
            {t(
              "map.gpsHint",
              "Ensure GPS coordinates are configured in Network Settings.",
            )}
          </span>
        </div>
      )}
    </aside>
  );
}

import { useI18n } from "../../i18n/index.js";

export default function GpsPresetReviewModal({
  onCancel,
  onConfirm,
  presetBusy,
  presetReview,
}) {
  const { t } = useI18n();

  if (!presetReview) return null;

  return (
    <div className="configuration-modal-backdrop">
      <section className="configuration-review-modal">
        <div className="configuration-card-title">
          {t("configuration.reviewChanges", "Review Changes")}
        </div>
        <div className="configuration-review-body">
          <div className="configuration-review-summary">
            <div>
              <strong>{t("map.gpsPresetReviewTitle", "GPS Preset Changes")}</strong>
              <span>
                {t(
                  "map.gpsPresetReviewSummary",
                  "Confirm preset location values before posting them to the selected node.",
                )}
              </span>
            </div>
            <em>
              {t("map.reviewTargetNode", "Node #{id}", {
                id: presetReview.draft.nodeId,
              })}
            </em>
          </div>

          <div className="configuration-review-list">
            {presetReview.rows.map((row) => (
              <div className="configuration-review-row" key={row.key}>
                <div className="configuration-review-name">
                  <strong>{row.label}</strong>
                </div>
                <div className="configuration-review-values">
                  <span>{row.oldValue}</span>
                  <i aria-hidden="true">-&gt;</i>
                  <strong>{row.newValue}</strong>
                </div>
              </div>
            ))}
          </div>

          <div className="configuration-review-actions">
            <button
              type="button"
              className="secondary"
              disabled={presetBusy}
              onClick={onCancel}
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button type="button" disabled={presetBusy} onClick={onConfirm}>
              {presetBusy
                ? t("common.applying", "Applying")
                : t("common.confirmApply", "Confirm Apply")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

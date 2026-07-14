import { lazy, Suspense, useMemo, useState } from "react";
import { useI18n } from "../i18n/index.js";
import IperfTool from "./IperfTool.jsx";

const OpenMapTool = lazy(() => import("./OpenMapTool.jsx"));
const SpectrumTool = lazy(() => import("./SpectrumTool.jsx"));
const LinkMarginTool = lazy(() => import("./LinkMarginTool.jsx"));

export default function ToolsPage({ deviceIp, protocol = "http" }) {
  const { t } = useI18n();
  const [activeTool, setActiveTool] = useState("spectrum");

  const defaultBaseUrl = useMemo(
    () => `${protocol}://${deviceIp}`.replace(/\/$/, ""),
    [deviceIp, protocol],
  );

  return (
    <section className="tools-page">
      <header className="tools-header">
        <div>
          <h1>{t("tools.title", "Tools")}</h1>
          <p>
            {t("tools.subtitle", "{url} - network test and map utilities", {
              url: defaultBaseUrl,
            })}
          </p>
        </div>
        <div
          className="tools-tabs breadcrumb-tabs"
          role="tablist"
          aria-label={t("tools.tabsLabel", "Tools")}
        >
          {[
            ["spectrum", t("tools.spectrum", "Spectrum")],
            ["map", t("tools.maptalks", "Maptalks")],
            ["linkMargin", t("tools.linkMargin", "Link Margin")],
            ["iperf", t("tools.iperfTab", "IPERF")],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTool === id}
              className={activeTool === id ? "active" : ""}
              onClick={() => setActiveTool(id)}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>
      </header>

      {activeTool === "map" ? (
        <Suspense
          fallback={
            <div className="page-loading">
              {t("tools.loadingMap", "Loading map...")}
            </div>
          }
        >
          <OpenMapTool deviceIp={deviceIp} protocol={protocol} />
        </Suspense>
      ) : activeTool === "spectrum" ? (
        <Suspense
          fallback={
            <div className="page-loading">
              {t("tools.loadingSpectrum", "Loading spectrum...")}
            </div>
          }
        >
          <SpectrumTool deviceIp={deviceIp} protocol={protocol} />
        </Suspense>
      ) : activeTool === "linkMargin" ? (
        <Suspense
          fallback={
            <div className="page-loading">
              {t("tools.loadingLinkMargin", "Loading link margin...")}
            </div>
          }
        >
          <LinkMarginTool />
        </Suspense>
      ) : (
        <IperfTool deviceIp={deviceIp} protocol={protocol} />
      )}
    </section>
  );
}

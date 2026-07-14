import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/index.js";
import {
  buildIperfSummary,
  clearStoredIperfState,
  downloadTextFile,
  extractSessionId,
  fetchText,
  formatMetric,
  formatToolText,
  makeIperfStateStorageKey,
  readStoredIperfState,
  validateIperfConfig,
  writeStoredIperfState,
} from "./iperfUtils.js";

function Field({ label, children, hint }) {
  return (
    <label className="tools-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function formatTimestamp(value, t) {
  if (!value) return t("tools.iperf.never", "Never");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("tools.iperf.never", "Never");
  return date.toLocaleString();
}

export default function IperfTool({ deviceIp, protocol = "http" }) {
  const { t } = useI18n();
  const storageKey = useMemo(
    () => makeIperfStateStorageKey(protocol, deviceIp),
    [deviceIp, protocol],
  );
  const skipNextPersist = useRef(false);
  const [showIperfCommand, setShowIperfCommand] = useState(false);
  const [clientNodeIp, setClientNodeIp] = useState(deviceIp);
  const [serverNodeIp, setServerNodeIp] = useState("");
  const [port, setPort] = useState("");
  const [bandwidth, setBandwidth] = useState("100");
  const [duration, setDuration] = useState("60");
  const [interval, setInterval] = useState("1");
  const [clientSessionId, setClientSessionId] = useState("");
  const [serverSessionId, setServerSessionId] = useState("");
  const [clientResult, setClientResult] = useState("");
  const [serverResult, setServerResult] = useState("");
  const [clientUpdatedAt, setClientUpdatedAt] = useState("");
  const [serverUpdatedAt, setServerUpdatedAt] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const stateSnapshot = useMemo(
    () => ({
      clientNodeIp,
      serverNodeIp,
      port,
      bandwidth,
      duration,
      interval,
      clientSessionId,
      serverSessionId,
      clientResult,
      serverResult,
      clientUpdatedAt,
      serverUpdatedAt,
    }),
    [
      bandwidth,
      clientNodeIp,
      clientResult,
      clientSessionId,
      clientUpdatedAt,
      duration,
      interval,
      port,
      serverNodeIp,
      serverResult,
      serverSessionId,
      serverUpdatedAt,
    ],
  );

  useEffect(() => {
    const storedState = readStoredIperfState(storageKey);
    skipNextPersist.current = true;
    setClientNodeIp(storedState.clientNodeIp || deviceIp);
    setServerNodeIp(storedState.serverNodeIp || "");
    setPort(storedState.port || "");
    setBandwidth(storedState.bandwidth || "100");
    setDuration(storedState.duration || "60");
    setInterval(storedState.interval || "1");
    setClientSessionId(storedState.clientSessionId || "");
    setServerSessionId(storedState.serverSessionId || "");
    setClientResult(storedState.clientResult || "");
    setServerResult(storedState.serverResult || "");
    setClientUpdatedAt(storedState.clientUpdatedAt || "");
    setServerUpdatedAt(storedState.serverUpdatedAt || "");
  }, [deviceIp, storageKey]);

  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }

    writeStoredIperfState(storageKey, stateSnapshot);
  }, [stateSnapshot, storageKey]);

  const clientBaseUrl = useMemo(
    () => `${protocol}://${clientNodeIp || deviceIp}`.replace(/\/$/, ""),
    [clientNodeIp, deviceIp, protocol],
  );
  const serverBaseUrl = useMemo(
    () => `${protocol}://${serverNodeIp || deviceIp}`.replace(/\/$/, ""),
    [deviceIp, protocol, serverNodeIp],
  );

  const serverCommand = useMemo(() => {
    const portArg = port ? ` -p ${port}` : "";
    const intervalArg = interval ? ` -i ${interval}` : "";
    return `iperf -s -u${intervalArg}${portArg}`;
  }, [interval, port]);

  const clientCommand = useMemo(() => {
    const portArg = port ? ` -p ${port}` : "";
    const intervalArg = interval ? ` -i ${interval}` : "";
    return `iperf -c ${serverNodeIp || "<server-ip>"} -u${intervalArg} -t ${duration} -b ${bandwidth}m${portArg}`;
  }, [bandwidth, duration, interval, port, serverNodeIp]);

  const serverCommandLines = useMemo(
    () =>
      ["iperf", "-s", "-u", interval ? `-i ${interval}` : "", port ? `-p ${port}` : ""].filter(
        Boolean,
      ),
    [interval, port],
  );

  const clientCommandLines = useMemo(
    () =>
      [
        "iperf",
        `-c ${serverNodeIp || "<server-ip>"}`,
        "-u",
        interval ? `-i ${interval}` : "",
        `-t ${duration}`,
        `-b ${bandwidth}m`,
        port ? `-p ${port}` : "",
      ].filter(Boolean),
    [bandwidth, duration, interval, port, serverNodeIp],
  );

  const clientExecUrl = useMemo(
    () => `${clientBaseUrl}/tools/exec?command=${encodeURIComponent(clientCommand)}`,
    [clientBaseUrl, clientCommand],
  );
  const serverExecUrl = useMemo(
    () => `${serverBaseUrl}/tools/exec?command=${encodeURIComponent(serverCommand)}`,
    [serverBaseUrl, serverCommand],
  );

  const clientResultUrl = useMemo(
    () => (clientSessionId ? `${clientBaseUrl}/tools/result/${clientSessionId}` : ""),
    [clientBaseUrl, clientSessionId],
  );
  const serverResultUrl = useMemo(
    () => (serverSessionId ? `${serverBaseUrl}/tools/result/${serverSessionId}` : ""),
    [serverBaseUrl, serverSessionId],
  );

  const iperfSummary = useMemo(
    () => buildIperfSummary(clientResult, serverResult),
    [clientResult, serverResult],
  );
  const isBusy = Boolean(busyAction);

  function sideConfig(side) {
    if (side === "server") {
      return {
        nodeIp: serverNodeIp,
        execUrl: serverExecUrl,
        resultUrl: serverResultUrl,
        sessionId: serverSessionId,
        setSessionId: setServerSessionId,
        setResult: setServerResult,
        setUpdatedAt: setServerUpdatedAt,
      };
    }

    return {
      nodeIp: clientNodeIp,
      execUrl: clientExecUrl,
      resultUrl: clientResultUrl,
      sessionId: clientSessionId,
      setSessionId: setClientSessionId,
      setResult: setClientResult,
      setUpdatedAt: setClientUpdatedAt,
    };
  }

  async function startTest(side) {
    const validationError = validateIperfConfig(side, stateSnapshot, t);
    if (validationError) {
      setError(validationError);
      return;
    }

    const config = sideConfig(side);
    setError("");
    setBusyAction(`run-${side}`);
    try {
      const text = await fetchText(config.execUrl);
      const nextSessionId = extractSessionId(text);
      const formattedText = formatToolText(
        text ||
          t(
            "tools.iperf.commandSent",
            "IPERF command sent. Use the session ID to refresh results.",
          ),
      );
      if (nextSessionId) config.setSessionId(nextSessionId);
      config.setResult(formattedText);
      config.setUpdatedAt(new Date().toISOString());
    } catch (requestError) {
      setError(
        requestError?.message ||
          t(
            "tools.iperf.startFailed",
            "Unable to start IPERF. Confirm this firmware exposes /tools/exec.",
          ),
      );
    } finally {
      setBusyAction("");
    }
  }

  async function refreshResult(side) {
    const config = sideConfig(side);
    setError("");

    if (!config.sessionId.trim()) {
      setError(
        t(
          "tools.iperf.sessionRequired",
          "Session ID is required before refreshing IPERF results.",
        ),
      );
      return;
    }

    setBusyAction(`refresh-${side}`);
    try {
      const text = await fetchText(config.resultUrl);
      const formattedText = formatToolText(
        text ||
          t(
            "tools.iperf.noResultText",
            "No result text returned yet. Try refreshing again.",
          ),
      );
      config.setResult(formattedText);
      config.setUpdatedAt(new Date().toISOString());
    } catch (requestError) {
      setError(
        requestError?.message ||
          t("tools.iperf.refreshFailed", "Unable to refresh IPERF result."),
      );
    } finally {
      setBusyAction("");
    }
  }

  async function stopTest(side) {
    const validationError = validateIperfConfig(side, stateSnapshot, t);
    if (validationError) {
      setError(validationError);
      return;
    }

    const config = sideConfig(side);
    setError("");
    setBusyAction(`stop-${side}`);
    try {
      const stopBaseUrl = `${protocol}://${config.nodeIp}`.replace(/\/$/, "");
      const stopUrl = `${stopBaseUrl}/tools/exec?command=${encodeURIComponent("killall iperf")}`;
      const text = await fetchText(stopUrl);
      const formattedText = formatToolText(
        text ||
          t(
            "tools.iperf.stopSent",
            "Stop command sent to the selected node.",
          ),
      );
      config.setResult(formattedText);
      config.setUpdatedAt(new Date().toISOString());
    } catch (requestError) {
      setError(
        requestError?.message ||
          t(
            "tools.iperf.stopFailed",
            "Unable to stop IPERF. This firmware may require manual session expiry.",
          ),
      );
    } finally {
      setBusyAction("");
    }
  }

  function clearResults() {
    setClientResult("");
    setServerResult("");
    setClientUpdatedAt("");
    setServerUpdatedAt("");
    clearStoredIperfState(storageKey);
  }

  function exportResults(format) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `iperf-${deviceIp || "device"}-${timestamp}`;
    const payload = {
      deviceIp,
      clientNodeIp,
      serverNodeIp,
      port: port || "5001",
      bandwidthMbps: bandwidth,
      durationSeconds: duration,
      intervalSeconds: interval,
      clientSessionId,
      serverSessionId,
      clientUpdatedAt,
      serverUpdatedAt,
      summary: iperfSummary,
      commands: {
        client: clientCommand,
        server: serverCommand,
        clientExecUrl,
        serverExecUrl,
        clientResultUrl,
        serverResultUrl,
      },
      results: {
        server: serverResult,
        client: clientResult,
      },
    };

    if (format === "json") {
      downloadTextFile(`${baseName}.json`, JSON.stringify(payload, null, 2), "application/json");
      return;
    }

    downloadTextFile(
      `${baseName}.txt`,
      [
        t("tools.iperf.title", "IPERF UDP Test"),
        `${t("tools.iperf.device", "Device")}: ${deviceIp || "--"}`,
        `${t("tools.iperf.clientNode", "Client Node")}: ${clientNodeIp || "--"}`,
        `${t("tools.iperf.serverNode", "Server Node")}: ${serverNodeIp || "--"}`,
        `${t("tools.iperf.udpPort", "UDP Port")}: ${port || "5001"}`,
        `${t("tools.iperf.bandwidth", "Bandwidth")}: ${bandwidth || "--"} Mbps`,
        `${t("tools.iperf.duration", "Duration")}: ${duration || "--"} s`,
        `${t("tools.iperf.interval", "Interval")}: ${interval || "--"} s`,
        `${t("tools.iperf.avgUdp", "Avg UDP")}: ${formatMetric(iperfSummary.averageThroughputMbps, "Mbps")}`,
        `${t("tools.iperf.jitter", "Jitter")}: ${formatMetric(iperfSummary.jitterMs, "ms", 2)}`,
        `${t("tools.iperf.loss", "Loss")}: ${formatMetric(iperfSummary.packetLossPercent, "%", 2)}`,
        "",
        t("tools.iperf.clientCommand", "Client Command"),
        clientCommand,
        "",
        t("tools.iperf.serverCommand", "Server Command"),
        serverCommand,
        "",
        t("tools.iperf.serverResult", "Server Result"),
        serverResult || "--",
        "",
        t("tools.iperf.clientResult", "Client Result"),
        clientResult || "--",
      ].join("\n"),
    );
  }

  return (
    <section className="tools-card tools-iperf-card" aria-busy={isBusy}>
      <div className="tools-card-title">
        {t("tools.iperf.title", "IPERF UDP Test")}
      </div>
      <div className="tools-card-body">
        {/* IPERF browser API follows the PDF guide:
            /tools/exec?command=iperf ... creates a session ID,
            /tools/result/{sessionId} reads the manually refreshed output. */}
        <div className="tools-iperf-config-grid">
          <section className="tools-iperf-panel">
            <div className="tools-iperf-panel-head">
              <span>{t("tools.iperf.clientConfiguration", "Client Configuration")}</span>
              <small>{t("tools.iperf.sendingNode", "Sending node")}</small>
            </div>
            <div className="tools-grid tools-grid-single">
              <Field
                label={t("tools.iperf.clientNodeIp", "Client Node IP")}
                hint={t(
                  "tools.iperf.clientNodeHint",
                  "Sending node that executes the client command",
                )}
              >
                <input
                  value={clientNodeIp}
                  onChange={(event) => setClientNodeIp(event.target.value)}
                  placeholder="192.168.10.xx"
                />
              </Field>
              <Field
                label={t("tools.iperf.serverNodeIp", "Server Node IP")}
                hint={t(
                  "tools.iperf.serverTargetHint",
                  "Receiving node target for the client command",
                )}
              >
                <input
                  value={serverNodeIp}
                  onChange={(event) => setServerNodeIp(event.target.value)}
                  placeholder="192.168.10.xx"
                />
              </Field>
              <Field
                label={t("tools.iperf.udpPort", "UDP Port")}
                hint={t("tools.iperf.udpPortHint", "Optional, defaults to iperf port 5001")}
              >
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={port}
                  placeholder="5001"
                  onChange={(event) => setPort(event.target.value)}
                />
              </Field>
              <Field label={t("tools.iperf.bandwidth", "Bandwidth")} hint="Mbps">
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={bandwidth}
                  onChange={(event) => setBandwidth(event.target.value)}
                />
              </Field>
              <Field
                label={t("tools.iperf.sessionId", "Session ID")}
                hint={t("tools.iperf.sessionHint", "Created after run; editable for old sessions")}
              >
                <input
                  value={clientSessionId}
                  onChange={(event) => setClientSessionId(event.target.value)}
                  placeholder="15158"
                />
              </Field>
            </div>
          </section>

          <section className="tools-iperf-panel">
            <div className="tools-iperf-panel-head">
              <span>{t("tools.iperf.serverConfiguration", "Server Configuration")}</span>
              <small>{t("tools.iperf.receivingNode", "Receiving node")}</small>
            </div>
            <div className="tools-grid tools-grid-single">
              <Field
                label={t("tools.iperf.serverNodeIp", "Server Node IP")}
                hint={t(
                  "tools.iperf.serverNodeHint",
                  "Receiving node that executes the server command",
                )}
              >
                <input
                  value={serverNodeIp}
                  onChange={(event) => setServerNodeIp(event.target.value)}
                  placeholder="192.168.10.xx"
                />
              </Field>
              <Field
                label={t("tools.iperf.interval", "Interval")}
                hint={t("tools.iperf.intervalHint", "Seconds, PDF uses 1")}
              >
                <input
                  type="number"
                  min="1"
                  value={interval}
                  onChange={(event) => setInterval(event.target.value)}
                />
              </Field>
              <Field
                label={t("tools.iperf.duration", "Duration")}
                hint={t("tools.iperf.durationHint", "Seconds used by the client command")}
              >
                <input
                  type="number"
                  min="1"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                />
              </Field>
              <Field
                label={t("tools.iperf.serverSessionId", "Server Session ID")}
                hint={t("tools.iperf.sessionHint", "Created after run; editable for old sessions")}
              >
                <input
                  value={serverSessionId}
                  onChange={(event) => setServerSessionId(event.target.value)}
                  placeholder="15158"
                />
              </Field>
            </div>
          </section>
        </div>

        <div className="tools-iperf-context-strip">
          <span>
            {t("tools.iperf.serverResult", "Server Result")}:{" "}
            {formatTimestamp(serverUpdatedAt, t)}
          </span>
          <span>
            {t("tools.iperf.clientResult", "Client Result")}:{" "}
            {formatTimestamp(clientUpdatedAt, t)}
          </span>
          <span>
            {t("tools.iperf.sessionId", "Session ID")}:{" "}
            {clientSessionId || serverSessionId || "--"}
          </span>
        </div>

        <details className="tools-command-accordion" open={showIperfCommand}>
          <summary
            onClick={(event) => {
              event.preventDefault();
              setShowIperfCommand((value) => !value);
            }}
          >
            {showIperfCommand
              ? t("tools.iperf.hideCommand", "Hide Command")
              : t("tools.iperf.showCommand", "Show Command")}
          </summary>
          <div className="tools-command-grid">
            <div className="tools-command">
              <span>{t("tools.iperf.clientCommand", "Client Command")}</span>
              <div className="tools-command-lines">
                {clientCommandLines.map((line) => (
                  <code key={line}>{line}</code>
                ))}
              </div>
              <span>{t("tools.iperf.execUrl", "Exec URL")}</span>
              <code>{clientExecUrl}</code>
              {clientResultUrl && (
                <>
                  <span>{t("tools.iperf.resultUrl", "Result URL")}</span>
                  <code>{clientResultUrl}</code>
                </>
              )}
            </div>
            <div className="tools-command">
              <span>{t("tools.iperf.serverCommand", "Server Command")}</span>
              <div className="tools-command-lines">
                {serverCommandLines.map((line) => (
                  <code key={line}>{line}</code>
                ))}
              </div>
              <span>{t("tools.iperf.execUrl", "Exec URL")}</span>
              <code>{serverExecUrl}</code>
              {serverResultUrl && (
                <>
                  <span>{t("tools.iperf.resultUrl", "Result URL")}</span>
                  <code>{serverResultUrl}</code>
                </>
              )}
            </div>
          </div>
        </details>

        <div className="tools-note">
          {t(
            "tools.iperf.note",
            "Start the server on the receiving node first, then run the client on the sending node. Results are read by session ID and may need manual refresh while the test is running.",
          )}
        </div>

        {error && <div className="tools-error">{error}</div>}

        <div className="tools-actions tools-iperf-actions">
          <button type="button" disabled={isBusy} onClick={() => startTest("server")}>
            {busyAction === "run-server"
              ? t("tools.iperf.running", "Running...")
              : t("tools.iperf.runServer", "Run Server")}
          </button>
          <button type="button" disabled={isBusy} onClick={() => startTest("client")}>
            {busyAction === "run-client"
              ? t("tools.iperf.running", "Running...")
              : t("tools.iperf.runClient", "Run Client")}
          </button>
          <button type="button" disabled={isBusy} onClick={() => refreshResult("server")}>
            {busyAction === "refresh-server"
              ? t("tools.iperf.running", "Running...")
              : t("tools.iperf.refreshServer", "Refresh Server")}
          </button>
          <button type="button" disabled={isBusy} onClick={() => refreshResult("client")}>
            {busyAction === "refresh-client"
              ? t("tools.iperf.running", "Running...")
              : t("tools.iperf.refreshClient", "Refresh Client")}
          </button>
          <div className="tools-iperf-utility-actions">
            <button type="button" disabled={isBusy} onClick={() => stopTest("server")}>
              {busyAction === "stop-server"
                ? t("tools.iperf.running", "Running...")
                : t("tools.iperf.stopServer", "Stop Server")}
            </button>
            <button type="button" disabled={isBusy} onClick={() => stopTest("client")}>
              {busyAction === "stop-client"
                ? t("tools.iperf.running", "Running...")
                : t("tools.iperf.stopClient", "Stop Client")}
            </button>
            <button
              type="button"
              className="tools-secondary-action"
              disabled={!clientResult && !serverResult}
              onClick={() => exportResults("txt")}
            >
              {t("tools.iperf.exportTxt", "Export TXT")}
            </button>
            <button
              type="button"
              className="tools-secondary-action"
              disabled={!clientResult && !serverResult}
              onClick={() => exportResults("json")}
            >
              {t("tools.iperf.exportJson", "Export JSON")}
            </button>
            <button
              type="button"
              className="tools-secondary-action"
              disabled={isBusy || (!clientResult && !serverResult)}
              onClick={clearResults}
            >
              {t("tools.iperf.clearResults", "Clear Results")}
            </button>
          </div>
        </div>

        <section className="tools-live-results">
          <div className="tools-live-results-head">
            <div>
              <span>{t("tools.iperf.liveResults", "Live Results")}</span>
              <strong>
                {clientResult || serverResult
                  ? t("tools.iperf.udpSummary", "UDP throughput summary")
                  : t("tools.iperf.placeholder", "Run a test to see throughput results here.")}
              </strong>
            </div>
            {(clientResult || serverResult) && (
              <div className="tools-ai-metrics">
                <span>
                  {t("tools.iperf.avgUdp", "Avg UDP")}{" "}
                  {formatMetric(iperfSummary.averageThroughputMbps, "Mbps")}
                </span>
                <span>
                  {t("tools.iperf.samples", "Samples")} {iperfSummary.sampleCount || "--"}
                </span>
                <span>
                  {t("tools.iperf.jitter", "Jitter")}{" "}
                  {formatMetric(iperfSummary.jitterMs, "ms", 2)}
                </span>
                <span>
                  {t("tools.iperf.loss", "Loss")}{" "}
                  {formatMetric(iperfSummary.packetLossPercent, "%", 2)}
                </span>
                <span>
                  {t("tools.iperf.datagrams", "Datagrams")} {iperfSummary.datagrams ?? "--"}
                </span>
              </div>
            )}
          </div>

          {clientResult || serverResult ? (
            <>
              <section className="tools-ai-card tools-ai-card-inline">
                <div>
                  <span>{t("tools.aiAssistant", "AI Assistant")}</span>
                  <strong>
                    {t(`tools.iperf.summary.${iperfSummary.headline}`, iperfSummary.headline)}
                  </strong>
                  <p>
                    {t(
                      `tools.iperf.recommendation.${iperfSummary.headline}`,
                      iperfSummary.recommendation,
                    )}
                  </p>
                  {iperfSummary.issue && <small>{iperfSummary.issue}</small>}
                </div>
              </section>
              <div className="tools-result-grid">
                <section className="tools-result-card">
                  <div className="tools-iperf-result-title">
                    <span>{t("tools.iperf.serverResult", "Server Result")}</span>
                    <small>{formatTimestamp(serverUpdatedAt, t)}</small>
                  </div>
                  <pre className="tools-result">
                    {serverResult || t("tools.iperf.noServerResult", "No server result yet.")}
                  </pre>
                </section>
                <section className="tools-result-card">
                  <div className="tools-iperf-result-title">
                    <span>{t("tools.iperf.clientResult", "Client Result")}</span>
                    <small>{formatTimestamp(clientUpdatedAt, t)}</small>
                  </div>
                  <pre className="tools-result">
                    {clientResult || t("tools.iperf.noClientResult", "No client result yet.")}
                  </pre>
                </section>
              </div>
            </>
          ) : (
            <div className="tools-result-placeholder">
              {t("tools.iperf.placeholder", "Run a test to see throughput results here.")}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

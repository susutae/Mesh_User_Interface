import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestJson as fetchJson } from "../api/deviceApi.js";
import { useI18n } from "../i18n/index.js";

const SEVERITIES = ["All", "Info", "Warning", "Critical"];
const WEAK_SNR_WARNING_DB = 8;
const WEAK_SNR_CRITICAL_DB = 3;
const TEMPERATURE_WARNING_C = 85;
const MAX_STORED_EVENTS = 500;

function normaliseUrl(deviceIp, protocol) {
  if (!deviceIp) return "";
  return /^https?:\/\//i.test(deviceIp)
    ? deviceIp.replace(/\/$/, "")
    : `${protocol}://${deviceIp}`.replace(/\/$/, "");
}

function formatTimestamp(date = new Date()) {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function nodeLabel(node) {
  const name = node?.name || `node${node?.id ?? ""}`;
  return `${name} (#${node?.id ?? "--"})`;
}

function isInvalidGps(node) {
  const lat = Number(node?.lat);
  const lng = Number(node?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return true;
  return lat === -90 || lng === -180;
}

function deviceStatusLabel(status) {
  if (status === 1) return "up";
  if (status === 2) return "warning";
  return "down";
}

function logKey(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const normalized = word.charAt(0).toLowerCase() + word.slice(1);
      return index === 0
        ? normalized
        : normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join("");
}

function eventFingerprint(event) {
  return `${event.type}:${event.source}:${event.detail}`;
}

function eventGroupKey(event) {
  return [
    event.severity,
    event.type,
    event.source,
    event.detail,
  ].join(":");
}

function groupSimilarEvents(sortedEvents) {
  const groups = [];
  const groupByKey = new Map();

  sortedEvents.forEach((event) => {
    const key = eventGroupKey(event);
    const timestamp = Date.parse(event.timestamp || event.time) || 0;
    const existing = groupByKey.get(key);

    if (!existing) {
      const group = {
        id: `${event.id}-group`,
        event,
        count: 1,
        earliestTime: event.time,
        latestTime: event.time,
        earliestTimestamp: timestamp,
        latestTimestamp: timestamp,
      };
      groupByKey.set(key, group);
      groups.push(group);
      return;
    }

    existing.count += 1;
    if (timestamp < existing.earliestTimestamp) {
      existing.earliestTimestamp = timestamp;
      existing.earliestTime = event.time;
    }
    if (timestamp > existing.latestTimestamp) {
      existing.latestTimestamp = timestamp;
      existing.latestTime = event.time;
    }
  });

  return groups;
}

function groupedLabel(label, count) {
  return count > 1 ? `${label} × ${count}` : label;
}

function readStoredLogState(storageKey) {
  if (!storageKey || typeof window === "undefined") {
    return { events: [], activeConditions: [], nodeIds: [] };
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    return {
      events: Array.isArray(parsed.events) ? parsed.events : [],
      activeConditions: Array.isArray(parsed.activeConditions)
        ? parsed.activeConditions
        : [],
      nodeIds: Array.isArray(parsed.nodeIds) ? parsed.nodeIds : [],
    };
  } catch {
    return { events: [], activeConditions: [], nodeIds: [] };
  }
}

function writeStoredLogState(storageKey, events, activeConditions, nodeIds) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        events: events.slice(0, MAX_STORED_EVENTS),
        activeConditions: [...activeConditions],
        nodeIds: [...nodeIds],
      }),
    );
  } catch {
    // If storage is full or unavailable, keep the in-memory log working.
  }
}

export default function AlarmEventLog({
  deviceIp,
  protocol = "http",
  pollMs = 5000,
}) {
  const { t } = useI18n();
  const baseUrl = useMemo(
    () => normaliseUrl(deviceIp, protocol),
    [deviceIp, protocol],
  );
  const storageKey = useMemo(
    () => (baseUrl ? `agil-alarm-event-log:${baseUrl}` : ""),
    [baseUrl],
  );
  const [events, setEvents] = useState(() =>
    readStoredLogState(storageKey).events,
  );
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [sortDirection, setSortDirection] = useState("desc");
  const activeConditionsRef = useRef(
    new Set(readStoredLogState(storageKey).activeConditions),
  );
  const previousNodeIdsRef = useRef(
    readStoredLogState(storageKey).nodeIds.length
      ? new Set(readStoredLogState(storageKey).nodeIds)
      : null,
  );

  const addEvents = useCallback((nextEvents) => {
    if (!nextEvents.length) return;
    setEvents((current) => {
      const existing = new Set(current.map((event) => event.id));
      const unique = nextEvents.filter((event) => !existing.has(event.id));
      const next = [...unique, ...current].slice(0, MAX_STORED_EVENTS);
      writeStoredLogState(
        storageKey,
        next,
        activeConditionsRef.current,
        previousNodeIdsRef.current || new Set(),
      );
      return next;
    });
  }, [storageKey]);

  useEffect(() => {
    const stored = readStoredLogState(storageKey);
    setEvents(stored.events);
    activeConditionsRef.current = new Set(stored.activeConditions);
    previousNodeIdsRef.current = stored.nodeIds.length
      ? new Set(stored.nodeIds)
      : null;
  }, [storageKey]);

  const refresh = useCallback(
    async (signal) => {
      if (!baseUrl) return;
      setStatus((current) => (current === "success" ? "refreshing" : "loading"));

      try {
        const [nodeResult, devicesResult, configResult, linkResult] =
          await Promise.all([
            fetchJson(`${baseUrl}/status?content=nodeInfos`, signal),
            fetchJson(`${baseUrl}/status?content=devices`, signal),
            fetchJson(`${baseUrl}/status?content=configUpdated`, signal),
            fetchJson(`${baseUrl}/status?content=linkQuality`, signal),
          ]);

        const nodes = Array.isArray(nodeResult?.nodeInfos)
          ? nodeResult.nodeInfos
          : [];
        const linkQuality = Array.isArray(linkResult?.linkQuality)
          ? linkResult.linkQuality
          : [];
        const devices = Array.isArray(devicesResult?.devices)
          ? devicesResult.devices
          : [];

        const names = await Promise.all(
          nodes.map(async (node) => {
            if (!node.ip) return [node.id, `node${node.id}`];
            try {
              const result = await fetchJson(
                `${protocol}://${node.ip}/config?content=name`,
                signal,
              );
              return [node.id, result?.name || `node${node.id}`];
            } catch {
              return [node.id, `node${node.id}`];
            }
          }),
        );
        const nameById = Object.fromEntries(names);
        const namedNodes = nodes.map((node) => ({
          ...node,
          name: nameById[node.id] || `node${node.id}`,
        }));

        const telemetry = await Promise.all(
          namedNodes.map(async (node) => {
            if (!node.ip) return [node.id, null];
            try {
              const result = await fetchJson(
                `${protocol}://${node.ip}/status?content=temp`,
                signal,
              );
              return [node.id, result?.temp ?? null];
            } catch {
              return [node.id, null];
            }
          }),
        );
        const tempById = Object.fromEntries(telemetry);

        const now = new Date();
        const detected = [];
        const oneShotEvents = [];
        const nodeIds = new Set(namedNodes.map((node) => String(node.id)));
        const previousNodeIds = previousNodeIdsRef.current;

        if (previousNodeIds) {
          namedNodes.forEach((node) => {
            if (!previousNodeIds.has(String(node.id))) {
              oneShotEvents.push({
                id: `${Date.now()}-node-joined-${node.id}`,
                timestamp: now.toISOString(),
                time: formatTimestamp(now),
                severity: "Info",
                type: "Node Joined",
                source: nodeLabel(node),
                detail: `${nodeLabel(node)} joined the network${node.ip ? ` at ${node.ip}` : ""}.`,
              });
            }
          });

          previousNodeIds.forEach((nodeId) => {
            if (!nodeIds.has(nodeId)) {
              detected.push({
                severity: "Critical",
                type: "Node Offline",
                source: `Node #${nodeId}`,
                detail: "Node is no longer reported in nodeInfos.",
              });
            }
          });
        }
        previousNodeIdsRef.current = nodeIds;

        namedNodes.forEach((node, rowIndex) => {
          const temp = Number(tempById[node.id]);
          if (Number.isFinite(temp) && temp > TEMPERATURE_WARNING_C) {
            detected.push({
              severity: "Warning",
              type: "High Temperature",
              source: nodeLabel(node),
              detail: `FPGA temperature ${temp.toFixed(1)} C.`,
            });
          }

          if (isInvalidGps(node)) {
            detected.push({
              severity: "Warning",
              type: "GPS Invalid",
              source: nodeLabel(node),
              detail: `Latitude ${node.lat ?? "--"}, longitude ${node.lng ?? "--"}.`,
            });
          }

          const row = Array.isArray(linkQuality[rowIndex]) ? linkQuality[rowIndex] : [];
          row.forEach((snr, colIndex) => {
            const value = Number(snr);
            if (
              colIndex === rowIndex ||
              !Number.isFinite(value) ||
              value === -10 ||
              value >= WEAK_SNR_WARNING_DB
            ) {
              return;
            }
            const peer = namedNodes[colIndex];
            detected.push({
              severity: value < WEAK_SNR_CRITICAL_DB ? "Critical" : "Warning",
              type: "Weak SNR",
              source: nodeLabel(node),
              detail: `Link to ${nodeLabel(peer)} is ${value.toFixed(0)} dB.`,
            });
          });
        });

        devices.forEach((device) => {
          const state = Number(device?.status ?? 0);
          if (state !== 1) {
            detected.push({
              severity: state === 2 ? "Warning" : "Critical",
              type: "Ethernet Down",
              source: device?.type || "Ethernet",
              detail: `${device?.type || "Interface"} is ${deviceStatusLabel(state)}.`,
            });
          }
        });

        if (Boolean(configResult?.configUpdated)) {
          detected.push({
            severity: "Warning",
            type: "Config Update Pending",
            source: "Device configuration",
            detail: "Configuration changes are pending update or reboot.",
          });
        }

        const nextActive = new Set(detected.map(eventFingerprint));
        const previousActive = activeConditionsRef.current;
        const additions = detected
          .filter((event) => !previousActive.has(eventFingerprint(event)))
          .map((event) => ({
            ...event,
            id: `${Date.now()}-${eventFingerprint(event)}`,
            timestamp: now.toISOString(),
            time: formatTimestamp(now),
          }));

        const cleared = [...previousActive]
          .filter((key) => !nextActive.has(key))
          .map((key) => {
            const [, source, detail] = key.split(":");
            return {
              id: `${Date.now()}-cleared-${key}`,
              timestamp: now.toISOString(),
              time: formatTimestamp(now),
              severity: "Info",
              type: "Alarm Cleared",
              source,
              detail,
            };
          });

        activeConditionsRef.current = nextActive;
        addEvents([...oneShotEvents, ...additions, ...cleared]);
        setError("");
        setStatus("success");
      } catch (requestError) {
        if (requestError?.name === "AbortError") return;
        setError(requestError?.message || "Unable to retrieve alarm data.");
        setStatus("error");
        addEvents([
          {
            id: `${Date.now()}-alarm-poll-error`,
            timestamp: new Date().toISOString(),
            time: formatTimestamp(new Date()),
            severity: "Critical",
            type: "Alarm Polling Error",
            source: baseUrl,
            detail: requestError?.message || "Unable to retrieve alarm data.",
          },
        ]);
      }
    },
    [addEvents, baseUrl, protocol],
  );

  useEffect(() => {
    if (!baseUrl) {
      setStatus("idle");
      return undefined;
    }
    const controller = new AbortController();
    refresh(controller.signal);
    const timer = window.setInterval(() => refresh(controller.signal), pollMs);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [baseUrl, pollMs, refresh]);

  const filteredEvents = useMemo(() => {
    const search = query.trim().toLowerCase();
    return events
      .filter((event) => {
        const severityMatches =
          severityFilter === "All" || event.severity === severityFilter;
        if (!severityMatches) return false;
        if (!search) return true;
        const view = eventView(event);
        return [
          event.time,
          view.severityLabel,
          view.typeLabel,
          view.sourceLabel,
          view.detailLabel,
          event.severity,
          event.type,
          event.source,
          event.detail,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      })
      .sort((a, b) => {
        const aTime = Date.parse(a.timestamp || a.time) || 0;
        const bTime = Date.parse(b.timestamp || b.time) || 0;
        return sortDirection === "desc" ? bTime - aTime : aTime - bTime;
      });
  }, [events, query, severityFilter, sortDirection, t]);

  const groupedEvents = useMemo(
    () => groupSimilarEvents(filteredEvents),
    [filteredEvents],
  );

  const counts = useMemo(
    () =>
      events.reduce(
        (result, event) => ({
          ...result,
          [event.severity]: (result[event.severity] || 0) + 1,
        }),
        { Info: 0, Warning: 0, Critical: 0 },
      ),
    [events],
  );
  const statusLabel =
    status === "loading"
      ? t("common.loading", "Loading...")
      : status === "refreshing"
        ? t("common.refreshing", "Refreshing")
        : status === "success"
          ? t("logs.connected", "Connected")
          : status === "error"
            ? t("logs.error", "Error")
            : t("logs.idle", "Idle");

  function severityLabel(severity) {
    return t(`logs.severity.${severity}`, severity);
  }

  function eventTypeLabel(type) {
    return t(`logs.eventTypes.${logKey(type)}`, type || "");
  }

  function sourceLabel(source) {
    const text = String(source || "");
    const nodeMatch = text.match(/^Node #(.+)$/i);
    if (nodeMatch) {
      return t("logs.sources.nodeNumber", "Node #{id}", {
        id: nodeMatch[1],
      });
    }
    if (text === "Device configuration") {
      return t("logs.sources.deviceConfiguration", "Device configuration");
    }
    if (text === "Ethernet") return t("logs.sources.ethernet", "Ethernet");
    if (text === "Interface") return t("logs.sources.interface", "Interface");
    return text;
  }

  function deviceStateText(state) {
    return t(`logs.deviceStates.${state}`, state);
  }

  function eventDetailLabel(event) {
    const detail = String(event?.detail || "");
    if (/failed to fetch/i.test(detail)) {
      return t(
        "logs.details.fetchFailed",
        "Unable to retrieve alarm data. Check the device connection.",
      );
    }

    switch (event?.type) {
      case "Node Joined": {
        const match = detail.match(/^(.+) joined the network(?: at (.+))?\.$/);
        if (match) {
          return match[2]
            ? t("logs.details.nodeJoinedWithIp", "{node} joined the network at {ip}.", {
                node: match[1],
                ip: match[2],
              })
            : t("logs.details.nodeJoined", "{node} joined the network.", {
                node: match[1],
              });
        }
        break;
      }
      case "Node Offline":
        if (detail === "Node is no longer reported in nodeInfos.") {
          return t(
            "logs.details.nodeOffline",
            "Node is no longer reported in node information.",
          );
        }
        break;
      case "High Temperature": {
        const match = detail.match(/^FPGA temperature ([\d.-]+) C\.$/);
        if (match) {
          return t("logs.details.highTemperature", "FPGA temperature {temp} C.", {
            temp: match[1],
          });
        }
        break;
      }
      case "GPS Invalid": {
        const match = detail.match(/^Latitude (.*), longitude (.*)\.$/);
        if (match) {
          return t("logs.details.gpsInvalid", "Latitude {lat}, longitude {lng}.", {
            lat: match[1],
            lng: match[2],
          });
        }
        break;
      }
      case "Weak SNR": {
        const match = detail.match(/^Link to (.*) is (-?[\d.]+) dB\.$/);
        if (match) {
          return t("logs.details.weakSnr", "Link to {peer} is {snr} dB.", {
            peer: match[1],
            snr: match[2],
          });
        }
        break;
      }
      case "Ethernet Down": {
        const match = detail.match(/^(.+) is (up|warning|down)\.$/);
        if (match) {
          return t("logs.details.ethernetDown", "{name} is {state}.", {
            name: match[1],
            state: deviceStateText(match[2]),
          });
        }
        break;
      }
      case "Config Update Pending":
        if (detail === "Configuration changes are pending update or reboot.") {
          return t(
            "logs.details.configUpdatePending",
            "Configuration changes are pending update or reboot.",
          );
        }
        break;
      case "Alarm Cleared":
        return t("logs.details.alarmCleared", "Cleared: {detail}", {
          detail,
        });
      case "Alarm Polling Error":
        if (detail === "Unable to retrieve alarm data.") {
          return t(
            "logs.details.retrieveFailed",
            "Unable to retrieve alarm data.",
          );
        }
        break;
      default:
        break;
    }
    return detail;
  }

  function eventView(event) {
    return {
      ...event,
      severityLabel: severityLabel(event.severity),
      typeLabel: eventTypeLabel(event.type),
      sourceLabel: sourceLabel(event.source),
      detailLabel: eventDetailLabel(event),
    };
  }

  function errorLabel(message) {
    return eventDetailLabel({
      type: "Alarm Polling Error",
      detail: message,
    });
  }

  function exportJson() {
    const localizedEvents = groupedEvents.map((group) => {
      const event = group.event;
      const view = eventView(event);
      return {
        id: group.id,
        time: event.time,
        timestamp: event.timestamp,
        repeatCount: group.count,
        firstSeen: group.earliestTime,
        lastSeen: group.latestTime,
        severity: view.severityLabel,
        type: groupedLabel(view.typeLabel, group.count),
        source: view.sourceLabel,
        detail: view.detailLabel,
      };
    });
    downloadFile(
      `agil-alarm-event-log-${Date.now()}.json`,
      JSON.stringify(localizedEvents, null, 2),
      "application/json",
    );
  }

  function exportCsv() {
    const headers = ["time", "severity", "type", "source", "detail"];
    const localizedHeaders = [
      t("logs.time", "Time"),
      t("logs.severityLabel", "Severity"),
      t("logs.event", "Event"),
      t("logs.sourceNode", "Source Node"),
      t("logs.detailsLabel", "Details"),
    ];
    const rows = groupedEvents.map((group) => {
      const event = group.event;
      const view = eventView(event);
      const localized = {
        time: event.time,
        severity: view.severityLabel,
        type: groupedLabel(view.typeLabel, group.count),
        source: view.sourceLabel,
        detail: view.detailLabel,
      };
      return headers.map((header) => csvEscape(localized[header])).join(",");
    });
    downloadFile(
      `agil-alarm-event-log-${Date.now()}.csv`,
      [localizedHeaders.map(csvEscape).join(","), ...rows].join("\n"),
      "text/csv",
    );
  }

  function clearLogs() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        t(
          "logs.clearConfirm",
          "Clear alarm and event log history for this device?",
        ),
      )
    ) {
      return;
    }
    setEvents([]);
    writeStoredLogState(
      storageKey,
      [],
      activeConditionsRef.current,
      previousNodeIdsRef.current || new Set(),
    );
  }

  return (
    <section className="alarm-page">
      <header className="page-title-row">
        <div>
          <h1>{t("logs.title", "Alarm and Event Log")}</h1>
          <p>
            {t(
              "logs.subtitle",
              "{url} - node health, RF quality, GPS, Ethernet, and configuration events",
              { url: baseUrl },
            )}
          </p>
        </div>
        <div className="alarm-title-actions">
          <span className={`alarm-status-dot ${status}`}>
            <i aria-hidden="true" />
            {statusLabel}
          </span>
          <button
            type="button"
            className="configuration-refresh"
            onClick={() => refresh(new AbortController().signal)}
            disabled={!baseUrl || status === "loading"}
          >
            {status === "refreshing"
              ? t("common.refreshing", "Refreshing")
              : t("common.refresh", "Refresh")}
          </button>
        </div>
      </header>

      {error && <div className="notice error">{errorLabel(error)}</div>}

      <section
        className="alarm-summary-grid"
        aria-label={t("logs.summary", "Alarm summary")}
      >
        <div className="alarm-summary-card info">
          <span>{severityLabel("Info")}</span>
          <strong>{counts.Info}</strong>
        </div>
        <div className="alarm-summary-card warning">
          <span>{severityLabel("Warning")}</span>
          <strong>{counts.Warning}</strong>
        </div>
        <div className="alarm-summary-card critical">
          <span>{severityLabel("Critical")}</span>
          <strong>{counts.Critical}</strong>
        </div>
      </section>

      <section className="alarm-toolbar">
        <div className="alarm-search-row">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(
              "logs.searchPlaceholder",
              "Search event, node, interface, or parameter",
            )}
          />
        </div>
        <div className="alarm-action-row">
          <div
            className="alarm-filter-group"
            role="group"
            aria-label={t("logs.severityFilter", "Severity filter")}
          >
            {SEVERITIES.map((severity) => (
              <button
                key={severity}
                type="button"
                className={severityFilter === severity ? "active" : ""}
                onClick={() => setSeverityFilter(severity)}
              >
                {severityLabel(severity)}
              </button>
            ))}
          </div>
          <div className="alarm-export-actions">
            <button type="button" className="configuration-import" onClick={exportCsv}>
              {t("logs.exportCsv", "Export CSV")}
            </button>
            <button type="button" className="configuration-import" onClick={exportJson}>
              {t("logs.exportJson", "Export JSON")}
            </button>
            <button type="button" className="alarm-clear-button" onClick={clearLogs}>
              {t("logs.clearHistory", "Clear History")}
            </button>
          </div>
        </div>
      </section>

      <section className="alarm-table-wrap">
        <table className="alarm-table">
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  className="alarm-sort-button"
                  onClick={() =>
                    setSortDirection((current) =>
                      current === "desc" ? "asc" : "desc",
                    )
                  }
                >
                  {t("logs.time", "Time")}{" "}
                  <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                </button>
              </th>
              <th>{t("logs.severityLabel", "Severity")}</th>
              <th>{t("logs.event", "Event")}</th>
              <th>{t("logs.sourceNode", "Source Node")}</th>
              <th>{t("logs.detailsLabel", "Details")}</th>
            </tr>
          </thead>
          <tbody>
            {groupedEvents.map((group) => {
              const event = group.event;
              const view = eventView(event);
              return (
              <tr key={group.id}>
                <td
                  title={
                    group.count > 1
                      ? `${group.earliestTime} - ${group.latestTime}`
                      : undefined
                  }
                >
                  {event.time}
                </td>
                <td>
                  <span className={`alarm-severity ${event.severity.toLowerCase()}`}>
                    {view.severityLabel}
                  </span>
                </td>
                <td>
                  <span className="alarm-event-label">
                    {view.typeLabel}
                    {group.count > 1 && (
                      <span className="alarm-repeat-count">
                        × {group.count}
                      </span>
                    )}
                  </span>
                </td>
                <td>{view.sourceLabel}</td>
                <td>{view.detailLabel}</td>
              </tr>
              );
            })}
            {!groupedEvents.length && (
              <tr>
                <td colSpan="5" className="alarm-empty">
                  <div className="alarm-empty-state">
                    <div className="alarm-empty-icon" aria-hidden="true">✓</div>
                    <strong>{t("logs.allClear", "All Clear")}</strong>
                    <span>
                      {t(
                        "logs.noMatchingEvents",
                        "No matching events recorded. Adjust your filters or wait for new activity.",
                      )}
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </section>
  );
}

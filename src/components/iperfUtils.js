import { requestText } from "../api/deviceApi.js";

export async function fetchText(url) {
  return requestText(url).then((text) => text.trim());
}

export function extractSessionId(text) {
  const exactId = text.match(/^\s*(\d{2,})\s*$/);
  if (exactId) return exactId[1];

  const labelledId = text.match(/session\s*(?:id)?\D+(\d{2,})/i);
  if (labelledId) return labelledId[1];

  const lastNumber = [...text.matchAll(/\b(\d{2,})\b/g)].at(-1);
  return lastNumber?.[1] || "";
}

export function formatToolText(text) {
  return text
    .replace(/<br\s*\\*\/?\s*>/gi, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();
}

function toMbits(value, unit) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  const normalizedUnit = unit.toLowerCase();
  if (normalizedUnit.startsWith("k")) return numericValue / 1000;
  if (normalizedUnit.startsWith("g")) return numericValue * 1000;
  return numericValue;
}

export function extractIperfMetrics(text) {
  const formattedText = formatToolText(text || "");
  const lines = formattedText.split("\n").filter(Boolean);
  const metrics = {
    throughputMbps: null,
    averageThroughputMbps: null,
    throughputSamples: [],
    jitterMs: null,
    packetLossPercent: null,
    datagrams: null,
    warnings: [],
    transferLine: "",
  };

  lines.forEach((line) => {
    const throughput = line.match(/([\d.]+)\s+([KMG])bits\/sec/i);
    if (throughput) {
      const throughputMbps = toMbits(throughput[1], throughput[2]);
      metrics.throughputMbps = throughputMbps;
      metrics.transferLine = line;

      const interval = line.match(/\]\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s+sec/i);
      if (Number.isFinite(throughputMbps) && interval) {
        const start = Number(interval[1]);
        const end = Number(interval[2]);
        const seconds = Math.max(0, end - start);
        metrics.throughputSamples.push({ throughputMbps, seconds, start, end });
      }
    }

    const jitter = line.match(/([\d.]+)\s+ms/i);
    if (jitter) metrics.jitterMs = Number(jitter[1]);

    const loss = line.match(/\(([\d.]+)%\)/);
    if (loss) metrics.packetLossPercent = Number(loss[1]);

    const datagrams = line.match(/(\d+)\s+datagrams/i);
    if (datagrams) metrics.datagrams = Number(datagrams[1]);

    if (/warning|error|failed|lost|out-of-order/i.test(line)) {
      metrics.warnings.push(line);
    }
  });

  if (metrics.throughputSamples.length) {
    const intervalSamples =
      metrics.throughputSamples.length > 1
        ? metrics.throughputSamples.filter((sample) => !(sample.start === 0 && sample.seconds > 5))
        : metrics.throughputSamples;
    const weightedSeconds = intervalSamples.reduce((total, sample) => total + sample.seconds, 0);
    metrics.averageThroughputMbps =
      weightedSeconds > 0
        ? intervalSamples.reduce(
            (total, sample) => total + sample.throughputMbps * sample.seconds,
            0,
          ) / weightedSeconds
        : intervalSamples.reduce((total, sample) => total + sample.throughputMbps, 0) /
          intervalSamples.length;
    metrics.throughputSamples = intervalSamples;
  }

  return metrics;
}

export function formatMetric(value, suffix, digits = 1) {
  return Number.isFinite(value) ? `${value.toFixed(digits)} ${suffix}` : "--";
}

export function makeIperfStateStorageKey(protocol, deviceIp) {
  return `agil-mesh-iperf-state:${protocol}://${deviceIp || "default"}`;
}

export function readStoredIperfState(storageKey) {
  if (typeof window === "undefined" || !storageKey) return {};
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function writeStoredIperfState(storageKey, nextState) {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        clientNodeIp: nextState.clientNodeIp || "",
        serverNodeIp: nextState.serverNodeIp || "",
        port: nextState.port || "",
        bandwidth: nextState.bandwidth || "",
        duration: nextState.duration || "",
        interval: nextState.interval || "",
        clientSessionId: nextState.clientSessionId || "",
        serverSessionId: nextState.serverSessionId || "",
        clientResult: nextState.clientResult || "",
        serverResult: nextState.serverResult || "",
        clientUpdatedAt: nextState.clientUpdatedAt || "",
        serverUpdatedAt: nextState.serverUpdatedAt || "",
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Browser storage can be unavailable in private/incognito contexts.
  }
}

export function clearStoredIperfState(storageKey) {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage failures; the UI state can still be cleared in memory.
  }
}

export function buildIperfSummary(clientResult, serverResult) {
  const client = extractIperfMetrics(clientResult);
  const server = extractIperfMetrics(serverResult);
  const primary =
    server.averageThroughputMbps != null || server.throughputMbps != null ? server : client;
  const hasResult = Boolean(clientResult || serverResult);
  const issues = [...client.warnings, ...server.warnings];
  const packetLoss = client.packetLossPercent ?? server.packetLossPercent;
  const jitter = client.jitterMs ?? server.jitterMs;
  const averageThroughputMbps =
    server.averageThroughputMbps ??
    server.throughputMbps ??
    client.averageThroughputMbps ??
    client.throughputMbps;
  let headline = "Waiting for IPERF results";
  let recommendation = "Run the server first, then run the client and refresh both results for a complete summary.";

  if (hasResult) {
    if (issues.length) {
      headline = "Review needed";
      recommendation = "The result contains warnings or errors. Check that the server session is still running and that the client is using the correct server node IP, UDP port, and session ID.";
    } else if (Number.isFinite(packetLoss) && packetLoss > 1) {
      headline = "Packet loss detected";
      recommendation = "Packet loss is above the preferred range. Try lower bandwidth, verify RF/link quality, and rerun the test.";
    } else if (Number.isFinite(jitter) && jitter > 10) {
      headline = "Jitter is high";
      recommendation = "Jitter is elevated. Retest with lower load or check for interference and congestion.";
    } else if (Number.isFinite(averageThroughputMbps)) {
      headline = "IPERF result looks stable";
      recommendation = "Average UDP throughput is calculated from the interval samples over the test period. Compare it with the requested bandwidth and link quality before accepting the result.";
    } else {
      headline = "Result received";
      recommendation = "The response was received, but no standard IPERF throughput line was found yet. Refresh once the test has run longer.";
    }
  }

  return {
    headline,
    recommendation,
    averageThroughputMbps,
    throughputMbps: primary.throughputMbps,
    sampleCount: primary.throughputSamples.length,
    jitterMs: jitter,
    packetLossPercent: packetLoss,
    datagrams: client.datagrams ?? server.datagrams,
    issue: issues[0] || "",
  };
}

function isValidIpv4(value) {
  const parts = value.trim().split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) return false;
      const number = Number(part);
      return number >= 0 && number <= 255;
    })
  );
}

function isPositiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

export function validateIperfConfig(side, state, t) {
  const clientNodeIp = state.clientNodeIp.trim();
  const serverNodeIp = state.serverNodeIp.trim();
  const port = state.port.trim();
  const bandwidth = state.bandwidth.trim();
  const duration = state.duration.trim();
  const interval = state.interval.trim();

  if (side === "server" && !serverNodeIp) {
    return t(
      "tools.iperf.serverNodeRequired",
      "Server Node IP is required because the server command runs on the receiving node.",
    );
  }

  if (side === "client" && !clientNodeIp) {
    return t(
      "tools.iperf.clientNodeRequired",
      "Client Node IP is required because the client command runs on the sending node.",
    );
  }

  if (side === "client" && !serverNodeIp) {
    return t(
      "tools.iperf.serverTargetRequired",
      "Server Node IP is required as the UDP receiving target.",
    );
  }

  const relevantIps = side === "server" ? [serverNodeIp] : [clientNodeIp, serverNodeIp];
  if (relevantIps.some((ip) => ip && !isValidIpv4(ip))) {
    return t("tools.iperf.invalidIp", "Enter a valid IPv4 address before running the test.");
  }

  if (port) {
    const numericPort = Number(port);
    if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
      return t("tools.iperf.invalidPort", "UDP port must be between 1 and 65535.");
    }
  }

  if (!isPositiveNumber(interval)) {
    return t("tools.iperf.invalidInterval", "Interval must be greater than 0 seconds.");
  }

  if (side === "client") {
    if (!isPositiveNumber(bandwidth)) {
      return t("tools.iperf.invalidBandwidth", "Bandwidth must be greater than 0 Mbps.");
    }

    if (!isPositiveNumber(duration)) {
      return t("tools.iperf.invalidDuration", "Duration must be greater than 0 seconds.");
    }
  }

  return "";
}

export function downloadTextFile(filename, text, type = "text/plain") {
  if (typeof window === "undefined") return;
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

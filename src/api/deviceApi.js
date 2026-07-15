const DEFAULT_TIMEOUT_MS = 8000;

export function buildDeviceUrl(deviceIp, path) {
  const protocol = typeof window !== "undefined" && window.location.protocol === "https:"
    ? "https:"
    : "http:";
  const normalizedPath = String(path || "").startsWith("/")
    ? path
    : `/${path}`;
  return `${protocol}//${deviceIp}${normalizedPath}`;
}

function normalizeFetchOptions(options = {}) {
  if (options instanceof AbortSignal) return { signal: options };
  return options || {};
}

export async function requestText(url, options = {}) {
  const response = await fetchWithTimeout(url, normalizeFetchOptions(options));
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return text;
}

export async function requestJson(url, options = {}) {
  const response = await fetchWithTimeout(url, normalizeFetchOptions(options));
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const normalized = normalizeFetchOptions(options);
  const timeoutController = new AbortController();
  const timer = window.setTimeout(() => timeoutController.abort(), timeoutMs);
  const onAbort = () => timeoutController.abort();
  normalized.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await fetch(url, { ...normalized, signal: timeoutController.signal });
  } finally {
    window.clearTimeout(timer);
    normalized.signal?.removeEventListener("abort", onAbort);
  }
}

export async function postJson(url, payload, signal) {
  const text = await requestText(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export async function postForm(url, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(payload).toString(),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

export function createTimeoutController(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timer),
  };
}

export function formatRequestError(error, fallback = "Request failed") {
  if (error?.name === "AbortError") return "Request timed out";
  return error?.message || fallback;
}

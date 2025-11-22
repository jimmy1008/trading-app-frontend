// === 全域 API Base，自動依部署或本機切換 ===
const host = window.location.hostname;
export const API_BASE =
  host === "y1ran.app" || host.endsWith(".y1ran.app")
    ? "https://api.y1ran.app"
    : "http://localhost:3000";

// === localStorage key ===
export const TOKEN_KEY = "token";
export const USER_KEY = "authUser";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.href = "login.html";
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (res.status === 401) {
    logout();
    return;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "API Error");
  }

  return res.json();
}

export function apiGet(path) {
  return request(path, { method: "GET" });
}

export function apiPost(path, data) {
  return request(path, {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function apiPostJson(path, data) {
  return apiPost(path, data);
}

export function apiPut(path, data) {
  return request(path, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export function apiDelete(path) {
  return request(path, { method: "DELETE" });
}

// === Legacy helpers (still used across UI) ===
export function fetchRecords() {
  return apiGet("/records");
}

export function createRecord(data) {
  return apiPost("/records", data);
}

export function updateRecord(id, data) {
  return apiPut(`/records/${id}`, data);
}

export function deleteRecord(id) {
  return apiDelete(`/records/${id}`);
}

export function fetchRecordById(id) {
  return apiGet(`/records/${id}`);
}

export function fetchUserExchanges() {
  return apiGet("/exchanges");
}

export function saveUserExchange(payload) {
  return apiPost("/exchanges", payload);
}

export function deleteUserExchange(id) {
  return apiDelete(`/exchanges/${id}`);
}

export function fetchBalance(exchange) {
  return apiGet(`/balance/${exchange}`);
}

export function fetchBalanceSummary() {
  return apiGet("/balance/summary");
}

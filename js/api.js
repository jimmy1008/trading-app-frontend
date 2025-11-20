const API_BASE = "http://localhost:3000";  
function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };
}

export async function fetchRecords() {
  const res = await fetch(`${API_BASE}/records`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch records");
  return await res.json();
}

export async function createRecord(data) {
  const res = await fetch(`${API_BASE}/records`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("Failed to create record");
  return await res.json();
}

export async function updateRecord(id, data) {
  const res = await fetch(`${API_BASE}/records/${id}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("Failed to update record");
  return await res.json();
}

export async function deleteRecord(id) {
  const res = await fetch(`${API_BASE}/records/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to delete record");
  return await res.json();
}

export async function fetchRecordById(id) {
  const res = await fetch(`${API_BASE}/records/${id}`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Record not found");
  return await res.json();
}

export async function fetchUserExchanges() {
  const res = await fetch(`${API_BASE}/exchanges`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to fetch exchanges");
  return await res.json();
}

export async function saveUserExchange(payload) {
  const res = await fetch(`${API_BASE}/exchanges`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("Failed to save exchange");
  return await res.json();
}

export async function deleteUserExchange(id) {
  const res = await fetch(`${API_BASE}/exchanges/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Failed to delete exchange");
  return await res.json();
}

export async function fetchBalance(exchange) {
  const res = await fetch(`${API_BASE}/balance/${exchange}`, {
    headers: getAuthHeaders()
  });
  return await res.json();
}

export async function fetchBalanceSummary() {
  const res = await fetch(`${API_BASE}/balance/summary`, {
    headers: getAuthHeaders()
  });
  return await res.json();
}

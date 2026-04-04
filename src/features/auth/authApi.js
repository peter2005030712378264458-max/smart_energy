export const API_BASE = '/api/auth'

export async function login(payload) {
  return fetch(`${API_BASE}/login/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function register(payload) {
  return fetch(`${API_BASE}/register/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function refresh() {
  return fetch(`${API_BASE}/refresh/`, {
    method: 'POST',
    credentials: 'include',
  })
}

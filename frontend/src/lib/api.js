const apiBaseUrl = import.meta.env.VITE_API_URL

if (!apiBaseUrl) {
  throw new Error('VITE_API_URL is not configured')
}

export async function apiFetch(path, accessToken, options = {}) {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    })

    // Handle 401 Unauthorized (expired token)
    if (response.status === 401 && accessToken) {
      localStorage.removeItem('loyaltea.session')
      window.dispatchEvent(new Event('loyaltea:session-expired'))
      throw new Error('Your session has expired. Please sign in again.')
    }

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload.error || `Request failed with status ${response.status}`)
    }
    return payload
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Network error: ${error.message}. Is the API server running?`)
    }
    throw error
  }
}

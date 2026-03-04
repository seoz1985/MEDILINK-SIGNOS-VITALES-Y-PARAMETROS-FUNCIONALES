// API_BASE apunta al proxy local de Next.js (mismo origen → sin CORS ni problemas de cert)
// Las rutas /api/* son interceptadas por app/api/[...path]/route.ts y reenviadas al backend Flask.
export const API_BASE = ""

export async function apiPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(`${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    ...init,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`API error ${res.status}: ${text || res.statusText}`)
  }

  return (await res.json()) as T
}

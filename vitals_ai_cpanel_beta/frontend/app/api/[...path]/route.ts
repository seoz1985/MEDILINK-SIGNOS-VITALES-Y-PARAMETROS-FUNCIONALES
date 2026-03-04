/**
 * Proxy API catch-all: reenvía /api/* al backend Flask.
 *
 * Esto elimina problemas de:
 *  - Certificados cruzados (el navegador solo acepta el cert del frontend)
 *  - CORS (mismo origen)
 *  - Mixed content
 */
import { NextRequest, NextResponse } from "next/server"

// Backend Flask (server-side, no necesita HTTPS válido)
const BACKEND = process.env.BACKEND_INTERNAL_URL || "https://127.0.0.1:5000"

// Aumentar límite de body para frames base64 (~200KB cada uno)
export const runtime = "nodejs"

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, await params)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, await params)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, await params)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, await params)
}

async function proxyRequest(request: NextRequest, params: { path: string[] }) {
  const path = params.path.join("/")
  const url = `${BACKEND}/api/${path}`

  try {
    const headers: Record<string, string> = {}
    const ct = request.headers.get("content-type")
    if (ct) headers["Content-Type"] = ct

    let body: BodyInit | undefined = undefined
    if (request.method !== "GET" && request.method !== "HEAD") {
      // Leer como ArrayBuffer para preservar integridad del body (incluye base64 grandes)
      const buf = await request.arrayBuffer()
      body = Buffer.from(buf)
      headers["Content-Length"] = String(buf.byteLength)
    }

    const backendRes = await fetch(url, {
      method: request.method,
      headers,
      body,
    })

    const data = await backendRes.arrayBuffer()

    return new NextResponse(Buffer.from(data), {
      status: backendRes.status,
      headers: {
        "Content-Type": backendRes.headers.get("content-type") || "application/json",
      },
    })
  } catch (err: any) {
    console.error(`[Proxy] Error → ${url}:`, err?.message || err)
    return NextResponse.json(
      { ok: false, error: `Proxy error: ${err?.message || "No se pudo conectar al backend"}` },
      { status: 502 }
    )
  }
}

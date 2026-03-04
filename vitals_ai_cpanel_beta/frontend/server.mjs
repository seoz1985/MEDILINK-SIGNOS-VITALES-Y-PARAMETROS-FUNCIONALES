/**
 * Custom HTTPS server para Next.js — permite acceso LAN con cámara en móviles.
 * Uso: node server.mjs
 */

// Permitir conexiones a backend con cert auto-firmado (proxy server-side)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

import { createServer } from "https"
import { parse } from "url"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import next from "next"

const __dirname = dirname(fileURLToPath(import.meta.url))
const dev = true
const hostname = "0.0.0.0"
const port = 3000

// Certificados auto-firmados (compartidos con el backend)
const certDir = resolve(__dirname, "..", "certs")
const httpsOptions = {
  key: readFileSync(resolve(certDir, "key.pem")),
  cert: readFileSync(resolve(certDir, "cert.pem")),
}

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer(httpsOptions, (req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  }).listen(port, hostname, () => {
    console.log(`\n  ✅ Frontend HTTPS listo:\n`)
    console.log(`     PC:      https://localhost:${port}`)
    console.log(`     Celular: https://192.168.1.10:${port}\n`)
  })
})

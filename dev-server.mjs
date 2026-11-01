// Servidor de desarrollo local: levanta las funciones /api (mismo formato que
// Vercel) en :3001 y Vite en :5173 con proxy a la API. Uso: npm run dev
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer as createVite } from 'vite'

for (const f of ['.env.local', '.env']) if (fs.existsSync(f)) process.loadEnvFile(f)

const API_PORT = 3001
const apiDir = path.resolve('api')

const api = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${API_PORT}`)
  const rel = url.pathname.replace(/^\/api\/?/, '')
  const file = path.join(apiDir, `${rel}.js`)
  res.status = (code) => ((res.statusCode = code), res)
  res.json = (obj) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(obj))
    return res
  }
  if (!rel || rel.split('/').some((p) => p.startsWith('_') || p === '..') || !fs.existsSync(file)) {
    return res.status(404).json({ error: 'No encontrado' })
  }
  try {
    req.query = Object.fromEntries(url.searchParams)
    let raw = ''
    for await (const chunk of req) raw += chunk
    req.body = raw ? JSON.parse(raw) : {}
    const mod = await import(`${pathToFileURL(file).href}?t=${fs.statSync(file).mtimeMs}`)
    await mod.default(req, res)
  } catch (err) {
    console.error(err)
    if (!res.headersSent) res.status(500).json({ error: err.message })
  }
})

api.listen(API_PORT, () => console.log(`  API     http://localhost:${API_PORT}/api`))

const vite = await createVite({ server: { port: 5173 } })
await vite.listen()
vite.printUrls()

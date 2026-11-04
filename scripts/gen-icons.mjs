// Genera los íconos PNG de la PWA a partir de public/favicon.svg.
// Uso: npx --yes -p sharp node scripts/gen-icons.mjs   (o `npm i -D sharp` y `npm run icons`)
import fs from 'node:fs'
import sharp from 'sharp'

const svg = fs.readFileSync('public/favicon.svg')
// Versión maskable: fondo a sangre y la marca reducida al 70% (zona segura).
const maskable = Buffer.from(
  svg
    .toString()
    .replace('rx="16"', '')
    .replace('<g id="mark"', '<g id="mark" transform="translate(9.6 9.6) scale(0.7)"')
)

const jobs = [
  ['public/pwa-192.png', svg, 192],
  ['public/pwa-512.png', svg, 512],
  ['public/apple-touch-icon.png', maskable, 180],
  ['public/pwa-maskable-512.png', maskable, 512]
]
for (const [out, src, size] of jobs) {
  await sharp(src, { density: 600 }).resize(size, size).png().toFile(out)
  console.log('✓', out)
}

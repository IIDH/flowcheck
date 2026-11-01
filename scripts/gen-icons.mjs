// Genera los íconos PNG de la PWA a partir de public/favicon.svg.
// Uso: npx --yes -p sharp node scripts/gen-icons.mjs   (o `npm i -D sharp` y `npm run icons`)
import fs from 'node:fs'
import sharp from 'sharp'

const svg = fs.readFileSync('public/favicon.svg')
// Versión maskable: el logo con margen de seguridad sobre fondo de color pleno.
const maskable = Buffer.from(
  svg.toString()
    .replace('<rect width="64" height="64" rx="16" fill="url(#g)"/>', '<rect width="64" height="64" fill="url(#g)"/>')
    .replace(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g, (_, x, y, w, h) => {
      const s = 0.7, o = 32 * (1 - s)
      return `<rect x="${(+x * s + o).toFixed(1)}" y="${(+y * s + o).toFixed(1)}" width="${(+w * s).toFixed(1)}" height="${(+h * s).toFixed(1)}"`
    })
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

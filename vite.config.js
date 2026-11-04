import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Nombre de la app por negocio (variable VITE_APP_NAME). Se usa en el título,
// el ícono de "Agregar a pantalla principal" y el manifest.
function brandingPlugin(appName) {
  const manifest = () =>
    JSON.stringify(
      {
        name: appName,
        short_name: appName.length > 12 ? appName.slice(0, 12) : appName,
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1f6feb',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      null,
      2,
    )
  const esc = appName.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  return {
    name: 'branding',
    transformIndexHtml: (html) =>
      html
        .replace(/<title>.*<\/title>/, `<title>${esc}</title>`)
        .replace('<meta name="apple-mobile-web-app-capable" content="yes" />', `<meta name="apple-mobile-web-app-capable" content="yes" />\n    <meta name="apple-mobile-web-app-title" content="${esc}" />`),
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(manifest())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest() })
    },
  }
}

// `npm run dev:celular` levanta el servidor con HTTPS en la red local,
// necesario para que el navegador del celular permita usar la cámara.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const appName = env.VITE_APP_NAME || 'Kiosco'
  return {
    plugins: [react(), brandingPlugin(appName), mode === 'lan' && basicSsl()].filter(Boolean),
  }
})

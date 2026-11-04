import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// `npm run dev:celular` levanta el servidor con HTTPS en la red local,
// necesario para que el navegador del celular permita usar la cámara.
export default defineConfig(({ mode }) => ({
  plugins: [react(), mode === 'lan' && basicSsl()].filter(Boolean),
}))

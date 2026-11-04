import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Sin StrictMode a propósito: el doble montaje en desarrollo inicia la cámara dos veces.
createRoot(document.getElementById('root')).render(<App />)

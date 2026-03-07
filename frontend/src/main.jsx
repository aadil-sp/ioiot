import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { SerialProvider } from './contexts/SerialContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SerialProvider>
      <App />
    </SerialProvider>
  </StrictMode>,
)

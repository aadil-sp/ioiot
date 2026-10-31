import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { SerialProvider } from './contexts/SerialContext.jsx'
import axios from 'axios'
import { endGuestIfBrowserWasClosed } from './utils/guest.js'

endGuestIfBrowserWasClosed()

// A saved login can stop working (password changed, server secret rotated, user
// deleted). Instead of leaving every page silently broken, send them to log in again.
axios.interceptors.response.use(undefined, (err) => {
  const url = err.config?.url || ''
  if (err.response?.status === 401 && localStorage.getItem('token') && !url.includes('/api/auth/')) {
    localStorage.clear()
    window.location.href = '/login'
  }
  return Promise.reject(err)
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SerialProvider>
      <App />
    </SerialProvider>
  </StrictMode>,
)

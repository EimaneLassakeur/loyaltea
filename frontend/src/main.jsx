import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import './ui-fixes.css'
import './pending-subscription.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { PreferencesProvider } from './contexts/PreferencesContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PreferencesProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </PreferencesProvider>
  </StrictMode>,
)

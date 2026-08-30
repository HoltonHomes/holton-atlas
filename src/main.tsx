import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './parcel.css'
import './report-polish.css'
import './intelligence.css'
import './research-evidence.css'
import './homeowner.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

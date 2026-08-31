import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { queryClient } from './lib/queryClient'
import './design/tokens.css'
import './styles.css'
import './parcel.css'
import './report-polish.css'
import './intelligence.css'
import './research-evidence.css'
import './homeowner.css'
import './owner-overrides.css'
import './phase-two.css'
import './components/charts/charts.css'
import './tax-safety.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)

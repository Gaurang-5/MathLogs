import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { initializeSentry } from './monitoring/sentry'
import { initMobileKeyboardFix } from './utils/mobileKeyboardFix'

// Initialize error monitoring FIRST
initializeSentry();
// Initialize mobile virtual keyboard avoidance helper
initMobileKeyboardFix();

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)

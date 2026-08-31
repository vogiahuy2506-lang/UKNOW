import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { GoogleOAuthProvider } from '@react-oauth/google';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient.js';
import { I18nProvider } from './i18n/index.jsx';
import './index.css'

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {clientId ? (
          <GoogleOAuthProvider clientId={clientId}>
            <I18nProvider>
              <App />
            </I18nProvider>
          </GoogleOAuthProvider>
        ) : (
          <I18nProvider>
            <App />
          </I18nProvider>
        )}
      </QueryClientProvider>
    </ErrorBoundary>
  </>,
)

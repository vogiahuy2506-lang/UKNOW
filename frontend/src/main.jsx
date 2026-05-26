import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { GoogleOAuthProvider } from '@react-oauth/google';
import { I18nProvider } from './i18n/index.jsx';
import './index.css'

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

if (!clientId) {
  console.error("VITE_GOOGLE_CLIENT_ID is missing from frontend/.env!");
} else {
  console.log("Google OAuth initialized with ID:", clientId.substring(0, 10) + "...");
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={clientId}>
        <I18nProvider>
          <App />
        </I18nProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

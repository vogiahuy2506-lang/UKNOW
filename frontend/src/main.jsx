import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { GoogleOAuthProvider } from '@react-oauth/google';
import { I18nProvider } from './i18n/index.jsx';
import './index.css'

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const AppTree = () => (
  <I18nProvider>
    <App />
  </I18nProvider>
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {clientId ? (
        <GoogleOAuthProvider clientId={clientId}>
          <AppTree />
        </GoogleOAuthProvider>
      ) : (
        <AppTree />
      )}
    </ErrorBoundary>
  </React.StrictMode>,
)

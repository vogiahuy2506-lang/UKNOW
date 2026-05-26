import React from 'react';
import { I18nContext } from '../i18n';

const defaultTranslations = {
  title: 'Something went wrong',
  message: 'An error occurred. Please try again.',
  goHome: 'Go to Homepage',
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <I18nContext.Consumer>
          {(context) => {
            const t = context?.t || ((key) => defaultTranslations[key] || key);
            return (
              <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center p-8">
                  <h1 className="text-2xl font-bold text-red-600 mb-4">{t('errorBoundary.title')}</h1>
                  <p className="text-gray-600 mb-4">{this.state.error?.message || t('errorBoundary.message')}</p>
                  <button
                    onClick={() => {
                      this.setState({ hasError: false, error: null });
                      window.location.href = '/';
                    }}
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
                  >
                    {t('errorBoundary.goHome')}
                  </button>
                </div>
              </div>
            );
          }}
        </I18nContext.Consumer>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

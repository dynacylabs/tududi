// Add type declaration for module.hot
declare const module: {
    hot?: {
        accept: (path: string, callback: () => void) => void;
    };
};

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Shared/ToastContext';
import { TelegramStatusProvider } from './contexts/TelegramStatusContext';
import './i18n'; // Import i18n config to initialize it
import './styles/markdown.css'; // Import markdown styles
import './styles/pwa.css'; // Import PWA styles for safe areas and fullscreen
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n'; // Import the i18n instance with its configuration

const storedPreference = localStorage.getItem('isDarkMode');
const prefersDarkMode = window.matchMedia(
    '(prefers-color-scheme: dark)'
).matches;
const isDarkMode = storedPreference
    ? storedPreference === 'true'
    : prefersDarkMode;

if (isDarkMode) {
    document.documentElement.classList.add('dark');
} else {
    document.documentElement.classList.remove('dark');
}

const container = document.getElementById('root');

// Store the root outside the if block so it can be accessed by the HMR code
let root: any;

if (container) {
    root = createRoot(container);
    root.render(
        <I18nextProvider i18n={i18n}>
            <BrowserRouter>
                <ToastProvider>
                    <TelegramStatusProvider>
                        <App />
                    </TelegramStatusProvider>
                </ToastProvider>
            </BrowserRouter>
        </I18nextProvider>
    );
}

// Hot Module Replacement (HMR) - Remove this snippet to remove HMR.
// Learn more: https://www.webpackjs.com/concepts/hot-module-replacement/
if (module.hot) {
    module.hot.accept('./App', () => {
        // New version of App component imported
        if (root) {
            root.render(
                <I18nextProvider i18n={i18n}>
                    <BrowserRouter>
                        <ToastProvider>
                            <TelegramStatusProvider>
                                <App />
                            </TelegramStatusProvider>
                        </ToastProvider>
                    </BrowserRouter>
                </I18nextProvider>
            );
        }
    });
}

// Register service worker for PWA support
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/service-worker.js')
            .then((registration) => {
                console.log('[PWA] Service Worker registered:', registration.scope);

                // Check for updates periodically
                setInterval(() => {
                    registration.update();
                }, 60000); // Check every minute

                // Handle updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (
                                newWorker.state === 'installed' &&
                                navigator.serviceWorker.controller
                            ) {
                                // New service worker available
                                console.log('[PWA] New content available, please refresh');
                                
                                // Optionally show a notification to the user
                                if (confirm('New version available! Reload to update?')) {
                                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                                    window.location.reload();
                                }
                            }
                        });
                    }
                });
            })
            .catch((error) => {
                console.error('[PWA] Service Worker registration failed:', error);
            });

        // Reload page when new service worker takes control
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
    });
}

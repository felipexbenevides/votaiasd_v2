import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

declare global {
  interface Window {
    __deferredInstallPrompt?: any;
  }
}

// Registro do Service Worker para viabilizar instalação PWA
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const registerSw = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Ignorar falha em ambientes que desabilitam Service Workers
    });
  };

  if (document.readyState === 'complete') {
    registerSw();
  } else {
    window.addEventListener('load', registerSw);
  }
}

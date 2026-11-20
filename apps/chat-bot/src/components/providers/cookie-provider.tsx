'use client';

import React from 'react';

export type CookieConsent = 'all' | 'needed' | null;

export const TRACKING_KEY = 'tracking';
export const NOT_ASK_PATHS = ['/privacy-policy', '/settings/legal/privacy-policy'];

export function getConsentFromLocalStorage(): CookieConsent {
  if (typeof window === 'undefined') return null;
  const consent = window.localStorage.getItem(TRACKING_KEY);
  return consent === 'all' || consent === 'needed' ? consent : null;
}

export function setConsentFromLocalStorage(consentValue: CookieConsent) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TRACKING_KEY, consentValue as string);
  }
}

type CookieConsentContextType = {
  cookie: CookieConsent;
  consent: CookieConsent;
  setConsent: (c: CookieConsent) => void;
  forceModal: boolean;
  setForceModal: (f: boolean) => void;
};

const CookieConsentContext = React.createContext<CookieConsentContextType | undefined>(undefined);

export function useCookieContext() {
  const context = React.useContext(CookieConsentContext);
  if (!context) {
    throw new Error('useCookie must be used within a ToastProvider');
  }
  return context;
}

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = React.useState<CookieConsent>(getConsentFromLocalStorage());
  const [forceModal, setForceModal] = React.useState(false);

  function _setConsent(cookieConsent: CookieConsent) {
    setConsentFromLocalStorage(cookieConsent);
    setConsent(cookieConsent);
  }

  return (
    <CookieConsentContext
      value={{
        cookie: 'all',
        consent,
        setConsent: _setConsent,
        forceModal,
        setForceModal: (f) => setForceModal(f),
      }}
    >
      {children}
    </CookieConsentContext>
  );
}

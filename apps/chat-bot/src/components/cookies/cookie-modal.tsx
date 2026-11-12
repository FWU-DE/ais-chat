'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

import { buttonPrimaryClassName, buttonSecondaryClassName } from '@/utils/tailwind/button';

import { CookieConsent, NOT_ASK_PATHS, useCookieContext } from '../providers/cookie-provider';

export default function CookieModal() {
  const { consent, setConsent, forceModal, setForceModal } = useCookieContext();
  const dialogRef = React.useRef<HTMLDialogElement | null>(null);
  const acceptButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const pathname = usePathname();

  const hideModal = NOT_ASK_PATHS.includes(pathname);

  React.useEffect(() => {
    if (hideModal && !forceModal) return;

    if (consent !== null) return;

    dialogRef.current?.showModal();
  }, [pathname, consent, hideModal, forceModal]);

  const handleConsent = (consentValue: CookieConsent) => {
    setConsent(consentValue);
    setForceModal(false);
    dialogRef.current?.close();
  };

  if (consent !== null) return null;

  // TODO: Add correct privacy policy link
  const privacyPolicyLink = '/privacy-policy';

  return (
    <dialog ref={dialogRef}>
      <div className="max-w-3xl p-10">
        <h1 className="text-xl font-medium">AIS.chat verwendet Cookies</h1>
        <p className="mt-8">
          Diese Anwendung verwendet Cookies, wie in den{' '}
          <Link
            href={privacyPolicyLink}
            prefetch={false}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Datenschutzhinweisen
          </Link>{' '}
          beschrieben. Einige Cookies sind technisch notwendig, während andere dazu beitragen, das
          Nutzerverhalten zu analysieren und die Nutzererfahrung zu verbessern. Die
          Cookie-Einstellungen können jederzeit angepasst oder die Einwilligung mit Wirkung für die
          Zukunft widerrufen werden.
        </p>
        <div className="flex flex-col items-center mt-10 gap-6 w-full sm:flex-row sm:items-start sm:justify-end">
          <button className={buttonSecondaryClassName} onClick={() => handleConsent('needed')}>
            Nur notwendige
          </button>
          <button
            className={buttonPrimaryClassName}
            ref={acceptButtonRef}
            onClick={() => handleConsent('all')}
          >
            Alle akzeptieren
          </button>
        </div>
      </div>
    </dialog>
  );
}

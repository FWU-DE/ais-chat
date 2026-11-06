'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@ui/components/alert-dialog';
import { useTranslations } from 'next-intl';
import React from 'react';

const LOGOUT_URL = '/api/auth/logout';

type ProductAccessModalProps = {
  modalTitle: string;
  children: React.ReactNode;
};

export default function ProductAccessModal({ children, modalTitle }: ProductAccessModalProps) {
  const t = useTranslations('common');
  return (
    <AlertDialog open defaultOpen>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{modalTitle}</AlertDialogTitle>
          <AlertDialogDescription>{children}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            variant="outline"
            onClick={() => {
              // Full page navigation is required so the browser follows the route handler's redirect after clearing the session cookie.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign(LOGOUT_URL);
            }}
          >
            {t('logout')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

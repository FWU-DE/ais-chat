'use client';

import { CustomChatFormStateProps } from '@/components/custom-chat/custom-chat-form-state';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

type CustomChatHeaderContentContextValue = {
  formStateProps: CustomChatFormStateProps | null;
  setFormStateProps: (value: CustomChatFormStateProps | null) => void;
};

const CustomChatHeaderContentContext = createContext<CustomChatHeaderContentContextValue | null>(
  null,
);

export function CustomChatHeaderContentProvider({ children }: { children: ReactNode }) {
  const [formStateProps, setFormStateProps] = useState<CustomChatFormStateProps | null>(null);

  const value = useMemo(
    () => ({
      formStateProps,
      setFormStateProps,
    }),
    [formStateProps],
  );

  return <CustomChatHeaderContentContext value={value}>{children}</CustomChatHeaderContentContext>;
}

export function useCustomChatHeaderContent() {
  const context = useContext(CustomChatHeaderContentContext);

  if (!context) {
    throw new Error(
      'useCustomChatHeaderContent must be used within CustomChatHeaderContentProvider',
    );
  }

  return context;
}

export function CustomChatHeaderContent({
  isDirty,
  isSubmitting,
  hasSaveError,
}: CustomChatFormStateProps) {
  const { setFormStateProps } = useCustomChatHeaderContent();

  useEffect(() => {
    setFormStateProps({ isDirty, isSubmitting, hasSaveError });
  }, [hasSaveError, isDirty, isSubmitting, setFormStateProps]);

  // Clear on unmount only
  useEffect(() => {
    return () => {
      setFormStateProps(null);
    };
  }, [setFormStateProps]);

  return null;
}

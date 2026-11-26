'use client';

import React, { createContext, useContext, useState } from 'react';

type ImageAssistantContextValue = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isEnabled: boolean;
};

const ImageAssistantContext = createContext<ImageAssistantContextValue | null>(null);

export function ImageAssistantProvider({
  children,
  isEnabled,
}: {
  children: React.ReactNode;
  isEnabled: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <ImageAssistantContext.Provider value={{ isOpen, setIsOpen, isEnabled }}>
      {children}
    </ImageAssistantContext.Provider>
  );
}

export function useImageAssistant() {
  const ctx = useContext(ImageAssistantContext);
  if (!ctx) throw new Error('useImageAssistant must be used within ImageAssistantProvider');
  return ctx;
}

'use client';

import React from 'react';

import { ImageAspectRatioPreset } from './image-generation-types';

type ImageAspectRatioContextProps = {
  aspectRatio: ImageAspectRatioPreset;
  setAspectRatio: (aspectRatio: ImageAspectRatioPreset) => void;
};

const ImageAspectRatioContext = React.createContext<ImageAspectRatioContextProps | undefined>(
  undefined,
);

export function ImageAspectRatioProvider({
  children,
  defaultAspectRatio,
}: {
  children: React.ReactNode;
  defaultAspectRatio?: ImageAspectRatioPreset;
}) {
  const [aspectRatio, setAspectRatio] = React.useState<ImageAspectRatioPreset>(
    defaultAspectRatio ?? 'quadratic',
  );
  return (
    <ImageAspectRatioContext value={{ aspectRatio, setAspectRatio }}>
      {children}
    </ImageAspectRatioContext>
  );
}

export function useImageAspectRatio() {
  const context = React.useContext(ImageAspectRatioContext);
  if (context === undefined) {
    throw new Error('useImageAspectRatio must be used within an ImageAspectRatioProvider');
  }

  return context;
}

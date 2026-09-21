'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { ImageStyle, ImageStyleType } from '@shared/utils/chat';

type ImageStyleProviderProps = {
  children: React.ReactNode;
};

type ImageStyleContextProps = {
  styles: ImageStyle[];
  selectedStyle: ImageStyle | undefined;
  setSelectedStyle: (style: ImageStyle | undefined) => void;
};

type UseImageStyleResult = ImageStyleContextProps & {
  selectableStyles: ImageStyle[];
};

const ImageStyleContext = React.createContext<ImageStyleContextProps | undefined>(undefined);

function useImageStyles() {
  const t = useTranslations('image-generation.style');

  return [
    {
      name: 'none' as ImageStyleType,
      displayName: t('no-style'),
      prompt: '',
    },
    {
      name: 'photorealistic' as ImageStyleType,
      displayName: t('photorealistic'),
      prompt: 'Create a photorealistic image with natural lighting and realistic textures',
    },
    {
      name: 'cartoon' as ImageStyleType,
      displayName: t('cartoon'),
      prompt: 'Create a cartoon-style image with vibrant colors and stylized features',
    },
  ];
}

export function ImageStyleProvider({
  children,
  defaultImageStyle,
}: ImageStyleProviderProps & { defaultImageStyle?: string }) {
  const styles = useImageStyles();
  const [selectedStyle, setSelectedStyle] = React.useState<ImageStyle | undefined>(
    styles.find((style) => style.name === defaultImageStyle) || styles[0],
  );

  return (
    <ImageStyleContext value={{ styles, selectedStyle, setSelectedStyle }}>
      {children}
    </ImageStyleContext>
  );
}

export function useImageStyle(): UseImageStyleResult {
  const maybeContext = React.useContext(ImageStyleContext);

  if (maybeContext === undefined) {
    throw new Error('useImageStyle can only be used inside a ImageStyleProvider');
  }

  const selectableStyles = maybeContext.styles.filter((style) => {
    if (maybeContext.selectedStyle === undefined) {
      return style.name !== 'none';
    }

    return style.name !== maybeContext.selectedStyle.name;
  });

  return {
    ...maybeContext,
    selectableStyles,
  };
}

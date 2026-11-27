'use client';

import type { LlmModel } from '@ais-chat/api-database';
import { getFirstTextModel } from '@shared/llm-models/llm-model-utils';
import React, { useState } from 'react';

type LlmModelsProviderProps = {
  models: LlmModel[];
  initialModelName: string;
  defaultModelName: string;
  initialDownloadConversationEnabled?: boolean;
  children: React.ReactNode;
};

type LlmModelsContextProps = {
  models: LlmModel[];
  defaultModel: LlmModel | undefined;
  selectedModel: LlmModel | undefined;
  setSelectedModel: (model: LlmModel) => Promise<void>;
  downloadConversationEnabled: boolean;
  setDownloadConversationEnabled: (value: boolean) => void;
};

const LlmModelsContext = React.createContext<LlmModelsContextProps | undefined>(undefined);

export function LlmModelsProvider({
  models,
  children,
  initialModelName,
  defaultModelName,
  initialDownloadConversationEnabled = false,
}: LlmModelsProviderProps) {
  const defaultModel = models.find((model) => model.name === defaultModelName);
  const [selectedModel, setSelectedModelState] = useState<LlmModel | undefined>(
    () =>
      models.find((model) => model.name === initialModelName) ??
      defaultModel ??
      getFirstTextModel(models),
  );
  const [downloadConversationEnabled, setDownloadConversationEnabled] = useState(
    initialDownloadConversationEnabled,
  );

  async function setSelectedModel(model: LlmModel) {
    // optimistically update selected model
    const previousModel = selectedModel;
    setSelectedModelState(model);
    try {
      // Use a route handler instead of a Server Action to avoid Next.js automatically
      // refreshing the router cache (which happens when a Server Action writes cookies).
      const response = await fetch('/api/user/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: model.name }),
      });

      if (!response.ok) {
        setSelectedModelState(previousModel);
      }
    } catch {
      setSelectedModelState(previousModel);
    }
  }

  return (
    <LlmModelsContext
      value={{
        models,
        defaultModel,
        selectedModel,
        setSelectedModel,
        downloadConversationEnabled,
        setDownloadConversationEnabled,
      }}
    >
      {children}
    </LlmModelsContext>
  );
}

export function useLlmModels(): LlmModelsContextProps {
  const maybeContext = React.useContext(LlmModelsContext);

  if (maybeContext === undefined) {
    throw new Error('useLlmModels can only be used inside a LlmModelsProvider');
  }
  return maybeContext;
}

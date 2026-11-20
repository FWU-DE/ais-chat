'use client';

import { MagicWandIcon, PaperPlaneRightIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/components/sheet';
import { Spinner } from '@ui/components/spinner';
import { useTranslations } from 'next-intl';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { imageAssistantAction } from '@/app/(authed)/(chat-bot)/image-generation/image-assistant-actions';
import { type AssistantMessage } from '@/app/(authed)/(chat-bot)/image-generation/image-assistant-service';
import AutoResizeTextarea from '@/components/common/auto-resize-textarea';

const FINAL_PROMPT_MARKER = 'FINAL_PROMPT:';
const DISPLAY_PROMPT_MARKER = 'DISPLAY_PROMPT:';
const OPTIONS_MARKER = 'OPTIONS:';

type ParsedMessage = {
  text: string;
  finalPrompt: string | null;
  displayPrompt: string | null;
  options: string[];
};

function parseAssistantMessage(content: string): ParsedMessage {
  let text = content;
  let finalPrompt: string | null = null;
  let displayPrompt: string | null = null;
  const options: string[] = [];

  const finalIdx = text.indexOf(FINAL_PROMPT_MARKER);
  if (finalIdx !== -1) {
    const afterFinal = text.slice(finalIdx + FINAL_PROMPT_MARKER.length);
    const dispIdx = afterFinal.indexOf(DISPLAY_PROMPT_MARKER);
    if (dispIdx !== -1) {
      finalPrompt = afterFinal.slice(0, dispIdx).trim();
      displayPrompt = afterFinal.slice(dispIdx + DISPLAY_PROMPT_MARKER.length).trim();
    } else {
      finalPrompt = afterFinal.trim();
    }
    text = text.slice(0, finalIdx).trim();
  }

  const optionsIdx = text.indexOf(OPTIONS_MARKER);
  if (optionsIdx !== -1) {
    const raw = text.slice(optionsIdx + OPTIONS_MARKER.length).trim();
    const firstLine = raw.split('\n')[0] ?? '';
    options.push(
      ...firstLine
        .split('|')
        .map((o) => o.trim())
        .filter(Boolean),
    );
    text = text.slice(0, optionsIdx).trim();
  }

  return { text, finalPrompt, displayPrompt, options };
}

interface ImageAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPromptGenerated: (prompt: string) => void;
  onSubmitPrompt?: (prompt: string) => void;
  onInsertPrompt?: (prompt: string) => void;
  initialPrompt?: string;
}

export function ImageAssistant({
  open,
  onOpenChange,
  onPromptGenerated,
  onSubmitPrompt,
  onInsertPrompt,
  initialPrompt,
}: ImageAssistantProps) {
  const t = useTranslations('image-generation');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const kickOff = useCallback(() => {
    const prompt = initialPrompt?.trim();
    const openingContent = prompt
      ? `Bereits eingegebener Text:\n\n„${prompt.replace(/[<>]/g, '').slice(0, 300)}"\n\nSoll dieser als Ausgangspunkt verwendet werden?\n\nOPTIONS: Ja, bestehenden Text verwenden | Nein, neu beginnen`
      : t('assistant-opening-question');
    setMessages([{ role: 'assistant', content: openingContent }]);
    setInput('');
    setError(null);
  }, [initialPrompt, t]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void kickOff();
    }
  }, [open, kickOff]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: AssistantMessage = { role: 'user', content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setIsLoading(true);
    setError(null);

    const result = await imageAssistantAction(next, initialPrompt);
    if (result.success) {
      setMessages([...next, { role: 'assistant', content: result.value }]);
    } else {
      setError(t('assistant-error'));
    }
    setIsLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader className="px-5 pt-5 pb-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <MagicWandIcon className="size-5" weight="duotone" />
            {t('assistant-title')}
          </SheetTitle>
          <SheetDescription>{t('assistant-description')}</SheetDescription>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-6 pb-5 space-y-6 min-h-0">
          {messages.map((msg, idx) => {
            if (msg.role === 'assistant') {
              const { text, finalPrompt, displayPrompt, options } = parseAssistantMessage(
                msg.content,
              );
              const isLastMessage = idx === messages.length - 1;
              return (
                <div key={idx} className="flex flex-col gap-3">
                  {text && (
                    <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 text-sm max-w-[88%] whitespace-pre-wrap leading-relaxed">
                      {text}
                    </div>
                  )}
                  {options.length > 0 && isLastMessage && !isLoading && (
                    <div className="flex flex-col gap-2 max-w-[88%]">
                      <div className="flex flex-wrap gap-2">
                        {options.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => void sendMessage(option)}
                            className="px-3 py-1.5 text-xs rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{t('assistant-or-type-own')}</p>
                    </div>
                  )}
                  {finalPrompt && (
                    <div className="border border-primary/25 bg-primary/5 rounded-xl p-4 max-w-[95%]">
                      <p className="text-xs font-semibold text-primary mb-1.5">
                        {t('assistant-generated-prompt-label')}
                      </p>
                      <p className="text-sm leading-relaxed">{displayPrompt ?? finalPrompt}</p>
                      {displayPrompt && (
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer select-none">
                            {t('assistant-show-english-prompt')}
                          </summary>
                          <p className="text-xs text-muted-foreground mt-1 font-mono leading-relaxed">
                            {finalPrompt}
                          </p>
                        </details>
                      )}
                      <Button
                        onClick={() => {
                          onPromptGenerated(finalPrompt);
                          onOpenChange(false);
                          onSubmitPrompt?.(finalPrompt);
                        }}
                        size="sm"
                        className="mt-3 w-full"
                      >
                        {t('assistant-use-prompt')}
                      </Button>
                      {onInsertPrompt && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            onInsertPrompt(finalPrompt);
                            onOpenChange(false);
                          }}
                          size="sm"
                          className="mt-2 w-full"
                        >
                          {t('assistant-insert-prompt')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div key={idx} className="flex justify-end">
                <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-[88%] whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground py-1">
              <Spinner className="size-4" />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t shrink-0">
          <div className="flex gap-2 items-end">
            <AutoResizeTextarea
              value={input}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('assistant-input-placeholder')}
              className="flex-1 text-sm min-h-[38px] rounded-lg border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isLoading}
            />
            <Button
              onClick={() => void sendMessage(input)}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="shrink-0"
            >
              <PaperPlaneRightIcon className="size-4" />
              <span className="sr-only">{t('assistant-send')}</span>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

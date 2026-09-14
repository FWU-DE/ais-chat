'use client';

import {
  BooksIcon,
  CalculatorIcon,
  CaretRightIcon,
  CheckCircleIcon,
  FileMagnifyingGlassIcon,
  FileTextIcon,
  GlobeSimpleIcon,
  MagnifyingGlassIcon,
  SparkleIcon,
  type Icon,
} from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ui/components/dialog';
import { cn } from '@/utils/tailwind';
import type { AiActivityStep, AiActivityToolName } from '@/types/ai-activity';

const TOOL_ICONS: Record<AiActivityToolName, Icon> = {
  web_search: MagnifyingGlassIcon,
  web_scraper: GlobeSimpleIcon,
  retrieve_text_chunks: FileMagnifyingGlassIcon,
  retrieve_entire_file: FileTextIcon,
  mundo_search: BooksIcon,
  math_calculate: CalculatorIcon,
};

type Translator = ReturnType<typeof useTranslations>;

export function getAiActivityStepTitle(step: AiActivityStep, t: Translator): string {
  switch (step.kind) {
    case 'analysis':
      return t('steps.analysis');
    case 'done':
      return t('steps.done');
    case 'tool':
      return t(`steps.${step.tool}`);
  }
}

function getLinkDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
}

function StepIcon({ step }: { step: AiActivityStep }) {
  if (step.kind === 'analysis') {
    return <SparkleIcon className="size-4" />;
  }

  if (step.kind === 'done') {
    return <CheckCircleIcon className="size-4" weight="fill" />;
  }

  const ToolIcon = TOOL_ICONS[step.tool];
  return <ToolIcon className="size-4" />;
}

function StepDetail({ step }: { step: Extract<AiActivityStep, { kind: 'tool' }> }) {
  const detail =
    step.tool === 'math_calculate'
      ? [step.detail, step.result].filter((part) => part !== undefined).join(' = ')
      : step.detail;

  return detail === undefined || detail.length === 0 ? null : (
    <span className="min-w-0 text-sm text-black/50">{detail}</span>
  );
}

function ActivityStep({ step, isLast }: { step: AiActivityStep; isLast: boolean }) {
  const t = useTranslations('ai-activity');
  const links = step.kind === 'tool' ? (step.links ?? []) : [];

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <StepIcon step={step} />
        </span>
        {!isLast && <span className="w-px flex-1 bg-primary/15" />}
      </div>

      <div className={cn('flex min-w-0 flex-1 flex-col gap-2 pt-1', isLast ? 'pb-0' : 'pb-4')}>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-medium text-black">{getAiActivityStepTitle(step, t)}</span>
          {step.kind === 'tool' && <StepDetail step={step} />}
        </div>

        {links.length > 0 && (
          <ul className="max-h-44 overflow-y-auto rounded-xl border border-[#e7e7e7] bg-white p-1">
            {links.map((link, index) => (
              <li key={`${link.url}-${index}`}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 hover:bg-secondary/20"
                  title={link.title}
                  aria-label={t('open-source', { source: link.title })}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-black">{link.title}</span>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {getLinkDomain(link.url)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function ActivityStepList({ steps }: { steps: AiActivityStep[] }) {
  return (
    <ul className="flex flex-col">
      {steps.map((step, index) => (
        <ActivityStep
          key={step.kind === 'tool' ? step.id : `${step.kind}-${index}`}
          step={step}
          isLast={index === steps.length - 1}
        />
      ))}
    </ul>
  );
}

/**
 * Collapsed by default on every render — the open state is intentionally not persisted.
 */
export function AiActivityPanel({ steps, panelId }: { steps: AiActivityStep[]; panelId: string }) {
  const t = useTranslations('ai-activity');
  const [isOpen, setIsOpen] = useState(false);

  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="flex w-full flex-col items-start gap-3">
      <Button
        variant="ghost"
        className="h-auto gap-1 rounded-full bg-black/10 px-3 py-1 text-sm text-main-900 hover:bg-black/15"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        title={t('toggle')}
      >
        <span>{t('title')}</span>
        <CaretRightIcon
          className={cn('size-3 transition-transform', isOpen ? 'rotate-90' : 'rotate-0')}
          weight="bold"
        />
      </Button>

      {isOpen && (
        <div
          id={panelId}
          className="w-full overflow-hidden rounded-xl border border-[#e7e7e7] bg-white p-4"
        >
          <ActivityStepList steps={steps} />
        </div>
      )}
    </div>
  );
}

/** Dialog variant used in dialog partner chats, where the activity must not take over the layout. */
export function AiActivityDialog({ steps }: { steps: AiActivityStep[] }) {
  const t = useTranslations('ai-activity');

  if (steps.length === 0) {
    return null;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button title={t('show')} aria-label={t('show')} variant="ghost" size="icon">
          <SparkleIcon className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          <ActivityStepList steps={steps} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

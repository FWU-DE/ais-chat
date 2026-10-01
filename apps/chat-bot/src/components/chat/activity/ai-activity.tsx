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
import { truncate } from '@/utils/chat/ai-activity';
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
    case 'analysis-summary':
      return t('steps.analysis-summary');
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

  if (step.kind === 'analysis-summary') {
    return <SparkleIcon className="size-4" weight="fill" />;
  }

  if (step.kind === 'done') {
    return <CheckCircleIcon className="size-4" weight="fill" />;
  }

  const ToolIcon = TOOL_ICONS[step.tool];
  return <ToolIcon className="size-4" />;
}

function StepDetail({ step }: { step: Extract<AiActivityStep, { kind: 'tool' }> }) {
  const visibleDetail = truncate(step.detail);
  const visibleResult = truncate(step.result);
  const text =
    visibleDetail === undefined
      ? visibleResult === undefined
        ? undefined
        : `= ${visibleResult}`
      : visibleResult === undefined
        ? visibleDetail
        : `${visibleDetail} = ${visibleResult}`;

  return text === undefined || text.length === 0 ? null : (
    <span title={step.detail} className="min-w-0 truncate text-sm text-black/50">
      {text}
    </span>
  );
}

function AnalysisSummaryContent({ content }: { content: string }) {
  if (content.length === 0) {
    return null;
  }

  return <p className="whitespace-pre-wrap text-sm text-black/70">{content}</p>;
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

        {step.kind === 'analysis-summary' && <AnalysisSummaryContent content={step.content} />}
        {links.length > 0 && (
          <ul className="max-h-44 overflow-y-auto rounded-xl border border-border bg-background-2 p-1">
            {links.map((link, index) => (
              <li key={`${link.url}-${index}`}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 hover:bg-background-2"
                  title={link.title}
                  aria-label={t('open-source', { source: link.title })}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-black">{link.title}</span>
                  <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-primary/15 bg-primary/8 px-2 text-[13px] font-medium leading-none text-primary">
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

export function ActivityStepList({ steps }: { steps: AiActivityStep[] }) {
  // Since the raw reasoning is never shown in the step 'analysis' and also not saved in the DB
  // it should not be displayed in the ai activity panel does not make sense, only the summary step should be shown, if summary exists
  const displaySteps = steps.filter((step) => step.kind !== 'analysis');

  if (displaySteps.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col">
      {displaySteps.map((step, index) => (
        <ActivityStep
          key={step.kind === 'tool' ? step.id : `${step.kind}-${index}`}
          step={step}
          isLast={index === displaySteps.length - 1}
        />
      ))}
    </ul>
  );
}

export function AiActivityDialog({ steps }: { steps: AiActivityStep[] }) {
  const t = useTranslations('ai-activity');

  if (steps.every((step) => step.kind === 'analysis')) {
    return null;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-primary"
          title={t('toggle')}
          aria-label={t('toggle')}
        >
          <SparkleIcon className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-5" showCloseButton>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto">
          <ActivityStepList steps={steps} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AiActivityPanel({ steps, panelId }: { steps: AiActivityStep[]; panelId: string }) {
  const t = useTranslations('ai-activity');
  const [isOpen, setIsOpen] = useState(false);

  if (steps.every((step) => step.kind === 'analysis')) {
    return null;
  }

  return (
    <div className="flex w-full flex-col items-start gap-3">
      <Button
        variant="ghost"
        className="h-auto gap-1 rounded-full bg-main-black/10 px-3 py-1 text-sm text-main-900 hover:bg-black/15"
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
          className="w-full overflow-hidden rounded-xl border border-border bg-white p-4"
        >
          <ActivityStepList steps={steps} />
        </div>
      )}
    </div>
  );
}

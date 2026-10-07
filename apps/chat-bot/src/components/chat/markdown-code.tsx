import React from 'react';
import { type ExtraProps } from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { nightOwl } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { cn } from '@/utils/tailwind';
import CopyToClipboardButton from '../common/clipboard-button';
import { getCodeTitle } from '@/utils/code-blocks';

export function MarkdownCode({
  className,
  children,
  node,
  ...props
}: React.ComponentProps<'code'> & ExtraProps) {
  // react-markdown passes the fence info after the language (`title="…"`) as `data.meta`.
  const title = getCodeTitle((node?.data as { meta?: string } | undefined)?.meta);
  const sanitizedText = String(children).replace(/\n$/, '');
  const match = /language-([\w-]+)/.exec(className || '');

  const language = match?.[1];

  if (language === undefined) {
    return (
      <code className={cn(className, 'wrap-break-word bg-main-200 px-0.5 text-wrap text-sm')}>
        {children}
      </code>
    );
  }

  return (
    <div className="flex flex-col py-2 text-sm max-w-full">
      <div className="flex items-center justify-center bg-gray-300 py-2 px-2">
        <span>{title ? `${language} – ${title}` : language}</span>
        <div className="grow" />
        <CopyToClipboardButton text={sanitizedText} />
      </div>
      <SyntaxHighlighter
        // @ts-expect-error wrong typing
        style={nightOwl}
        language={language}
        PreTag="pre"
        {...props}
        customStyle={{
          overflowX: 'auto',
          margin: '0rem',
        }}
      >
        {sanitizedText}
      </SyntaxHighlighter>
    </div>
  );
}

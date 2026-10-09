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
  const sanitizedText = String(children).replace(/\n$/, '');
  // remark only treats the fence info's first word as the language; without one, an attribute
  // like `title="…"` ends up split across the className and `data.meta` — rejoin them to get
  // back the original info string before parsing the title.
  const rawToken = /language-(.*)/.exec(className || '')?.[1];
  const info = [rawToken, node?.data?.meta].filter(Boolean).join(' ');
  const title = getCodeTitle(info);

  const language = rawToken && /^[\w-]+$/.test(rawToken) ? rawToken : undefined;
  // A missing language class means either inline code or an untagged fenced block;
  // only single-line content without a language is treated as inline.
  const isInlineCode = language === undefined && !sanitizedText.includes('\n');

  if (isInlineCode) {
    return (
      <code className={cn(className, 'wrap-break-word bg-main-200 px-0.5 text-wrap text-sm')}>
        {children}
      </code>
    );
  }

  return (
    <div className="flex flex-col py-2 text-sm max-w-full">
      <div className="flex items-center justify-center bg-gray-300 py-2 px-2 gap-2">
        <span className="min-w-0 grow truncate">
          {[language, title].filter(Boolean).join(' – ')}
        </span>
        <div className="shrink-0">
          <CopyToClipboardButton text={sanitizedText} />
        </div>
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

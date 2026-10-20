import Markdown from 'react-markdown';
import { cn } from '@/utils/tailwind';

type AnalysisSummaryMarkdownProps = {
  children: string;
};

// The analysis summary only ever uses bold, italics, lists, and inline code in practice, so this
// renders a narrow subset instead of pulling in the full MarkdownDisplay (KaTeX, GFM, plots, …).
export function AnalysisSummaryMarkdown({ children }: AnalysisSummaryMarkdownProps) {
  return (
    <div className="text-sm text-black/70">
      <Markdown
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          p({ children, className, node, ...props }) {
            return (
              <p className={cn('whitespace-pre-wrap pt-1 first:pt-0', className)} {...props}>
                {children}
              </p>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          strong({ children, className, node, ...props }) {
            return (
              <strong className={cn('font-semibold', className)} {...props}>
                {children}
              </strong>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          em({ children, className, node, ...props }) {
            return (
              <em className={cn('italic', className)} {...props}>
                {children}
              </em>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ul({ children, className, node, ...props }) {
            return (
              <ul className={cn('ml-5 list-disc', className)} {...props}>
                {children}
              </ul>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ol({ children, className, node, ...props }) {
            return (
              <ol className={cn('ml-5 list-decimal', className)} {...props}>
                {children}
              </ol>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          li({ children, className, node, ...props }) {
            return (
              <li className={cn(className)} {...props}>
                {children}
              </li>
            );
          },
          code: 'code',
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}

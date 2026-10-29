import { cn } from '@/utils/tailwind';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import Markdown, { type Components } from 'react-markdown';
import RehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import RemarkMathPlugin from 'remark-math-extended';
import { MarkdownCode } from './markdown-code';
import { JsxGraphPlotElement } from './plot/plot-block';
import { JSXGRAPH_PLOT_HNAME, rehypeJsxGraphPlot } from './plot/rehype-jsxgraph-plot';

type MarkdownDisplayProps = {
  children: string;
  className?: string;
  /** Per-element Tailwind class overrides, merged over the default styles. */
  elementClassName?: { [Key in keyof Components]?: string };
};

const KATEX_RENDER_OPTIONS = {
  strict: false,
};

export default function MarkdownDisplay({
  children,
  className,
  elementClassName,
}: MarkdownDisplayProps) {
  // remove the top-padding for the immediate sibling element following an hr to ensure the hr has symmetric top/bottom padding
  const removeTopPaddingAfterHrClass = '[&>hr+*]:pt-0';

  return (
    <div
      className={cn(
        'w-full min-w-0 wrap-break-word text-base',
        removeTopPaddingAfterHrClass,
        className,
      )}
    >
      <Markdown
        remarkPlugins={[RemarkMathPlugin, remarkGfm]}
        rehypePlugins={[[RehypeKatex, KATEX_RENDER_OPTIONS], rehypeJsxGraphPlot]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          h1({ children, className, node, ...props }) {
            return (
              <h1
                className={cn(
                  'text-3xl font-bold pt-4 pb-2 first:pt-0',
                  elementClassName?.h1,
                  className,
                )}
                {...props}
              >
                {children}
              </h1>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          h2({ children, className, node, ...props }) {
            return (
              <h2
                className={cn(
                  'text-2xl font-bold pt-3 pb-2 first:pt-0',
                  elementClassName?.h2,
                  className,
                )}
                {...props}
              >
                {children}
              </h2>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          h3({ children, className, node, ...props }) {
            return (
              <h3
                className={cn(
                  'text-xl font-bold pt-3 pb-1 first:pt-0',
                  elementClassName?.h3,
                  className,
                )}
                {...props}
              >
                {children}
              </h3>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          h4({ children, className, node, ...props }) {
            return (
              <h4
                className={cn(
                  'text-lg font-semibold pt-2 pb-1 first:pt-0',
                  elementClassName?.h4,
                  className,
                )}
                {...props}
              >
                {children}
              </h4>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          h5({ children, className, node, ...props }) {
            return (
              <h5
                className={cn(
                  'text-base font-semibold pt-2 pb-1 first:pt-0',
                  elementClassName?.h5,
                  className,
                )}
                {...props}
              >
                {children}
              </h5>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          h6({ children, className, node, ...props }) {
            return (
              <h6
                className={cn(
                  'text-sm font-semibold pt-2 pb-1 first:pt-0',
                  elementClassName?.h6,
                  className,
                )}
                {...props}
              >
                {children}
              </h6>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          a({ href, children, className, node, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn('text-primary', elementClassName?.a, className)}
                style={{
                  textDecoration: 'underline',
                  textUnderlineOffset: '4px',
                }}
                {...props}
              >
                {children}
              </a>
            );
          },
          // @ts-expect-error plugin errors
          inlineMath({ value }) {
            return (
              <span
                dangerouslySetInnerHTML={{
                  __html: katex.renderToString(value, {
                    ...KATEX_RENDER_OPTIONS,
                    displayMode: false,
                  }),
                }}
              />
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          hr({ className, node, ...props }) {
            return <hr className={cn('my-6', elementClassName?.hr, className)} {...props} />;
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          th({ children, className, node, ...props }) {
            return (
              <th
                className={cn(
                  'text-left p-2 border bg-muted font-medium',
                  elementClassName?.th,
                  className,
                )}
                {...props}
              >
                {children}
              </th>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          td({ children, className, node, ...props }) {
            return (
              <td className={cn('p-2 border', elementClassName?.td, className)} {...props}>
                {children}
              </td>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          tr({ children, className, node, ...props }) {
            return (
              <tr className={cn(elementClassName?.tr, className)} {...props}>
                {children}
              </tr>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          table({ children, className, node, ...props }) {
            // The scroll container keeps wide tables from stretching the whole message, so only
            // the table scrolls horizontally while the surrounding text stays within the viewport.
            return (
              <div className="my-4 first:mt-0 last:mb-0 max-w-full overflow-x-auto">
                <table
                  className={cn(
                    'w-full border border-collapse',
                    elementClassName?.table,
                    className,
                  )}
                  {...props}
                >
                  {children}
                </table>
              </div>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          strong({ children, className, node, ...props }) {
            return (
              <strong
                className={cn('font-semibold', elementClassName?.strong, className)}
                {...props}
              >
                {children}
              </strong>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ul({ children, className, node, ...props }) {
            return (
              <ul
                className={cn('ml-6 py-1 space-y-2 list-square', elementClassName?.ul, className)}
                {...props}
              >
                {children}
              </ul>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ol({ children, className, node, ...props }) {
            return (
              <ol
                className={cn('list-decimal ml-6 py-1 space-y-2', elementClassName?.ol, className)}
                {...props}
              >
                {children}
              </ol>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          li({ children, className, node, ...props }) {
            return (
              <li className={cn(elementClassName?.li, className)} {...props}>
                {children}
              </li>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          p({ children, className, node, ...props }) {
            return (
              <p
                className={cn(
                  'pt-1 pb-3 first:pt-0 last:pb-0 whitespace-pre-wrap',
                  elementClassName?.p,
                  className,
                )}
                {...props}
              >
                {children}
              </p>
            );
          },
          code: MarkdownCode,
          [JSXGRAPH_PLOT_HNAME]: JsxGraphPlotElement,
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import RehypeKatex from 'rehype-katex';
import RemarkMathPlugin from 'remark-math';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { cn } from '@/utils/tailwind';
import { MarkdownCode } from './markdown-code';
import { rehypeJsxGraphPlot, JSXGRAPH_PLOT_HNAME } from './plot/rehype-jsxgraph-plot';
import { JsxGraphPlotElement } from './plot/plot-block';

type MarkdownDisplayProps = {
  children: string;
};

const KATEX_RENDER_OPTIONS = {
  strict: false,
};

function preprocessMathDelimiters(markdown: string) {
  return (
    markdown
      // Replace \( ... \) with $ ... $ for inline math
      .replace(/\\\((.*?)\\\)/gs, (_, content) => `$${content}$`)
      // Replace \[ ... \] with $$ ... $$ for block math
      .replace(/\\\[(.*?)\\\]/gs, (_, content) => `$$${content}$$`)
  );
}

export default function MarkdownDisplay({ children: _children }: MarkdownDisplayProps) {
  const children = preprocessMathDelimiters(_children);

  // remove the top-padding for the immediate sibling element following an hr to ensure the hr has symmetric top/bottom padding
  const removeTopPaddingAfterHrClass = '[&>hr+*]:pt-0';

  return (
    <div className={cn('w-full min-w-0 wrap-break-word text-base', removeTopPaddingAfterHrClass)}>
      <Markdown
        remarkPlugins={[RemarkMathPlugin, remarkGfm]}
        rehypePlugins={[[RehypeKatex, KATEX_RENDER_OPTIONS], rehypeJsxGraphPlot]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          h1({ children, className, node, ...props }) {
            return (
              <h1 className={cn('text-3xl font-bold pt-4 pb-2 first:pt-0', className)} {...props}>
                {children}
              </h1>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          h2({ children, className, node, ...props }) {
            return (
              <h2 className={cn('text-2xl font-bold pt-3 pb-2 first:pt-0', className)} {...props}>
                {children}
              </h2>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          h3({ children, className, node, ...props }) {
            return (
              <h3 className={cn('text-xl font-bold pt-3 pb-1 first:pt-0', className)} {...props}>
                {children}
              </h3>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          h4({ children, className, node, ...props }) {
            return (
              <h4
                className={cn('text-lg font-semibold pt-2 pb-1 first:pt-0', className)}
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
                className={cn('text-base font-semibold pt-2 pb-1 first:pt-0', className)}
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
                className={cn('text-sm font-semibold pt-2 pb-1 first:pt-0', className)}
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
                className={cn('text-primary', className)}
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
            return <hr className={cn('my-6', className)} {...props} />;
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          th({ children, className, node, ...props }) {
            return (
              <th
                className={cn('text-left p-2 border bg-slate-100 font-medium', className)}
                {...props}
              >
                {children}
              </th>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          td({ children, className, node, ...props }) {
            return (
              <td className={cn('p-2 border', className)} {...props}>
                {children}
              </td>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          tr({ children, className, node, ...props }) {
            return (
              <tr className={cn(className)} {...props}>
                {children}
              </tr>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          table({ children, className, node, ...props }) {
            return (
              <table
                className={cn('w-full border my-4 first:mt-0 last:mb-0 border-collapse', className)}
                {...props}
              >
                {children}
              </table>
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
          ul({ children, className, node, ...props }) {
            return (
              <ul className={cn('ml-6 py-1 space-y-2 list-square', className)} {...props}>
                {children}
              </ul>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ol({ children, className, node, ...props }) {
            return (
              <ol className={cn('list-decimal ml-6 py-1 space-y-2', className)} {...props}>
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
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          p({ children, className, node, ...props }) {
            return (
              <p
                className={cn('pt-1 pb-3 first:pt-0 last:pb-0 whitespace-pre-wrap', className)}
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

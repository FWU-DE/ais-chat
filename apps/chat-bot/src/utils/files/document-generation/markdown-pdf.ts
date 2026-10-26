import { existsSync } from 'node:fs';
import { chromium, type Browser, type LaunchOptions } from 'playwright-core';
import { renderMarkdownHtml, type MarkdownHtmlOptions } from './markdown-html';

export type MarkdownPdfOptions = MarkdownHtmlOptions & {
  browser?: Browser;
  launchOptions?: LaunchOptions;
};

function getSystemChromiumPath() {
  return ['/usr/bin/chromium-browser', '/usr/bin/chromium'].find((path) => existsSync(path));
}

export async function renderMarkdownPdf(
  markdown: string,
  { browser, launchOptions, ...htmlOptions }: MarkdownPdfOptions = {},
): Promise<Buffer> {
  const executablePath = launchOptions?.executablePath ?? getSystemChromiumPath();
  const ownedBrowser =
    browser ?? (await chromium.launch({ headless: true, executablePath, ...launchOptions }));
  const page = await ownedBrowser.newPage();

  try {
    await page.setContent(await renderMarkdownHtml(markdown, htmlOptions), { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    return await page.pdf({
      format: 'A4',
      outline: true,
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
    });
  } finally {
    await page.close();
    if (browser === undefined) {
      await ownedBrowser.close();
    }
  }
}

import type PptxGenJS from 'pptxgenjs';

import type { PptxDesign } from './generated-document-format';

export const SLIDE_WIDTH = 13.33;
export const SLIDE_HEIGHT = 7.5;

type MasterObjects = NonNullable<PptxGenJS.SlideMasterProps['objects']>;

export type PptxTheme = {
  fontFace: string;
  background: string;
  text: string;
  muted: string;
  heading: string;
  link: string;
  codeBackground: string;
  tableHeaderFill: string;
  tableHeaderText: string;
  border: string;
  titleSlide: { background: string; title: string; subtitle: string };
  contentObjects: MasterObjects;
  titleObjects: MasterObjects;
};

function rect(x: number, y: number, w: number, h: number, color: string): MasterObjects[number] {
  return { rect: { x, y, w, h, fill: { color }, line: { color, width: 0 } } };
}

// Accent line below the title on title slides.
function titleSlideLine(color: string) {
  return rect((SLIDE_WIDTH - 1.5) / 2, 4.55, 1.5, 0.06, color);
}

export const PPTX_THEMES: Record<PptxDesign, PptxTheme> = {
  classic: {
    fontFace: 'Calibri',
    background: 'FFFFFF',
    text: '1F2937',
    muted: '6B7280',
    heading: '1E3A8A',
    link: '1D4ED8',
    codeBackground: 'F3F4F6',
    tableHeaderFill: '1E3A8A',
    tableHeaderText: 'FFFFFF',
    border: 'D1D5DB',
    titleSlide: { background: '1E3A8A', title: 'FFFFFF', subtitle: 'BFDBFE' },
    contentObjects: [rect(0, 0, SLIDE_WIDTH, 0.18, '2563EB'), rect(0.6, 1.28, 1.2, 0.05, '2563EB')],
    titleObjects: [
      rect(0, SLIDE_HEIGHT - 0.4, SLIDE_WIDTH, 0.4, '2563EB'),
      titleSlideLine('60A5FA'),
    ],
  },
  dark: {
    fontFace: 'Calibri',
    background: '111827',
    text: 'F3F4F6',
    muted: '9CA3AF',
    heading: 'FFFFFF',
    link: '67E8F9',
    codeBackground: '1F2937',
    tableHeaderFill: '22D3EE',
    tableHeaderText: '0F172A',
    border: '374151',
    titleSlide: { background: '0B1220', title: 'FFFFFF', subtitle: '9CA3AF' },
    contentObjects: [rect(0.3, 0.45, 0.08, 0.7, '22D3EE')],
    titleObjects: [titleSlideLine('22D3EE')],
  },
  // Brand colors of AIS.chat: violet primary, mint secondary.
  ais: {
    fontFace: 'Calibri',
    background: 'FFFFFF',
    text: '020817',
    muted: '64748B',
    heading: '46217D',
    link: '6D28D9',
    codeBackground: 'F4F0FA',
    tableHeaderFill: '46217D',
    tableHeaderText: 'FFFFFF',
    border: 'D9CCEB',
    titleSlide: { background: '46217D', title: 'FFFFFF', subtitle: 'D8B4FF' },
    contentObjects: [rect(0, 0, SLIDE_WIDTH, 0.18, '46217D'), rect(0.6, 1.28, 1.2, 0.05, '6DE9D6')],
    titleObjects: [
      rect(0, SLIDE_HEIGHT - 0.4, SLIDE_WIDTH, 0.4, '6DE9D6'),
      titleSlideLine('6DE9D6'),
    ],
  },
  minimal: {
    fontFace: 'Arial',
    background: 'FFFFFF',
    text: '111827',
    muted: '6B7280',
    heading: '000000',
    link: '1D4ED8',
    codeBackground: 'F5F5F5',
    tableHeaderFill: 'F3F4F6',
    tableHeaderText: '111827',
    border: 'D1D5DB',
    titleSlide: { background: 'FFFFFF', title: '000000', subtitle: '6B7280' },
    contentObjects: [rect(0.6, 1.3, SLIDE_WIDTH - 1.2, 0.015, 'D1D5DB')],
    titleObjects: [titleSlideLine('000000')],
  },
};

export function getMasterNames(design: PptxDesign) {
  return { content: `${design}-content`, title: `${design}-title` };
}

export function defineMasters(pptx: PptxGenJS, design: PptxDesign) {
  const theme = PPTX_THEMES[design];
  const names = getMasterNames(design);
  pptx.defineSlideMaster({
    title: names.content,
    background: { color: theme.background },
    objects: theme.contentObjects,
    slideNumber: {
      x: SLIDE_WIDTH - 1.2,
      y: SLIDE_HEIGHT - 0.55,
      w: 0.7,
      h: 0.3,
      align: 'right',
      fontSize: 12,
      fontFace: theme.fontFace,
      color: theme.muted,
    },
  });
  pptx.defineSlideMaster({
    title: names.title,
    background: { color: theme.titleSlide.background },
    objects: theme.titleObjects,
  });
}

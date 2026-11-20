import {
  FileCsvIcon,
  FileDocIcon,
  FileHtmlIcon,
  FileIcon,
  FileMdIcon,
  FilePdfIcon,
  FilePptIcon,
  FileTextIcon,
  FileTxtIcon,
  FileXlsIcon,
  Icon,
} from '@phosphor-icons/react';

import { isSupportedDocumentExtension, SupportedDocumentExtension } from '@/const';

type FileIconConfig = {
  Icon: Icon;
  fillColor: string;
};

export const FILE_ICONS_DICT: Record<SupportedDocumentExtension, FileIconConfig> = {
  csv: { Icon: FileCsvIcon, fillColor: '#107C42' },
  docx: { Icon: FileDocIcon, fillColor: '#1A59C0' },
  htm: { Icon: FileHtmlIcon, fillColor: '#9532C0' },
  html: { Icon: FileHtmlIcon, fillColor: '#9532C0' },
  md: { Icon: FileMdIcon, fillColor: '#000000' },
  ods: { Icon: FileXlsIcon, fillColor: '#107C42' },
  odp: { Icon: FilePptIcon, fillColor: '#C0391B' },
  odt: { Icon: FileDocIcon, fillColor: '#1A59C0' },
  pdf: { Icon: FilePdfIcon, fillColor: '#B30B00' },
  pptx: { Icon: FilePptIcon, fillColor: '#C0391B' },
  tex: { Icon: FileTextIcon, fillColor: '#000000' },
  txt: { Icon: FileTxtIcon, fillColor: '#000000' },
  xlsx: { Icon: FileXlsIcon, fillColor: '#107C42' },
};

export function getFileIconByFileExtension(fileExtension?: string) {
  if (fileExtension !== undefined && isSupportedDocumentExtension(fileExtension)) {
    return FILE_ICONS_DICT[fileExtension];
  }
  return { Icon: FileIcon, fillColor: '#333333' };
}

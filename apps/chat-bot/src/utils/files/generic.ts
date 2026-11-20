import type { SupportedFileExtension } from '@/const';
import { isSupportedFileExtension, isSupportedImageExtension } from '@/const';

function getLowercaseFileExtension(fileName: string): string | undefined {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.at(-1)?.toLowerCase() : undefined;
}

export function parseSupportedFileExtension(fileName: string): SupportedFileExtension | undefined {
  const fileExtension = getLowercaseFileExtension(fileName);
  return fileExtension !== undefined && isSupportedFileExtension(fileExtension)
    ? fileExtension
    : undefined;
}

export function getFileExtension(fileName: string) {
  const fileExtension = parseSupportedFileExtension(fileName);
  if (!fileExtension) {
    throw new Error(`file type ${getLowercaseFileExtension(fileName)} is not supported`);
  }
  return fileExtension;
}

export function isImageFile(fileName: string): boolean {
  const fileExtension = parseSupportedFileExtension(fileName);
  return fileExtension !== undefined && isSupportedImageExtension(fileExtension);
}

export function validateFileExtension(
  fileName: string,
  allowedFileExtensions: readonly string[],
): boolean {
  const fileExtension = getLowercaseFileExtension(fileName);

  return fileExtension !== undefined && allowedFileExtensions.includes(fileExtension);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1) {
    return '0 B';
  }

  const units: string[] = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const factor: number = 1024;
  let unitIndex = 0;

  while (bytes >= factor && unitIndex < units.length - 1) {
    bytes /= factor;
    unitIndex++;
  }

  // Convert to a string with up to 2 decimal places, removing unnecessary trailing zeros
  const roundedBytes = parseFloat(bytes.toFixed(2)).toString();

  return `${roundedBytes} ${units[unitIndex]}`;
}

export function getFileNameAndFileExtension(fileName: string): [string, string] {
  const parts = fileName.split('.');

  if (parts.length === 1) {
    return [fileName, ''];
  }
  const extension = parts.at(-1) ?? '';
  const fileStem = parts.slice(0, -1).join('.');
  return [fileStem, extension];
}

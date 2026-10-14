import { RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT } from '@/configuration-text-inputs/const';
import type { FileModel } from '@shared/db/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbGetExtractedFileContentMock: vi.fn(),
}));

vi.mock('@shared/db/functions/files', () => ({
  dbGetExtractedFileContent: mocks.dbGetExtractedFileContentMock,
}));

const relatedFileEntities = [
  {
    id: 'file-1',
    name: 'Arbeitsblatt.pdf',
    size: 120_000,
  },
  {
    id: 'file-2',
    name: 'Leitfaden.txt',
    size: 8_000,
  },
] as FileModel[];

const fileContentsById = new Map<string, string>([
  ['file-1', 'Erster Abschnitt. Zweiter Abschnitt. Dritter Abschnitt.'],
  ['file-2', 'Kurzer Leitfaden.'],
]);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbGetExtractedFileContentMock.mockImplementation(async (fileId: string) => {
    return fileContentsById.get(fileId) ?? '';
  });
});

describe('buildRetrieveEntireFileTool', () => {
  it('returns null when no files are attached', async () => {
    const { buildRetrieveEntireFileTool } = await import('./retrieve-entire-file-tool');

    const result = buildRetrieveEntireFileTool({
      relatedFileEntities: [],
    });

    expect(result).toBeNull();
  });

  it('adds a whole-file retrieval tool that returns the selected file content', async () => {
    const { buildRetrieveEntireFileTool } = await import('./retrieve-entire-file-tool');

    const tool = buildRetrieveEntireFileTool({
      relatedFileEntities,
    });

    expect(tool).not.toBeNull();
    expect(tool!.definition).toMatchObject({
      name: 'retrieve_entire_file',
    });
    expect(tool!.definition.description).toContain('Arbeitsblatt.pdf (120000 bytes)');
    expect(tool!.definition.description).toContain('Leitfaden.txt (8000 bytes)');
    expect(tool!.definition.parameters).toMatchObject({
      required: ['fileName'],
    });

    const result = await tool!.handler({
      fileName: 'Arbeitsblatt.pdf',
    });

    expect(mocks.dbGetExtractedFileContentMock).toHaveBeenCalledWith('file-1');
    expect(result).toEqual({
      fileName: 'Arbeitsblatt.pdf',
      content: 'Erster Abschnitt. Zweiter Abschnitt. Dritter Abschnitt.',
      characterCount: expect.any(Number),
      maxCharacters: RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT,
    });
  });

  it('caps whole-file retrieval at the configured character limit', async () => {
    const { buildRetrieveEntireFileTool } = await import('./retrieve-entire-file-tool');

    const veryLongFile = {
      id: 'file-3',
      name: 'Grossdatei.txt',
    } as FileModel;
    fileContentsById.set('file-3', 'a'.repeat(100_001));

    const tool = buildRetrieveEntireFileTool({
      relatedFileEntities: [veryLongFile],
    });

    const result = await tool!.handler({
      fileName: 'Grossdatei.txt',
    });

    const parsed = result as {
      maxCharacters: number;
      characterCount: number;
      content: string | null;
      notice?: string;
    };

    expect(parsed.maxCharacters).toBe(RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT);
    expect(parsed.characterCount).toBeGreaterThan(RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT);
    expect(parsed.content).not.toBeNull();
    expect(parsed.notice).toBe('File content was truncated to fit the character limit.');
  });

  it('returns error for missing file name', async () => {
    const { buildRetrieveEntireFileTool } = await import('./retrieve-entire-file-tool');

    const tool = buildRetrieveEntireFileTool({
      relatedFileEntities,
    });

    const result = await tool!.handler({
      fileName: '',
    });

    const parsed = result as { error: string };
    expect(parsed.error).toBe('Missing file name.');
    expect(mocks.dbGetExtractedFileContentMock).not.toHaveBeenCalled();
  });

  it('returns error for file not found', async () => {
    const { buildRetrieveEntireFileTool } = await import('./retrieve-entire-file-tool');

    const tool = buildRetrieveEntireFileTool({
      relatedFileEntities,
    });

    const result = await tool!.handler({
      fileName: 'NonExistent.txt',
    });

    const parsed = result as { error: string; fileName: string };
    expect(parsed.error).toBe('File not found.');
    expect(parsed.fileName).toBe('NonExistent.txt');
    expect(mocks.dbGetExtractedFileContentMock).not.toHaveBeenCalled();
  });

  it('returns a notice instead of an error when extraction yields no usable content', async () => {
    const emptyFile = {
      id: 'file-4',
      name: 'Bild.png',
    } as FileModel;
    fileContentsById.set('file-4', '');

    const { buildRetrieveEntireFileTool } = await import('./retrieve-entire-file-tool');

    const tool = buildRetrieveEntireFileTool({
      relatedFileEntities: [emptyFile],
    });

    const result = await tool!.handler({
      fileName: 'Bild.png',
    });

    expect(result).toEqual({
      fileName: 'Bild.png',
      content: null,
      characterCount: 0,
      maxCharacters: RETRIEVE_ENTIRE_FILE_CHARACTER_LIMIT,
      notice: 'No usable content found.',
    });
  });
});

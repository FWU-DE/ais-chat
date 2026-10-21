import { NUMBER_OF_IMAGES_LIMIT } from '@/configuration-text-inputs/const';
import { MAX_FILE_SIZE } from '@/const';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultUploadFile,
  filterFilesByImageLimit,
  filterValidFilesForUpload,
  getAllowedFileExtensions,
  handleSingleFile,
  type LocalFileState,
} from './upload-file';

const mocks = vi.hoisted(() => ({
  logError: vi.fn(),
}));

vi.mock('@shared/logging', () => ({
  logError: mocks.logError,
}));

const translations = ((key: string) => key) as never;

function createFile(name: string, size = 1): File {
  return new File([new Uint8Array(size)], name, { type: 'application/octet-stream' });
}

function createFileState() {
  let files = new Map<string, LocalFileState>();
  const setFiles = (update: React.SetStateAction<Map<string, LocalFileState>>) => {
    files = typeof update === 'function' ? update(files) : update;
  };

  return {
    getFiles: () => files,
    setFiles,
  };
}

describe('getAllowedFileExtensions', () => {
  it('allows supported image files when the selected model accepts image input', () => {
    expect(getAllowedFileExtensions([], ['png'])).toContain('png');
  });

  it('excludes image files when the selected model does not accept image input', () => {
    expect(getAllowedFileExtensions([], [])).not.toContain('png');
  });

  it('excludes image files after the image attachment limit is reached', () => {
    const files: LocalFileState[] = Array.from({ length: NUMBER_OF_IMAGES_LIMIT }, (_, index) => ({
      file: createFile(`image-${index}.png`),
      status: 'processed',
      fileId: `file-${index}`,
    }));

    expect(getAllowedFileExtensions(files, ['png'])).not.toContain('png');
  });

  it('counts images that are still uploading toward the image limit', () => {
    const files: LocalFileState[] = Array.from({ length: NUMBER_OF_IMAGES_LIMIT }, (_, index) => ({
      file: createFile(`image-${index}.png`),
      status: 'uploading',
      fileId: undefined,
    }));

    expect(getAllowedFileExtensions(files, ['png'])).not.toContain('png');
  });
});

describe('filterValidFilesForUpload', () => {
  it('keeps valid files after invalid clipboard files', () => {
    const toast = {
      error: vi.fn(),
      success: vi.fn(),
    };

    expect(
      filterValidFilesForUpload([createFile('unsupported.exe'), createFile('document.pdf')], {
        allowedFileExtensions: ['pdf'],
        toast,
        translations,
      }),
    ).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledWith('toasts.invalid-file-format');
  });
});

describe('filterFilesByImageLimit', () => {
  it('keeps documents when excess images are removed', () => {
    const existingFiles: LocalFileState[] = [
      ...Array.from({ length: NUMBER_OF_IMAGES_LIMIT - 1 }, (_, index) => ({
        file: createFile(`existing-${index}.png`),
        status: 'processed' as const,
        fileId: `file-${index}`,
      })),
    ];
    const firstImage = createFile('first.png');
    const secondImage = createFile('second.png');
    const document = createFile('document.pdf');

    const result = filterFilesByImageLimit([firstImage, secondImage, document], existingFiles);

    expect(result.files).toEqual([firstImage, document]);
    expect(result.imagesExceeded).toBe(1);
  });
});

describe('handleSingleFile', () => {
  const toast = {
    error: vi.fn(),
    success: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a processed attachment and invokes upload callbacks after a successful upload', async () => {
    const { getFiles, setFiles } = createFileState();
    const file = createFile('document.pdf');
    const onFileUploaded = vi.fn();

    await handleSingleFile({
      file,
      setFiles,
      fileUploadFn: vi.fn().mockResolvedValue({ fileId: 'file-1' }),
      onFileUploaded,
      toast,
      translations,
      showUploadConfirmation: true,
      allowedFileExtensions: ['pdf'],
    });

    const [uploadedFile] = getFiles().values();
    expect(uploadedFile).toMatchObject({
      file,
      status: 'processed',
      fileId: 'file-1',
    });
    expect(onFileUploaded).toHaveBeenCalledWith({ id: 'file-1', name: 'document.pdf', file });
    expect(toast.success).toHaveBeenCalledWith('toasts.upload-success');
  });

  it('blocks an unsupported file before it is added to attachments', async () => {
    const { getFiles, setFiles } = createFileState();
    const uploadFile = vi.fn();

    await handleSingleFile({
      file: createFile('document.exe'),
      setFiles,
      fileUploadFn: uploadFile,
      toast,
      translations,
      allowedFileExtensions: ['pdf'],
    });

    expect(getFiles()).toEqual(new Map());
    expect(uploadFile).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('toasts.invalid-file-format');
  });

  it('blocks a file that exceeds the upload size limit', async () => {
    const { getFiles, setFiles } = createFileState();
    const uploadFile = vi.fn();

    await handleSingleFile({
      file: createFile('document.pdf', MAX_FILE_SIZE + 1),
      setFiles,
      fileUploadFn: uploadFile,
      toast,
      translations,
      allowedFileExtensions: ['pdf'],
    });

    expect(getFiles()).toEqual(new Map());
    expect(uploadFile).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('toasts.file-too-large');
  });

  it('removes an attachment when its upload fails', async () => {
    const { getFiles, setFiles } = createFileState();

    await handleSingleFile({
      file: createFile('document.pdf'),
      setFiles,
      fileUploadFn: vi.fn().mockRejectedValue(new Error('upload failed')),
      toast,
      translations,
      allowedFileExtensions: ['pdf'],
    });

    expect(getFiles()).toEqual(new Map());
    expect(mocks.logError).toHaveBeenCalledWith('File upload error', expect.any(Error));
    expect(toast.error).toHaveBeenCalledWith('toasts.upload-error');
  });

  it('removes an attachment when the upload response has no file ID', async () => {
    const { getFiles, setFiles } = createFileState();

    await handleSingleFile({
      file: createFile('document.pdf'),
      setFiles,
      fileUploadFn: vi.fn().mockResolvedValue({ fileId: '' }),
      toast,
      translations,
      allowedFileExtensions: ['pdf'],
    });

    expect(getFiles()).toEqual(new Map());
    expect(mocks.logError).toHaveBeenCalledWith('File upload error', expect.any(Error));
    expect(toast.error).toHaveBeenCalledWith('toasts.upload-error');
  });
});

describe('defaultUploadFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads the file and returns the file ID from the API response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ body: JSON.stringify({ file_id: 'file-1' }) }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(defaultUploadFile(createFile('document.pdf'))).resolves.toEqual({
      fileId: 'file-1',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/files', {
      method: 'POST',
      body: expect.any(FormData),
    });
  });

  it('rejects unsuccessful upload responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(defaultUploadFile(createFile('document.pdf'))).rejects.toThrow(
      'Could not upload file',
    );
  });
});

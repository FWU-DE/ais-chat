import { ForbiddenError } from '@shared/error';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth/utils', () => ({ getUser: vi.fn() }));
vi.mock('./pdf-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pdf-service')>()),
  generatePdfFromMarkdown: vi.fn(),
}));

import { getUser } from '@/auth/utils';

import { generatePdfFromMarkdown } from './pdf-service';
import { POST } from './route';

function buildRequest(body: unknown) {
  return new Request('https://example.com/api/generate-document/pdf', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const validBody = { markdown: '# Hallo', title: 'Titel', images: [] };

describe('POST /api/generate-document/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(generatePdfFromMarkdown).mockResolvedValue(Buffer.from('%PDF-test'));
  });

  it('returns the generated PDF', async () => {
    const response = await POST(buildRequest(validBody));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('%PDF-test');
    expect(generatePdfFromMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: '# Hallo', title: 'Titel', plots: [] }),
    );
  });

  it('rejects invalid input with 400', async () => {
    const response = await POST(buildRequest({ ...validBody, markdown: '' }));

    expect(response.status).toBe(400);
    expect(generatePdfFromMarkdown).not.toHaveBeenCalled();
  });

  it('does not generate a PDF when the user is not allowed', async () => {
    vi.mocked(getUser).mockRejectedValue(new ForbiddenError());

    const response = await POST(buildRequest(validBody));

    expect(response.status).toBe(403);
    expect(generatePdfFromMarkdown).not.toHaveBeenCalled();
  });
});

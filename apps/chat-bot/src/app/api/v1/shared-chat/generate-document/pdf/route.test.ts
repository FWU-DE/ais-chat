import { ForbiddenError } from '@shared/error';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/api/generate-document/pdf/pdf-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/api/generate-document/pdf/pdf-service')>()),
  generatePdfFromMarkdown: vi.fn(),
}));
vi.mock('@/app/api/shared-chat/shared-chat-document-service', () => ({
  getSharedChatDocument: vi.fn(),
}));

import { generatePdfFromMarkdown } from '@/app/api/generate-document/pdf/pdf-service';
import { getSharedChatDocument } from '@/app/api/shared-chat/shared-chat-document-service';

import { POST } from './route';

const sharedChat = {
  inviteCode: 'invite',
  entityType: 'character',
  entityId: 'character-1',
  sharedSessionId: 'session-1',
};
const validBody = { ...sharedChat, toolCallId: 'call-1', images: [] };

function buildRequest(body: unknown) {
  return new Request('https://example.com/api/v1/shared-chat/generate-document/pdf', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/shared-chat/generate-document/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSharedChatDocument).mockResolvedValue({ markdown: '# Hallo', title: 'Titel' });
    vi.mocked(generatePdfFromMarkdown).mockResolvedValue(Buffer.from('%PDF-test'));
  });

  it('renders the stored document and returns the PDF', async () => {
    const response = await POST(buildRequest(validBody));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(await response.text()).toBe('%PDF-test');
    expect(getSharedChatDocument).toHaveBeenCalledWith({ ...sharedChat, toolCallId: 'call-1' });
    expect(generatePdfFromMarkdown).toHaveBeenCalledWith({
      markdown: '# Hallo',
      title: 'Titel',
      images: [],
      plots: [],
    });
  });

  it('rejects invalid input with 400', async () => {
    const response = await POST(buildRequest({ ...validBody, inviteCode: '' }));

    expect(response.status).toBe(400);
    expect(getSharedChatDocument).not.toHaveBeenCalled();
  });

  it('does not generate a PDF when the document does not belong to the shared chat', async () => {
    vi.mocked(getSharedChatDocument).mockRejectedValue(new ForbiddenError());

    const response = await POST(buildRequest(validBody));

    expect(response.status).toBe(403);
    expect(generatePdfFromMarkdown).not.toHaveBeenCalled();
  });
});

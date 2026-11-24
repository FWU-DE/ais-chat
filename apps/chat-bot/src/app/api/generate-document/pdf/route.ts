import { NextResponse } from 'next/server';

import { getUser } from '@/auth/utils';
import { handleErrorInRoute } from '@/error/handle-error-in-route';

import { createPdfResponse } from './pdf-response';
import { generatePdfFromMarkdown, pdfRequestSchema } from './pdf-service';

export async function POST(request: Request) {
  try {
    await getUser();
    const parsed = pdfRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid Markdown input' }, { status: 400 });
    }

    return createPdfResponse(await generatePdfFromMarkdown(parsed.data));
  } catch (error) {
    return handleErrorInRoute(error);
  }
}

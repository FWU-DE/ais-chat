import { NextResponse } from 'next/server';

import { handleErrorInRoute } from '@/error/handle-error-in-route';

import { generatePdfFromMarkdown, pdfRequestSchema } from './pdf-service';

export async function POST(request: Request) {
  try {
    const parsed = pdfRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid Markdown input' }, { status: 400 });
    }

    const pdf = await generatePdfFromMarkdown(parsed.data);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="generated-document.pdf"',
      },
    });
  } catch (error) {
    return handleErrorInRoute(error);
  }
}

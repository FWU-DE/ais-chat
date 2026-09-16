import { NextRequest, NextResponse } from 'next/server';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { createScaledImage } from '@/app/api/file-operations/scaled-image-service';
import { verifySharedChatImageAccess } from '@/app/api/shared-chat/shared-chat-read-service';
import { sharedChatImageRequestSchema } from '@/app/api/shared-chat/shared-chat-request-schemas';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const { fileId } = await params;
    const parsed = sharedChatImageRequestSchema.safeParse({
      ...Object.fromEntries(request.nextUrl.searchParams),
      fileId,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
    }

    await verifySharedChatImageAccess(parsed.data);

    const scaledImage = await createScaledImage({
      fileId: parsed.data.fileId,
      width: parsed.data.width,
      height: parsed.data.height,
    });

    return new NextResponse(new Uint8Array(scaledImage.buffer), {
      headers: {
        'Cache-Control': 'private, max-age=86400',
        'Content-Type': scaledImage.contentType,
        'Content-Length': scaledImage.buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    return handleErrorInRoute(error);
  }
}

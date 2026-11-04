import { createScaledImage } from '@/app/api/file-operations/scaled-image-service';
import { getUser } from '@/auth/utils';
import { MAX_SCALED_IMAGE_DIMENSION } from '@/const';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { dbVerifyFileOwnership } from '@shared/db/functions/files';
import { NextRequest, NextResponse } from 'next/server';
import z from 'zod';

const imageDimensionsSchema = z.object({
  width: z.coerce.number().int().positive().max(MAX_SCALED_IMAGE_DIMENSION),
  height: z.coerce.number().int().positive().max(MAX_SCALED_IMAGE_DIMENSION),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const user = await getUser();
    const { fileId } = await params;
    const isOwner = await dbVerifyFileOwnership({ fileId, userId: user.id });

    if (!isOwner) {
      return NextResponse.json({ error: 'Not authorized to access this file' }, { status: 403 });
    }

    const dimensions = imageDimensionsSchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!dimensions.success) {
      return NextResponse.json({ error: 'Invalid width/height' }, { status: 400 });
    }

    const scaledImage = await createScaledImage({
      fileId,
      width: dimensions.data.width,
      height: dimensions.data.height,
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

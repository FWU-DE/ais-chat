import { isUploadBodyTooLarge } from '@/app/api/file-operations/upload-body-limit';
import { getUser } from '@/auth/utils';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '../../file-operations/file-upload-service';

/**
 * Handles the POST request to upload a file.
 *
 * This endpoint can be called by any authenticated user.
 * No additional permissions are required.
 * A new fileId is always generated for each upload.
 * It is not possible to overwrite existing files.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (user === undefined) {
      return NextResponse.json({ status: 403 });
    }

    if (isUploadBodyTooLarge(req)) {
      return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (file === null) {
      return NextResponse.json({ error: 'Could not find file in form data' }, { status: 400 });
    }

    if (typeof file === 'string') {
      return NextResponse.json(
        { error: 'file FormData entry value was of type "string", but expected type "File"' },
        { status: 400 },
      );
    }

    const fileId = await handleFileUpload(file);

    return NextResponse.json({
      body: JSON.stringify({ file_id: fileId }),
      status: 200,
    });
  } catch (error) {
    return handleErrorInRoute(error);
  }
}

/**
 * Handles the upload of a file (images and text files).
 * Extracts content, creates chunks and embeddings,
 * uploads file to S3 and stores embeddings in DB.
 *
 * @param file the file to upload
 * @returns the generated fileId of the uploaded file
 */
async function handleFileUpload(file: File) {
  const user = await getUser();

  return uploadFile({
    federalStateId: user.federalState.id,
    file,
    fileMetadata: {},
    userId: user.id,
  });
}

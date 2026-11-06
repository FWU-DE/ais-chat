import { dbDeleteOutdatedConversations } from '@shared/db/functions/conversation';
import {
  dbDeleteDanglingFiles,
  dbDeleteFileAndDetachFromConversation,
  dbGetAllS3FileKeys,
  dbGetDanglingConversationFileIds,
} from '@shared/db/functions/files';
import { logInfo } from '@shared/logging';
import { deleteFilesFromS3, listFilesFromS3 } from '@shared/s3';
import { NextRequest, NextResponse } from 'next/server';

import { validateApiKeyByHeadersWithResult } from '@/utils/validation';

export async function DELETE(req: NextRequest) {
  const [error] = validateApiKeyByHeadersWithResult(req.headers);

  if (error !== null) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  const countDeletedConversations = await dbDeleteOutdatedConversations();
  const danglingConversationFiles = await dbGetDanglingConversationFileIds();
  await dbDeleteFileAndDetachFromConversation(danglingConversationFiles);
  // from other entities character, custom gpt, shared school chat
  const danglingFiles = await dbDeleteDanglingFiles();
  const unusedS3Files = await getUnusedS3Files();
  if (req.nextUrl.searchParams.get('deleteUnusedS3Files') === 'true') {
    await deleteFilesFromS3(unusedS3Files);
  }
  await deleteFilesFromS3([...danglingConversationFiles, ...danglingFiles]);
  const response = {
    message: 'Ok',
    countDeletedConversations,
    danglingConversationFiles,
    danglingFiles,
    unusedS3Files,
  };

  logInfo('Deleted old conversations:', response);

  return NextResponse.json(response, { status: 200 });
}

async function getUnusedS3Files() {
  const s3Files = await listFilesFromS3({
    // delete unused files from S3 after the files are at least a day old to prevent accidental deletions during file upload
    minAgeInSeconds: 24 * 60 * 60,
  });
  const filesFromDb = new Set(await dbGetAllS3FileKeys());
  return s3Files.filter((file) => !filesFromDb.has(file));
}

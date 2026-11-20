import {
  CopyObjectCommand,
  CopyObjectCommandInput,
  DeleteObjectCommand,
  DeleteObjectCommandInput,
  DeleteObjectsCommand,
  DeleteObjectsCommandInput,
  GetObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandInput,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NotFoundError } from '@shared/error';
import { UnexpectedError } from '@shared/error/unexpected-error';
import { logError } from '@shared/logging';
import { ONE_DAY, ONE_HOUR, S3_DELETE_OBJECTS_MAX } from '@shared/s3/const';
import { chunkArray } from '@shared/utils/arrays';
import { nanoid } from 'nanoid';
import { cacheLife } from 'next/cache';
import { Readable } from 'stream';

import { env } from './env';

/**
 * Encodes a filename for Content-Disposition `filename*` (RFC 5987).
 *
 * This is necessary because raw filenames may contain spaces or special characters
 * that break downloads when sent in headers, and unsafe characters (e.g., CR/LF, quotes)
 * can enable header injection if passed through directly.
 */
function encodeRFC5987Value(value: string) {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

const s3Client = new S3Client({
  region: env.otcS3Region,
  // otcS3Hostname is a bare hostname in production (OTC), but a full URL (e.g. http://rustfs:9000) for local RustFS.
  endpoint: /^https?:\/\//.test(env.otcS3Hostname)
    ? env.otcS3Hostname
    : `https://${env.otcS3Hostname}`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.otcAccessKeyId,
    secretAccessKey: env.otcSecretAccessKey,
  },
});

/**
 * Uploads a file to an S3 bucket.
 *
 * @param key - The key (file name) for the uploaded file.
 * @param body - The content to upload.
 * @param contentType - The MIME type of the content.
 */
export async function uploadFileToS3({
  key,
  body,
  contentType,
}: {
  key: string;
  body: Buffer | Uint8Array | Blob | string | Readable;
  contentType: string;
}) {
  let processedBody = body;

  // Convert Blob to Buffer to avoid hash calculation issues
  if (body instanceof Blob) {
    const arrayBuffer = await body.arrayBuffer();
    processedBody = Buffer.from(arrayBuffer);
  }

  const uploadParams: PutObjectCommandInput = {
    Bucket: env.otcBucketName,
    Key: key ?? nanoid(),
    Body: processedBody,
    ContentType: contentType,
  };

  const command = new PutObjectCommand(uploadParams);
  await s3Client.send(command);
}

/**
 * Copies an existing object in S3 from the `copySource` key to the `newKey`.
 * @param newKey the new key
 * @param copySource the existing key to copy
 */
export async function copyFileInS3({ newKey, copySource }: { newKey: string; copySource: string }) {
  const copyParams: CopyObjectCommandInput = {
    Bucket: env.otcBucketName,
    Key: newKey,
    CopySource: `${env.otcBucketName}/${copySource}`,
  };

  try {
    const command = new CopyObjectCommand(copyParams);
    await s3Client.send(command);
  } catch (error) {
    logError('Error copying file to S3', error);
    throw error;
  }
}

/**
 * Gets a signed URL for read-only access to an S3 object.
 *
 * @returns a signed URL for read-only access to the object.
 */
export async function getReadOnlySignedUrl({
  key,
  filename,
  contentType,
  attachment = true,
  // Default expiry of 1 day
  options: { expiresIn = ONE_DAY } = {},
}: {
  key: string;
  filename?: string;
  contentType?: string;
  attachment?: boolean;
  options?: { expiresIn?: number };
}) {
  'use cache';
  cacheLife({
    // Set expire time to ensure the stale URL is not returned after expiry
    expire: expiresIn,
    // Refresh URL in the background before it expires
    revalidate: Math.max(expiresIn - ONE_HOUR, expiresIn / 2),
  });

  let contentDisposition = attachment ? 'attachment' : '';
  if (filename !== undefined) {
    const dispositionType = attachment ? 'attachment' : 'inline';
    contentDisposition = `${dispositionType}; filename*=UTF-8''${encodeRFC5987Value(filename)}`;
  }
  const command = new GetObjectCommand({
    Bucket: env.otcBucketName,
    Key: key,
    ResponseCacheControl: `public, max-age=${expiresIn}, immutable`,
    ...(contentDisposition !== '' ? { ResponseContentDisposition: contentDisposition } : {}),
    ...(contentType !== undefined ? { ResponseContentType: contentType } : {}),
  });

  try {
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    logError('Error generating signed GET URL for S3', error);
    throw error;
  }
}

/**
 * Deletes a file from an S3 bucket.
 * CAUTION: the result is always status 204 even if the file did not exist.
 * @param key - The key (path and file name) of the file to delete.
 */
export async function deleteFileFromS3({ key }: { key: string }) {
  const deleteParams: DeleteObjectCommandInput = {
    Bucket: env.otcBucketName,
    Key: key,
  };

  const command = new DeleteObjectCommand(deleteParams);
  await s3Client.send(command);
}

/**
 * Deletes multiple files from an S3 bucket.
 *
 * @param keys The keys (file name) of the files to delete.
 */
export async function deleteFilesFromS3(keys: string[]) {
  if (keys.length === 0) {
    return;
  }

  const uniqueKeys = [...new Set(keys)];
  const chunks = chunkArray(uniqueKeys, S3_DELETE_OBJECTS_MAX);
  await Promise.all(
    chunks.map(async (chunkedKeys) => {
      const deleteParams: DeleteObjectsCommandInput = {
        Bucket: env.otcBucketName,
        Delete: {
          Objects: chunkedKeys.map((key) => ({ Key: key })),
          Quiet: true,
        },
      };

      try {
        const command = new DeleteObjectsCommand(deleteParams);
        await s3Client.send(command);
      } catch (error) {
        logError('Error deleting files from S3', error);
        throw error;
      }
    }),
  );
}

/**
 * Lists all files in an S3 bucket with optional prefix filtering.
 *
 * @param prefix Optional prefix to filter objects (e.g., 'folder/subfolder/')
 * @param minAge Optional minimum age in seconds to filter objects. The minimum age is defined by the last modified timestamp.
 * If set, only objects which have at least this age will be included.
 * @returns Array of objects keys
 */
export async function listFilesFromS3({
  prefix,
  minAgeInSeconds,
}: {
  prefix?: string;
  minAgeInSeconds?: number;
} = {}) {
  const allObjects: string[] = [];
  let continuationToken: string | undefined = undefined;

  do {
    const listParams: ListObjectsV2CommandInput = {
      Bucket: env.otcBucketName,
      Prefix: prefix,
      MaxKeys: 1_000,
      ContinuationToken: continuationToken,
    };
    const command = new ListObjectsV2Command(listParams);
    const response = await s3Client.send(command);

    let objects = response.Contents;
    if (objects) {
      if (minAgeInSeconds !== undefined) {
        const maxLastModified = new Date(Date.now() - minAgeInSeconds * 1000);
        objects = objects.filter((x) => !x.LastModified || x.LastModified < maxLastModified);
      }
      const keys = objects
        .map((x) => x.Key)
        .filter(
          // Exclude folders, their keys end with '/'
          (x): x is string => !!x && !x.endsWith('/'),
        );
      allObjects.push(...keys);
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return allObjects;
}

export async function getFileFromS3(key: string): Promise<Readable> {
  const command = new GetObjectCommand({
    Bucket: env.otcBucketName,
    Key: key,
  });

  try {
    const response = await s3Client.send(command);
    if (!response.Body) {
      throw new NotFoundError('No object found for the given key');
    }
    return response.Body as Readable;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new UnexpectedError('Failed to fetch file from S3');
  }
}

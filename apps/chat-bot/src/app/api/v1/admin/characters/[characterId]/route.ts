import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { validateApiKeyByHeaders } from '@/utils/validation';
import {
  deleteCharacter,
  shareCharacter,
  unshareCharacter,
} from '@shared/characters/character-service';
import { dbGetCharacterById } from '@shared/db/functions/character';
import { dbGetUserById } from '@shared/db/functions/user';
import { NextRequest } from 'next/server';
import z from 'zod';

// GET /api/v1/characters/[characterId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ characterId: string }> },
) {
  try {
    validateApiKeyByHeaders(request.headers);

    const { characterId } = await params;

    const character = await dbGetCharacterById({ characterId, includeDeleted: true });
    return Response.json(character);
  } catch (error) {
    return handleErrorInRoute(error);
  }
}

// PATCH /api/v1/characters/[characterId]
export const patchCharacterSchema = z.object({
  shareCharacter: z
    .object({
      userId: z.string(),
      tokenPointsPercentageLimit: z.number(),
      usageTimeLimitMinutes: z.number(),
    })
    .optional(),
  unshareCharacter: z
    .object({
      userId: z.string(),
    })
    .optional(),
});
export type PatchCharacterSchema = z.infer<typeof patchCharacterSchema>;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ characterId: string }> },
) {
  try {
    validateApiKeyByHeaders(request.headers);

    const { characterId } = await params;
    const requestBody = await request.json();

    const patchCharacterValues = patchCharacterSchema.parse(requestBody);
    // share character
    if (patchCharacterValues.shareCharacter) {
      const { tokenPointsPercentageLimit, usageTimeLimitMinutes, userId } =
        patchCharacterValues.shareCharacter;

      const user = await dbGetUserById({ userId });
      if (!user) {
        return Response.json({ error: 'User not found' }, { status: 400 });
      }

      const result = await shareCharacter({
        characterId,
        user,
        tokenPointsPercentageLimit,
        usageTimeLimitMinutes,
      });
      return Response.json(result);
    }

    // unshare character
    if (patchCharacterValues.unshareCharacter) {
      const { userId } = patchCharacterValues.unshareCharacter;

      const result = await unshareCharacter({
        characterId,
        user: { id: userId, userRole: 'teacher' },
      });
      return Response.json(result);
    }

    // nothing to do - probably wrong arguments
    return new Response(null, { status: 400 });
  } catch (error) {
    return handleErrorInRoute(error);
  }
}

// DELETE /api/v1/characters/[characterId]
const deleteCharacterSchema = z.object({
  userId: z.string(),
});
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ characterId: string }> },
) {
  try {
    validateApiKeyByHeaders(request.headers);
    const { characterId } = await params;
    const requestBody = await request.json();
    const { userId } = deleteCharacterSchema.parse(requestBody);

    await deleteCharacter({ characterId, user: { id: userId } });

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleErrorInRoute(error);
  }
}

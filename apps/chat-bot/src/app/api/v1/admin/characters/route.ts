import { getCharacters } from '@shared/characters/character-service';
import { dbCreateCharacter } from '@shared/db/functions/character';
import { dbGetUserById } from '@shared/db/functions/user';
import { characterInsertSchema, characterSelectSchema } from '@shared/db/schema';
import { NotFoundError } from '@shared/error/not-found-error';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { validateApiKeyByHeaders } from '@/utils/validation';

// GET /api/v1/characters
const getCharactersSchema = characterSelectSchema
  .pick({
    userId: true,
  })
  .extend({ schoolId: z.string() });

export async function GET(request: NextRequest) {
  try {
    validateApiKeyByHeaders(request.headers);

    const searchParams = request.nextUrl.searchParams;
    const { userId } = getCharactersSchema.parse(Object.fromEntries(searchParams));

    const user = await dbGetUserById({ userId });
    if (!user) {
      throw new NotFoundError('User not found');
    }
    const characters = await getCharacters({ user });

    return Response.json(characters);
  } catch (error) {
    return handleErrorInRoute(error);
  }
}

// POST /api/v1/characters
const createNewCharacterSchema = characterInsertSchema;

export async function POST(request: NextRequest) {
  try {
    validateApiKeyByHeaders(request.headers);

    const requestBody = await request.json();
    const characterData = createNewCharacterSchema.parse(requestBody);

    const character = await dbCreateCharacter(characterData);

    return Response.json(character);
  } catch (error) {
    return handleErrorInRoute(error);
  }
}

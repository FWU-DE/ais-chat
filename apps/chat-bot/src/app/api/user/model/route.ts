import { setLastUsedModelOfUser } from '@shared/users/user-service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth } from '@/auth/requireAuth';
import { updateSession } from '@/auth/utils';
import { handleErrorInRoute } from '@/error/handle-error-in-route';

const requestSchema = z.object({
  modelName: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth();
    const requestBody = await request.json();
    const { modelName } = requestSchema.parse(requestBody);

    const updatedUser = await setLastUsedModelOfUser({
      userId: user.id,
      modelName,
    });

    await updateSession({ user: updatedUser });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleErrorInRoute(error);
  }
}

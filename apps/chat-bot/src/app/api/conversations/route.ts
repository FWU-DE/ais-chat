import { dbGetConversations } from '@shared/db/functions/chat';
import { NextResponse } from 'next/server';

import { getUser } from '@/auth/utils';

export async function GET() {
  const user = await getUser();
  const conversations = await dbGetConversations(user.id);

  return NextResponse.json({ conversations });
}

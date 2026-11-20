import { withTrustedOrigin } from '@shared/utils/with-trusted-origin';
import { NextRequest } from 'next/server';

import { handlers } from '@/auth';

export const GET = (req: NextRequest) => handlers.GET(withTrustedOrigin(req));
export const POST = (req: NextRequest) => handlers.POST(withTrustedOrigin(req));

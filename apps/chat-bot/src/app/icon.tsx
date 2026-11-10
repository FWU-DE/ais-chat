import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { dbGetFederalStateByIdWithResult } from '@shared/db/functions/federal-state';
import { ImageResponse } from 'next/og';

import { getMaybeUser } from '@/auth/utils';
import { DEFAULT_DESIGN_CONFIGURATION } from '@/db/const';

export const dynamic = 'force-dynamic';

export const size = {
  width: 32,
  height: 32,
};

export const contentType = 'image/png';

const responseHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
};

// Read the SVG once and extract the `d` attributes so the icon route stays
// in sync with the source asset without duplicating path data here.
const logoDataPromise = readFile(path.join(process.cwd(), 'public/logo.svg'), 'utf8').then(
  (svg) => ({
    viewBox: svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 24 24',
    paths: [...svg.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1] ?? ''),
  }),
);

function LogoIcon({ color, paths, viewBox }: { color: string; paths: string[]; viewBox: string }) {
  return (
    <svg fill="none" viewBox={viewBox} width="24" height="24" xmlns="http://www.w3.org/2000/svg">
      {paths.map((d, i) => (
        <path key={i} fill={color} d={d} />
      ))}
    </svg>
  );
}

export default async function Icon() {
  const maybeUser = await getMaybeUser();
  const [, federalState] = await dbGetFederalStateByIdWithResult(maybeUser?.federalStateId);
  const primaryColor =
    federalState?.designConfiguration?.primaryColor ?? DEFAULT_DESIGN_CONFIGURATION.primaryColor;
  const { viewBox, paths } = await logoDataPromise;

  return new ImageResponse(
    <div
      style={{
        alignItems: 'center',
        backgroundColor: 'transparent',
        display: 'flex',
        height: '100%',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      <LogoIcon color={primaryColor} paths={paths} viewBox={viewBox} />
    </div>,
    {
      ...size,
      headers: responseHeaders,
    },
  );
}

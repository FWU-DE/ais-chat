'use client';

import * as Sentry from '@sentry/nextjs';
import Error from 'next/error';
import { useRouter } from 'next/navigation';
import React from 'react';

export default function GlobalError({ reset, error }: { error: Error; reset: () => void }) {
  const router = useRouter();

  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="de">
      <body>
        <div className="w-screen h-screen flex flex-col justify-center items-center">
          <h1 className="text-[10rem] font-bold">
            <span className="text-main-black">Fe</span>
            <span className="text-main-red">hl</span>
            <span className="text-main-gold">er</span>
          </h1>
          <h2 className="text-xl font-bold">Es ist leider ein Fehler aufgetreten.</h2>
          <button
            className="btn-primary mt-12"
            onClick={
              // Attempt to recover by trying to re-render the segment
              () => {
                router.refresh();
                reset();
              }
            }
          >
            Erneut versuchen
          </button>
        </div>
      </body>
    </html>
  );
}

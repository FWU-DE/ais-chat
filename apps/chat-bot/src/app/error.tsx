'use client';

import { logError } from '@shared/logging';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  React.useEffect(() => {
    logError('Error caught by topmost Error component', error);
  }, [error, pathname]);

  return (
    <div className="w-screen h-screen flex flex-col justify-center items-center">
      <h1 className="text-[6rem] sm:text-[10rem] font-bold">
        <span>Fehler</span>
      </h1>
      <h2 className="text-xl font-bold">Es ist leider ein Fehler aufgetreten.</h2>
      {error.message && <span className="pt-4">{error.message}</span>}
      <button
        className="btn-primary mt-12"
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => {
            reset();
            router.refresh();
          }
        }
      >
        Erneut versuchen
      </button>
    </div>
  );
}

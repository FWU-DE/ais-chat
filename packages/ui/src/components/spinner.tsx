import { Loader2Icon } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/utils';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin inline', className)}
      {...props}
    />
  );
}

export { Spinner };

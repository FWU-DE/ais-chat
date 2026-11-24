declare module '*.svg' {
  import type { FC, SVGProps } from 'react';

  const content: FC<SVGProps<SVGSVGElement>>;
  export default content;
}

declare module '*.svg?url' {
  import type { StaticImageData } from 'next/image';

  const content: StaticImageData;
  export default content;
}

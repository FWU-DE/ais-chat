import { getReadOnlySignedUrl } from '@shared/s3';
import { SEVEN_DAYS } from '@shared/s3/const';
import Image from 'next/image';

import LogoWithName from '@/assets/logo-with-name.svg';

export default async function Logo({ logoPath }: { logoPath: string | undefined }) {
  if (logoPath) {
    const signedUrl = await getReadOnlySignedUrl({
      key: logoPath,
      options: { expiresIn: SEVEN_DAYS },
    });
    if (signedUrl)
      return <Image src={signedUrl} alt="logo" className="text-primary h-13" unoptimized />;
  }

  return <LogoWithName className="text-primary h-13" />;
}

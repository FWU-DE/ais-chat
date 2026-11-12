import Link from 'next/link';

import { IMPRESSUM_URL, PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from './const';

type FooterProps = {
  host?: string;
};

export default function Footer({ host = '' }: FooterProps) {
  return (
    <footer className="flex gap-4 flex-wrap w-full my-4 sm:my-8">
      <span>{host}</span>
      <div className="grow" />
      <Link href={PRIVACY_POLICY_URL} prefetch={false} className="hover:underline">
        Datenschutz
      </Link>
      <Link href={IMPRESSUM_URL} prefetch={false} className="hover:underline">
        Impressum
      </Link>
      <Link href={TERMS_OF_USE_URL} prefetch={false} className="hover:underline">
        Nutzungsbedingungen
      </Link>
    </footer>
  );
}

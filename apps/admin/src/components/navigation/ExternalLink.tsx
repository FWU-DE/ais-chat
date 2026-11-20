import Link from 'next/link';

export type ExternalLinkProps = {
  href: string;
  children: React.ReactNode;
};

export function ExternalLink({ href, children }: ExternalLinkProps) {
  return (
    <Link
      className="text-primary hover:underline"
      href={href}
      prefetch={false}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </Link>
  );
}

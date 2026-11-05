import type { ReactNode } from 'react';
import TwoColumnLayout from '@/components/layout/TwoColumnLayout';
import { ApiSidebar } from './ApiSidebar';

export default function ApiLayout({ children }: { children: ReactNode }) {
  return <TwoColumnLayout sidebar={<ApiSidebar />} page={children} />;
}

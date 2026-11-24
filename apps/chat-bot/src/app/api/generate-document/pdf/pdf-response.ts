import { NextResponse } from 'next/server';

export function createPdfResponse(pdf: Buffer) {
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/pdf',
    },
  });
}

/**
 * Vercel Edge OG Image generator (1200x630).
 * Query params: num (invoice number), client (client name), total (e.g. R 7,750.00).
 * Paidly brand: Orange #f97316, Slate #0f172a.
 */
import React from 'react';
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const num = searchParams.get('num') || 'Invoice';
  const client = searchParams.get('client') || 'Client';
  const total = searchParams.get('total') || 'R 0.00';

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
          padding: 40,
          border: '20px solid #f97316',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: '#0f172a',
            letterSpacing: '0.05em',
            marginBottom: 16,
          }}
        >
          PAIDLY INVOICE
        </div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: '#f97316',
            marginTop: 8,
            letterSpacing: '-0.02em',
          }}
        >
          {total}
        </div>
        <div
          style={{
            fontSize: 28,
            color: '#64748b',
            marginTop: 16,
          }}
        >
          {num}
        </div>
        <div
          style={{
            fontSize: 32,
            color: '#0f172a',
            marginTop: 40,
            fontWeight: 600,
          }}
        >
          Billed to: {client}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}

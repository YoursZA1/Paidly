import React from 'react';

/**
 * Generic skeleton for pages while data loads.
 * Prevents blank screens during API calls.
 */
export function PageSkeleton({ lines = 5, className = '' }) {
  return (
    <div className={`animate-pulse space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-muted rounded w-full"
          style={{ width: i === 0 ? '60%' : i === lines - 1 ? '40%' : '100%' }}
        />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 10, cols = 5 }) {
  return (
    <div className="animate-pulse space-y-2">
      <div className="flex gap-2 border-b border-border pb-2">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-4 bg-muted rounded flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2 py-2">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-4 bg-muted/70 rounded flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border p-6 animate-pulse">
      <div className="h-5 bg-muted rounded w-1/3 mb-4" />
      <div className="h-4 bg-muted rounded w-full mb-2" />
      <div className="h-4 bg-muted rounded w-2/3" />
    </div>
  );
}

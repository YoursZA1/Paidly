import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

/**
 * Table skeleton using UI Table for consistent layout (e.g. Quotes, Invoices).
 * Use when isLoading: if (isLoading) return <SkeletonTable rows={5} cols={7} />
 */
export function SkeletonTable({ rows = 5, cols = 5, className = '' }) {
  return (
    <div className={className}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {Array.from({ length: cols }).map((_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-20 rounded" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, r) => (
            <TableRow key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <TableCell key={c}>
                  <Skeleton className="h-4 w-full max-w-[120px] rounded animate-pulse" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Full-page skeleton for document views (public invoice, payslip, PDF loading).
 * Reduces perceived lag vs blank or spinner-only.
 */
export function DocumentPageSkeleton({ title = 'Loading...', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center min-h-screen bg-background p-6 ${className}`}>
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border">
          <Skeleton className="h-8 w-48 mb-2 rounded" />
          <Skeleton className="h-4 w-32 rounded" />
        </div>
        <div className="p-6 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-4 w-full rounded" style={{ width: i === 2 ? '75%' : '100%' }} />
          ))}
        </div>
        <div className="p-4 border-t border-border flex justify-between">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-4 w-28 rounded" />
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{title}</p>
    </div>
  );
}

/**
 * Grid of card placeholders (e.g. Vendors, Quotes grid loading).
 */
export function CardGridSkeleton({ count = 6, className = '' }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border p-6 animate-pulse">
          <div className="h-5 bg-muted rounded w-1/3 mb-4" />
          <div className="h-4 bg-muted rounded w-full mb-2" />
          <div className="h-4 bg-muted rounded w-2/3" />
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

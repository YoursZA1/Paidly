-- Base44 inventory schema: products, stock_transactions, deliveries
-- Designed to import Product_export.csv and StockTransaction_export.csv as-is (string ids).
-- Safe to re-run (idempotent).

CREATE TABLE IF NOT EXISTS public.products (
  id text PRIMARY KEY,
  name text NOT NULL,
  sku text,
  category text,
  count_style text NOT NULL DEFAULT 'units' CHECK (count_style IN ('units','cases','packs','boxes','pallets','bottles','bags','rolls')),
  units_per_count numeric DEFAULT 1,
  stock_on_hand numeric DEFAULT 0,
  reorder_level numeric DEFAULT 10,
  price numeric,
  image_url text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);

CREATE TABLE IF NOT EXISTS public.stock_transactions (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('sold','received','adjusted','returned')),
  quantity numeric NOT NULL,
  notes text,
  date date,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_stock_transactions_product_id ON public.stock_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_date ON public.stock_transactions(date);

CREATE TABLE IF NOT EXISTS public.deliveries (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_transit','delivered','cancelled')),
  supplier text,
  expected_date date,
  tracking_number text,
  notes text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_deliveries_product_id ON public.deliveries(product_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.deliveries(status);


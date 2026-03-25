-- Seed products and stock transactions from Base44 exports.
-- Source CSVs:
-- - Product_export.csv
-- - StockTransaction_export.csv
--
-- This migration inserts by explicit id (text), so it's safe to run once.
-- If you need re-seeding, TRUNCATE the tables first.

-- Products
INSERT INTO public.products (
  id,
  name,
  sku,
  category,
  count_style,
  units_per_count,
  stock_on_hand,
  reorder_level,
  price,
  image_url,
  created_date,
  updated_date,
  created_by_id,
  created_by,
  is_sample
)
VALUES
  ('69c3b34e546d1bacbbbadd07', 'Premium Coffee Beans', 'COF-001', 'Beverages', 'bags', 1, 40, 15, 18.99, '', '2026-03-25T10:05:02.867000+00', '2026-03-25T10:07:52.975000+00', '69c3b2a69b221b99b9de7874', 'onthedesignagency@gmail.com', false),
  ('69c3b34e546d1bacbbbadd08', 'Organic Green Tea', 'TEA-002', 'Beverages', 'boxes', 20, 8, 10, 12.5, '', '2026-03-25T10:05:02.867000+00', '2026-03-25T10:08:54.005000+00', '69c3b2a69b221b99b9de7874', 'onthedesignagency@gmail.com', false),
  ('69c3b34e546d1bacbbbadd09', 'Sparkling Water', 'WAT-003', 'Beverages', 'cases', 24, 120, 30, 8.99, '', '2026-03-25T10:05:02.867000+00', '2026-03-25T10:05:02.867000+00', '69c3b2a69b221b99b9de7874', 'onthedesignagency@gmail.com', false),
  ('69c3b34e546d1bacbbbadd0a', 'Paper Towels', 'CLN-004', 'Supplies', 'rolls', 1, 3, 20, 2.49, '', '2026-03-25T10:05:02.867000+00', '2026-03-25T10:05:02.867000+00', '69c3b2a69b221b99b9de7874', 'onthedesignagency@gmail.com', false),
  ('69c3b34e546d1bacbbbadd0b', 'Hand Sanitizer', 'CLN-005', 'Supplies', 'bottles', 1, 60, 15, 4.99, '', '2026-03-25T10:05:02.867000+00', '2026-03-25T10:05:02.867000+00', '69c3b2a69b221b99b9de7874', 'onthedesignagency@gmail.com', false),
  ('69c3b34e546d1bacbbbadd0c', 'Printer Paper', 'OFF-006', 'Office', 'packs', 500, 25, 5, 7.99, '', '2026-03-25T10:05:02.867000+00', '2026-03-25T10:05:02.867000+00', '69c3b2a69b221b99b9de7874', 'onthedesignagency@gmail.com', false)
ON CONFLICT (id) DO NOTHING;

-- Stock transactions
INSERT INTO public.stock_transactions (
  id,
  product_id,
  type,
  quantity,
  notes,
  date,
  created_date,
  updated_date,
  created_by_id,
  created_by,
  is_sample
)
VALUES
  ('69c3b435efd3a1477ad9243a', '69c3b34e546d1bacbbbadd08', 'sold', 2, '', '2026-03-25', '2026-03-25T10:08:53.625000+00', '2026-03-25T10:08:53.625000+00', '69c3b2a69b221b99b9de7874', 'onthedesignagency@gmail.com', false)
ON CONFLICT (id) DO NOTHING;


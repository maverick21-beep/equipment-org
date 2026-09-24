---- =====================================================
-- GEARTRACK — COMPLETE SUPABASE SCHEMA
-- Run this in Supabase SQL Editor
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- TABLE 1: profiles (linked to auth.users)
-- =====================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile row when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $handle_new_user$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$handle_new_user$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- TABLE 2: equipment_categories
-- =====================================================
CREATE TABLE IF NOT EXISTS equipment_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- TABLE 3: equipment
-- =====================================================
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category_id UUID REFERENCES equipment_categories(id) ON DELETE SET NULL,
  available_qty INTEGER NOT NULL CHECK (available_qty >= 0),
  maintenance_qty INTEGER NOT NULL DEFAULT 0 CHECK (maintenance_qty >= 0),
  total_qty INTEGER NOT NULL CHECK (total_qty >= 0),
  condition TEXT NOT NULL CHECK (condition IN ('Excellent', 'Good', 'Fair', 'Poor')),
  location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'deactivated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $trigger_set_timestamp$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$trigger_set_timestamp$;

DROP TRIGGER IF EXISTS set_equipment_timestamp ON equipment;
CREATE TRIGGER set_equipment_timestamp
  BEFORE UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- =====================================================
-- TABLE 4: borrow_requests
-- =====================================================
CREATE TABLE IF NOT EXISTS borrow_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  purpose TEXT,
  organization_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE borrow_requests ADD COLUMN IF NOT EXISTS organization_name TEXT;

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS maintenance_qty INTEGER NOT NULL DEFAULT 0;

UPDATE equipment
SET maintenance_qty = total_qty - available_qty
WHERE status = 'maintenance' AND maintenance_qty = 0;

DO $equipment_quantity_balance$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_quantity_balance'
  ) THEN
    ALTER TABLE equipment
      ADD CONSTRAINT equipment_quantity_balance
      CHECK (available_qty + maintenance_qty <= total_qty);
  END IF;
END;
$equipment_quantity_balance$;

-- =====================================================
-- TABLE 5: borrow_request_items
-- =====================================================
CREATE TABLE IF NOT EXISTS borrow_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES borrow_requests(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  qty INTEGER NOT NULL CHECK (qty > 0),
  borrow_date DATE NOT NULL,
  expected_return_date DATE NOT NULL,
  CHECK (expected_return_date >= borrow_date)
);

-- =====================================================
-- TABLE 6: checkouts
-- =====================================================
CREATE TABLE IF NOT EXISTS checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_item_id UUID REFERENCES borrow_request_items(id) ON DELETE SET NULL,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_team TEXT,
  qty INTEGER NOT NULL CHECK (qty > 0),
  checked_out_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date DATE NOT NULL,
  returned_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'checked_out' CHECK (status IN ('checked_out', 'returned')),
  processed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  returned_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- =====================================================
-- TABLE 7: return_requests
-- =====================================================
CREATE TABLE IF NOT EXISTS return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id UUID NOT NULL REFERENCES checkouts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS one_pending_return_per_checkout
  ON return_requests (checkout_id)
  WHERE status = 'pending';

-- =====================================================
-- TABLE 8: maintenance
-- =====================================================
CREATE TABLE IF NOT EXISTS maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  scheduled_date DATE NOT NULL,
  technician TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed')),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- TABLE 9: purchase_orders
-- =====================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE NOT NULL,
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
  equipment_description TEXT,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_cost NUMERIC(10,2) NOT NULL,
  total_cost NUMERIC(10,2) GENERATED ALWAYS AS (qty * unit_cost) STORED,
  order_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'ordered', 'shipped', 'received', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ
);

-- =====================================================
-- TABLE 10: activity_logs
-- =====================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- SEED DATA: equipment_categories
-- =====================================================
INSERT INTO equipment_categories (name) VALUES
  ('Ball Games'),
  ('Racket Sports'),
  ('Combative Sports'),
  ('Athletics'),
  ('Aquatic Sports')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- SEED DATA: equipment
-- =====================================================
INSERT INTO equipment (sku, name, category_id, available_qty, total_qty, condition, location, status)
SELECT e.sku, e.name, c.id, e.available_qty, e.total_qty, e.condition, e.location, e.status
FROM (
  VALUES
    ('BG-0001', 'Basketball (Pro)',          'Ball Games',     18, 24, 'Excellent', 'Cage A',          'available'),
    ('BG-0002', 'Soccer Ball (Match)',       'Ball Games',     22, 30, 'Good',      'Cage A',          'available'),
    ('BG-0003', 'Volleyball (Match)',        'Ball Games',     12, 15, 'Good',      'Cage A',          'available'),
    ('RS-0001', 'Badminton Net',             'Racket Sports',   2,  4, 'Good',      'Gym Annex',       'available'),
    ('RS-0002', 'Tennis Racket (Pro)',       'Racket Sports',  14, 16, 'Good',      'Court Storage',   'available'),
    ('CS-0001', 'Boxing Gloves (12oz)',      'Combative Sports',31, 40, 'Good',     'Locker Room B',   'available'),
    ('CS-0002', 'Judo Gi (Size M)',          'Combative Sports',28, 35, 'Excellent','Dojo Storage',    'available'),
    ('AT-0001', 'Running Spikes (Size 10)',  'Athletics',       0, 12, 'Good',      'Equipment Room',  'available'),
    ('AT-0002', 'Shot Put (7.26kg)',         'Athletics',       8,  8, 'Excellent', 'Field Cage',      'available'),
    ('AT-0003', 'Javelin',                   'Athletics',      10, 10, 'Good',      'Field Cage',      'available'),
    ('AQ-0001', 'Pull Buoy',                 'Aquatic Sports', 45, 60, 'Fair',      'Pool Storage',    'available'),
    ('AQ-0002', 'Swim Fins (Size L)',        'Aquatic Sports',  0, 20, 'Poor',      'Pool Storage',    'maintenance')
) AS e(sku, name, cat_name, available_qty, total_qty, condition, location, status)
JOIN equipment_categories c ON c.name = e.cat_name
ON CONFLICT (sku) DO NOTHING;

-- =====================================================
-- SEED DATA: maintenance
-- =====================================================
INSERT INTO maintenance (equipment_id, type, priority, scheduled_date, technician, status)
SELECT e.id, m.type, m.priority, m.scheduled_date::DATE, m.technician, m.status
FROM equipment e
JOIN (
  VALUES
    ('AQ-0002', 'Repair',             'high',   '2026-09-20'::TEXT, 'Ray Delgado',  'scheduled'),
    ('CS-0001', 'Safety Inspection',  'high',   '2026-09-22'::TEXT, 'Sandra Choi',  'scheduled'),
    ('BG-0001', 'Pressure Check',     'low',    '2026-09-25'::TEXT, 'Ray Delgado',  'scheduled'),
    ('RS-0001', 'Tension Adjustment', 'medium', '2026-09-21'::TEXT, 'Sandra Choi',  'scheduled'),
    ('RS-0002', 'Restringing',        'medium', '2026-09-19'::TEXT, 'Ray Delgado',  'completed')
) AS m(sku, type, priority, scheduled_date, technician, status) ON e.sku = m.sku
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED DATA: purchase_orders
-- =====================================================
INSERT INTO purchase_orders (po_number, equipment_id, equipment_description, qty, unit_cost, order_date, status)
SELECT
  p.po_number,
  e.id,
  p.equipment_description,
  p.qty,
  p.unit_cost,
  p.order_date::DATE,
  p.status
FROM (
  VALUES
    ('PO-014', 'BG-0002', 'Ordered 2026-09-15 · Ball Games',   20, 48.00, '2026-09-15'::TEXT, 'pending_approval'),
    ('PO-015', 'AQ-0002', 'Ordered 2026-09-18 · Aquatic Sports', 15, 60.00, '2026-09-18'::TEXT, 'ordered')
) AS p(po_number, sku, equipment_description, qty, unit_cost, order_date, status)
LEFT JOIN equipment e ON e.sku = p.sku
ON CONFLICT (po_number) DO NOTHING;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrow_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Policies are recreated below so this complete schema can be safely rerun.
DROP POLICY IF EXISTS profiles_select ON profiles;
DROP POLICY IF EXISTS profiles_update ON profiles;
DROP POLICY IF EXISTS categories_select ON equipment_categories;
DROP POLICY IF EXISTS categories_all ON equipment_categories;
DROP POLICY IF EXISTS equipment_select ON equipment;
DROP POLICY IF EXISTS equipment_all ON equipment;
DROP POLICY IF EXISTS requests_select ON borrow_requests;
DROP POLICY IF EXISTS requests_insert ON borrow_requests;
DROP POLICY IF EXISTS requests_update ON borrow_requests;
DROP POLICY IF EXISTS requests_delete ON borrow_requests;
DROP POLICY IF EXISTS items_select ON borrow_request_items;
DROP POLICY IF EXISTS items_insert ON borrow_request_items;
DROP POLICY IF EXISTS items_all_admin ON borrow_request_items;
DROP POLICY IF EXISTS checkouts_select ON checkouts;
DROP POLICY IF EXISTS checkouts_all_admin ON checkouts;
DROP POLICY IF EXISTS return_requests_select ON return_requests;
DROP POLICY IF EXISTS return_requests_insert ON return_requests;
DROP POLICY IF EXISTS return_requests_admin_update ON return_requests;
DROP POLICY IF EXISTS maintenance_all ON maintenance;
DROP POLICY IF EXISTS po_all ON purchase_orders;
DROP POLICY IF EXISTS logs_select ON activity_logs;
DROP POLICY IF EXISTS logs_insert ON activity_logs;

-- Helper function: check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $is_admin$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$is_admin$;

-- Helper: check if user owns a row (generic)
CREATE OR REPLACE FUNCTION is_owner(col_name TEXT DEFAULT 'user_id')
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $is_owner$
DECLARE
  uid UUID;
BEGIN
  uid := auth.uid();
  RETURN (to_jsonb(current_setting('app.current_row_data', true))->>col_name)::UUID = uid;
END;
$is_owner$;

-- ===============================
-- RLS: profiles
-- ===============================
-- Users can see their own profile; admins see all
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (id = auth.uid() OR is_admin());

-- Users can update their own name; admins can update all
CREATE POLICY profiles_update ON profiles FOR UPDATE
  USING (id = auth.uid() OR is_admin());

-- ===============================
-- RLS: equipment_categories — all authenticated users can read
-- ===============================
CREATE POLICY categories_select ON equipment_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY categories_all ON equipment_categories FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ===============================
-- RLS: equipment — all authenticated users can read; admins CRUD
-- ===============================
CREATE POLICY equipment_select ON equipment FOR SELECT
  USING (auth.uid() IS NOT NULL AND (status != 'deactivated' OR is_admin()));

CREATE POLICY equipment_all ON equipment FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ===============================
-- RLS: borrow_requests — users see own requests; admins see all
-- ===============================
CREATE POLICY requests_select ON borrow_requests FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY requests_insert ON borrow_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY requests_update ON borrow_requests FOR UPDATE
  USING (is_admin());

CREATE POLICY requests_delete ON borrow_requests FOR DELETE
  USING (is_admin());

-- ===============================
-- RLS: borrow_request_items
-- ===============================
CREATE POLICY items_select ON borrow_request_items FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM borrow_requests r WHERE r.id = request_id AND r.user_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY items_insert ON borrow_request_items FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM borrow_requests r WHERE r.id = request_id AND r.user_id = auth.uid())
  );

CREATE POLICY items_all_admin ON borrow_request_items FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ===============================
-- RLS: checkouts — users see own; admins all
-- ===============================
CREATE POLICY checkouts_select ON checkouts FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY checkouts_all_admin ON checkouts FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ===============================
-- RLS: return_requests
-- ===============================
CREATE POLICY return_requests_select ON return_requests FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY return_requests_insert ON return_requests FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM checkouts c
      WHERE c.id = checkout_id
        AND c.user_id = auth.uid()
        AND c.status = 'checked_out'
    )
  );

CREATE POLICY return_requests_admin_update ON return_requests FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- ===============================
-- RLS: maintenance — admins only
-- ===============================
CREATE POLICY maintenance_all ON maintenance FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ===============================
-- RLS: purchase_orders — admins only
-- ===============================
CREATE POLICY po_all ON purchase_orders FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ===============================
-- RLS: activity_logs — admins read/write; users write only their own
-- ===============================
CREATE POLICY logs_select ON activity_logs FOR SELECT
  USING (is_admin());

CREATE POLICY logs_insert ON activity_logs FOR INSERT
  WITH CHECK (user_id = auth.uid() OR is_admin());

-- =====================================================
-- PART 2
-- =====================================================

-- =====================================================
-- POSTGRES RPC: increment_equipment_qty (used on return)
-- =====================================================
CREATE OR REPLACE FUNCTION reserve_equipment_qty(equipment_uuid UUID, qty_requested INTEGER)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $reserve_equipment_qty$
DECLARE
  item equipment%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF qty_requested IS NULL OR qty_requested <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  SELECT * INTO item FROM equipment WHERE id = equipment_uuid FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Equipment not found';
  END IF;

  IF item.status = 'maintenance' AND item.available_qty = 0 THEN
    RAISE EXCEPTION 'This equipment is currently under maintenance and cannot be borrowed';
  END IF;

  IF item.status = 'deactivated' THEN
    RAISE EXCEPTION 'This equipment is not available for borrowing';
  END IF;

  IF item.available_qty < qty_requested THEN
    RAISE EXCEPTION 'Insufficient stock';
  END IF;

  UPDATE equipment
  SET available_qty = available_qty - qty_requested,
      updated_at = NOW()
  WHERE id = equipment_uuid;
END;
$reserve_equipment_qty$;

GRANT EXECUTE ON FUNCTION reserve_equipment_qty(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION request_equipment_return(
  checkout_uuid UUID,
  quantity_requested INTEGER
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $request_equipment_return$
DECLARE
  checkout_row checkouts%ROWTYPE;
  return_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF quantity_requested IS NULL OR quantity_requested <= 0 THEN
    RAISE EXCEPTION 'Return quantity must be greater than zero';
  END IF;

  SELECT * INTO checkout_row
  FROM checkouts
  WHERE id = checkout_uuid
  FOR UPDATE;

  IF NOT FOUND OR checkout_row.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Checkout not found';
  END IF;

  IF checkout_row.status <> 'checked_out' THEN
    RAISE EXCEPTION 'This checkout is already returned';
  END IF;

  IF quantity_requested > checkout_row.qty THEN
    RAISE EXCEPTION 'Return quantity exceeds the outstanding checkout quantity';
  END IF;

  IF EXISTS (
    SELECT 1 FROM return_requests
    WHERE checkout_id = checkout_uuid AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A return request is already pending for this checkout';
  END IF;

  INSERT INTO return_requests (checkout_id, user_id, quantity)
  VALUES (checkout_uuid, auth.uid(), quantity_requested)
  RETURNING id INTO return_id;

  RETURN return_id;
END;
$request_equipment_return$;

GRANT EXECUTE ON FUNCTION request_equipment_return(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION review_equipment_return(
  return_request_uuid UUID,
  decision TEXT,
  rejection_reason_value TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $review_equipment_return$
DECLARE
  request_row return_requests%ROWTYPE;
  checkout_row checkouts%ROWTYPE;
  equipment_row equipment%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only administrators can review returns';
  END IF;

  IF decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid return decision';
  END IF;

  SELECT * INTO request_row
  FROM return_requests
  WHERE id = return_request_uuid
  FOR UPDATE;

  IF NOT FOUND OR request_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Return request is no longer pending';
  END IF;

  SELECT * INTO checkout_row
  FROM checkouts
  WHERE id = request_row.checkout_id
  FOR UPDATE;

  IF NOT FOUND OR checkout_row.status <> 'checked_out' THEN
    RAISE EXCEPTION 'Checkout is no longer active';
  END IF;

  IF request_row.quantity > checkout_row.qty THEN
    RAISE EXCEPTION 'Return quantity exceeds the active checkout quantity';
  END IF;

  IF decision = 'rejected' THEN
    UPDATE return_requests
    SET status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = NOW(),
        rejection_reason = NULLIF(TRIM(rejection_reason_value), '')
    WHERE id = return_request_uuid;
    RETURN;
  END IF;

  SELECT * INTO equipment_row
  FROM equipment
  WHERE id = checkout_row.equipment_id
  FOR UPDATE;

  IF equipment_row.status = 'maintenance' THEN
    UPDATE equipment
    SET maintenance_qty = maintenance_qty + request_row.quantity,
        updated_at = NOW()
    WHERE id = equipment_row.id;
  ELSE
    UPDATE equipment
    SET available_qty = LEAST(total_qty - maintenance_qty, available_qty + request_row.quantity),
        updated_at = NOW()
    WHERE id = equipment_row.id;
  END IF;

  IF request_row.quantity = checkout_row.qty THEN
    UPDATE checkouts
    SET status = 'returned',
        returned_at = NOW(),
        returned_by = auth.uid()
    WHERE id = checkout_row.id;
  ELSE
    UPDATE checkouts
    SET qty = qty - request_row.quantity
    WHERE id = checkout_row.id;
  END IF;

  UPDATE return_requests
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = NOW()
  WHERE id = return_request_uuid;
END;
$review_equipment_return$;

GRANT EXECUTE ON FUNCTION review_equipment_return(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION start_equipment_maintenance(
  equipment_uuid UUID,
  maintenance_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $start_equipment_maintenance$
DECLARE
  item equipment%ROWTYPE;
  maintenance_id UUID;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only administrators can start maintenance';
  END IF;

  SELECT * INTO item FROM equipment WHERE id = equipment_uuid FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Equipment not found';
  END IF;

  IF item.status = 'maintenance' THEN
    SELECT id INTO maintenance_id
    FROM maintenance
    WHERE equipment_id = equipment_uuid
      AND status <> 'completed'
    ORDER BY created_at DESC
    LIMIT 1;

    IF maintenance_id IS NOT NULL THEN
      RETURN maintenance_id;
    END IF;

    INSERT INTO maintenance (
      equipment_id, type, priority, scheduled_date, technician, status, notes, created_by
    ) VALUES (
      equipment_uuid,
      'Repair',
      'medium',
      CURRENT_DATE,
      'Unassigned',
      'scheduled',
      'Equipment was already marked as under maintenance.',
      auth.uid()
    )
    RETURNING id INTO maintenance_id;

    RETURN maintenance_id;
  END IF;

  UPDATE equipment
  SET maintenance_qty = maintenance_qty + available_qty,
      available_qty = 0,
      status = 'maintenance',
      updated_at = NOW()
  WHERE id = equipment_uuid;

  INSERT INTO maintenance (
    equipment_id, type, priority, scheduled_date, technician, status, notes, created_by
  ) VALUES (
    equipment_uuid,
    'Repair',
    'medium',
    CURRENT_DATE,
    'Unassigned',
    'scheduled',
    NULLIF(TRIM(maintenance_reason), ''),
    auth.uid()
  )
  RETURNING id INTO maintenance_id;

  RETURN maintenance_id;
END;
$start_equipment_maintenance$;

GRANT EXECUTE ON FUNCTION start_equipment_maintenance(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION finish_equipment_maintenance(
  maintenance_uuid UUID,
  ready_quantity INTEGER,
  needs_maintenance_quantity INTEGER
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $finish_equipment_maintenance$
DECLARE
  task maintenance%ROWTYPE;
  item equipment%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only administrators can finish maintenance';
  END IF;

  IF ready_quantity IS NULL OR needs_maintenance_quantity IS NULL
     OR ready_quantity < 0 OR needs_maintenance_quantity < 0 THEN
    RAISE EXCEPTION 'Maintenance quantities cannot be negative';
  END IF;

  SELECT * INTO task FROM maintenance WHERE id = maintenance_uuid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Maintenance record not found';
  END IF;

  SELECT * INTO item FROM equipment WHERE id = task.equipment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Equipment not found';
  END IF;

  IF ready_quantity + needs_maintenance_quantity <> item.maintenance_qty THEN
    RAISE EXCEPTION 'Maintenance quantities must equal the current maintenance quantity';
  END IF;

  IF item.available_qty + ready_quantity + needs_maintenance_quantity > item.total_qty THEN
    RAISE EXCEPTION 'Result exceeds the equipment total quantity';
  END IF;

  UPDATE equipment
  SET available_qty = available_qty + ready_quantity,
      maintenance_qty = needs_maintenance_quantity,
      status = CASE WHEN needs_maintenance_quantity > 0 THEN 'maintenance' ELSE 'available' END,
      updated_at = NOW()
  WHERE id = item.id;

  UPDATE maintenance
  SET status = CASE WHEN needs_maintenance_quantity > 0 THEN 'in_progress' ELSE 'completed' END,
      completed_at = CASE WHEN needs_maintenance_quantity > 0 THEN NULL ELSE NOW() END,
      notes = CONCAT_WS(E'\n', NULLIF(notes, ''),
        FORMAT('Inspection result: %s ready, %s still requiring maintenance.', ready_quantity, needs_maintenance_quantity))
  WHERE id = maintenance_uuid;
END;
$finish_equipment_maintenance$;

GRANT EXECUTE ON FUNCTION finish_equipment_maintenance(UUID, INTEGER, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION increment_equipment_qty(equipment_uuid UUID, qty_increment INTEGER)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $increment_equipment_qty$
BEGIN
  UPDATE equipment
  SET
    available_qty = LEAST(total_qty - maintenance_qty, available_qty + qty_increment),
    updated_at = NOW()
  WHERE id = equipment_uuid
    AND available_qty + qty_increment >= 0;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient stock' USING ERRCODE = 'P0001';
  END IF;
END;
$increment_equipment_qty$;

GRANT EXECUTE ON FUNCTION increment_equipment_qty(UUID, INTEGER) TO authenticated;

-- =====================================================
-- CHECKOUT DEMO DATA
-- =====================================================
-- Intentionally omitted from the base schema.
-- `profiles.id` references `auth.users(id)`, so checkout demo rows must use
-- real authenticated users that already exist in Supabase Auth.
-- After you create test accounts, we can seed checkouts with those real IDs.

-- Add organization_name to borrow_requests if missing
ALTER TABLE public.borrow_requests
  ADD COLUMN IF NOT EXISTS organization_name TEXT;

-- Helpful indexes (no-op if already present)
CREATE INDEX IF NOT EXISTS idx_borrow_requests_user_id
  ON public.borrow_requests (user_id);

CREATE INDEX IF NOT EXISTS idx_borrow_request_items_request_id
  ON public.borrow_request_items (request_id);

CREATE INDEX IF NOT EXISTS idx_borrow_request_items_equipment_id
  ON public.borrow_request_items (equipment_id);
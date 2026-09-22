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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
-- TABLE 7: maintenance
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
-- TABLE 8: purchase_orders
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
-- TABLE 9: activity_logs
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
ALTER TABLE maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

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
CREATE OR REPLACE FUNCTION increment_equipment_qty(equipment_uuid UUID, qty_increment INTEGER)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $increment_equipment_qty$
BEGIN
  UPDATE equipment
  SET
    available_qty = LEAST(total_qty, available_qty + qty_increment),
    updated_at = NOW()
  WHERE id = equipment_uuid;
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


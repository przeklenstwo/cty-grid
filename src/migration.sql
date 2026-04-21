-- ═══════════════════════════════════════════════════════════════
-- MIGRACJA: usunięcie sekcji PRZYPAŁ + wsparcie dla zmiany typu spota
-- ═══════════════════════════════════════════════════════════════

-- 1. Usuń wszystkie komentarze typu 'hazard' (przypał)
DELETE FROM comments WHERE comment_type = 'hazard';

-- 2. (opcjonalnie) Upewnij się że constraint na comment_type nie zawiera 'hazard'
-- Jeśli masz CHECK constraint, zaktualizuj go:
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_comment_type_check;
ALTER TABLE comments ADD CONSTRAINT comments_comment_type_check
  CHECK (comment_type IN ('normal', 'tip', 'buff_report'));

-- 3. Upewnij się że kolumny is_moving i vehicle_type istnieją (pewnie już są)
ALTER TABLE spots ADD COLUMN IF NOT EXISTS is_moving BOOLEAN DEFAULT false;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS vehicle_type TEXT;

-- 4. RLS — admin musi mieć prawo update'ować cudze spoty
-- (jeśli masz już politykę "admin can update spots" to pomiń)
DROP POLICY IF EXISTS "admins_update_spots" ON spots;
CREATE POLICY "admins_update_spots" ON spots
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT user_id FROM admins)
    OR auth.uid() = '59c2b986-ad0d-4d95-ada4-a739016563f2'::uuid
  );

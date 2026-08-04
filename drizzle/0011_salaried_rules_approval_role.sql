ALTER TABLE salaried_rules ADD COLUMN IF NOT EXISTS approval_role text NOT NULL DEFAULT 'owner_or_manager';
-- Scoped to the column default so re-running this migration never overwrites a
-- value an admin has since changed by hand.
UPDATE salaried_rules SET approval_role = 'owner'
WHERE type = 'quality_bonus' AND approval_role = 'owner_or_manager';

ALTER TABLE salaried_rules ADD COLUMN IF NOT EXISTS approval_role text NOT NULL DEFAULT 'owner_or_manager';
UPDATE salaried_rules SET approval_role = 'owner' WHERE type = 'quality_bonus';

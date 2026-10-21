-- Migration 010: Enforce single active offer per business loyalty program

-- 1. Make validate_reward_model trigger resilient when deactivating rewards
CREATE OR REPLACE FUNCTION public.validate_reward_model()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE program_model public.loyalty_model;
BEGIN
  -- Only validate model alignment for active rewards
  IF NEW.is_active = true THEN
    SELECT model INTO program_model FROM public.loyalty_programs WHERE id = NEW.program_id;
    IF program_model = 'STAMPS' AND (NEW.required_stamps IS NULL OR NEW.required_points IS NOT NULL) THEN
      RAISE EXCEPTION 'Stamps programs require stamp rewards';
    END IF;
    IF program_model = 'POINTS' AND (NEW.required_points IS NULL OR NEW.required_stamps IS NOT NULL) THEN
      RAISE EXCEPTION 'Points programs require point rewards';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Clean up any historical active rewards that mismatch program model
UPDATE public.rewards r
SET required_points = COALESCE(r.required_points, r.required_stamps, 10),
    required_stamps = NULL
FROM public.loyalty_programs p
WHERE p.id = r.program_id AND p.model = 'POINTS' AND r.required_points IS NULL;

UPDATE public.rewards r
SET required_stamps = COALESCE(r.required_stamps, r.required_points, 10),
    required_points = NULL
FROM public.loyalty_programs p
WHERE p.id = r.program_id AND p.model = 'STAMPS' AND r.required_stamps IS NULL;

-- 3. Deduplicate active rewards per program, keeping only the newest reward active
WITH ranked_rewards AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY program_id ORDER BY created_at DESC) as rn
  FROM public.rewards
  WHERE is_active = true
)
UPDATE public.rewards
SET is_active = false
WHERE id IN (
  SELECT id FROM ranked_rewards WHERE rn > 1
);

-- 4. Partial unique index: strictly enforce at most one active offer per program at the database level
CREATE UNIQUE INDEX IF NOT EXISTS rewards_single_active_offer_idx
  ON public.rewards (program_id)
  WHERE is_active = true;

-- 5. Performance index for paginated activity queries
CREATE INDEX IF NOT EXISTS transactions_pagination_idx
  ON public.transactions (created_at DESC, id DESC);


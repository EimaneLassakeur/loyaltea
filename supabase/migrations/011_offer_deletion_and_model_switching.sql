-- Migration 011: Offer deletion support and automatic program model synchronization

-- 1. Add deleted_at column to public.rewards
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 2. Update single active offer unique index to exclude soft-deleted offers
DROP INDEX IF EXISTS public.rewards_single_active_offer_idx;
CREATE UNIQUE INDEX rewards_single_active_offer_idx
  ON public.rewards (program_id)
  WHERE is_active = true AND deleted_at IS NULL;

-- 3. Automatically synchronize loyalty_programs.model when an active offer is created or updated
CREATE OR REPLACE FUNCTION public.validate_reward_model()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE program_model public.loyalty_model;
BEGIN
  -- Only synchronize for active, non-deleted offers
  IF NEW.is_active = true AND NEW.deleted_at IS NULL THEN
    SELECT model INTO program_model FROM public.loyalty_programs WHERE id = NEW.program_id;
    IF NEW.required_points IS NOT NULL AND program_model != 'POINTS' THEN
      UPDATE public.loyalty_programs SET model = 'POINTS', updated_at = now() WHERE id = NEW.program_id;
    ELSIF NEW.required_stamps IS NOT NULL AND program_model != 'STAMPS' THEN
      UPDATE public.loyalty_programs SET model = 'STAMPS', updated_at = now() WHERE id = NEW.program_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

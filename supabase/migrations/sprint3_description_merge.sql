-- Sprint 3 — Merge what_to_expect into description for all existing events
-- Appends what_to_expect after description (double newline separator) where both exist;
-- uses what_to_expect as description where description was blank.
UPDATE events
SET description = CASE
  WHEN (description IS NULL OR TRIM(description) = '')
    AND (what_to_expect IS NOT NULL AND TRIM(what_to_expect) != '')
    THEN what_to_expect
  WHEN description IS NOT NULL AND TRIM(description) != ''
    AND (what_to_expect IS NOT NULL AND TRIM(what_to_expect) != '')
    THEN description || E'\n\n' || what_to_expect
  ELSE description
END
WHERE what_to_expect IS NOT NULL AND TRIM(COALESCE(what_to_expect, '')) != '';

-- Clear what_to_expect after migration (content is now in description)
UPDATE events SET what_to_expect = NULL WHERE what_to_expect IS NOT NULL;

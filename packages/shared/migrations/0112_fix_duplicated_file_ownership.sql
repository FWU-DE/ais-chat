-- Duplicated entities used to keep the original owner on their copied files, and older files have no owner; set the owner of the entity instead.
-- Files linked to entities with different owners are skipped since the correct owner is ambiguous.
WITH entity_files AS (
  SELECT m.file_id, a.user_id AS entity_owner
  FROM assistant_file_mapping m
  JOIN assistant a ON a.id = m.assistant_id
  UNION ALL
  SELECT m.file_id, c.user_id
  FROM character_file_mapping m
  JOIN character c ON c.id = m.character_id
  UNION ALL
  SELECT m.file_id, l.user_id
  FROM learning_scenario_file_mapping m
  JOIN learning_scenario l ON l.id = m.learning_scenario_id
),
unambiguous_owners AS (
  SELECT file_id, MIN(entity_owner::text)::uuid AS entity_owner
  FROM entity_files
  WHERE entity_owner IS NOT NULL
  GROUP BY file_id
  HAVING COUNT(DISTINCT entity_owner) = 1
)
UPDATE file_table f
SET user_id = o.entity_owner
FROM unambiguous_owners o
WHERE f.id = o.file_id
  AND f.user_id IS DISTINCT FROM o.entity_owner;
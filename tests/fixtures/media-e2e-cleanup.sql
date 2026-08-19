PRAGMA foreign_keys = ON;

DELETE FROM content_publications
WHERE entry_id IN ('e2e-media-test', 'e2e-mediafire-test');
DELETE FROM content_entries
WHERE id IN ('e2e-media-test', 'e2e-mediafire-test');

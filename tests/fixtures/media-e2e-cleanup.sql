PRAGMA foreign_keys = ON;

DELETE FROM content_publications
WHERE entry_id IN (
  'e2e-media-test', 'e2e-mediafire-test', 'e2e-audio-test',
  'e2e-audio-bounds-test', 'e2e-audio-fallback-test'
);
DELETE FROM content_entries
WHERE id IN (
  'e2e-media-test', 'e2e-mediafire-test', 'e2e-audio-test',
  'e2e-audio-bounds-test', 'e2e-audio-fallback-test'
);

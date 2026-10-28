-- Removes the Content Studio e2e fixture. Published rows cannot be deleted,
-- so they are unpublished first; the showreel flag is cleared; redirects,
-- usage rows and assets go last. Then the owner track that held the showreel
-- slot before the seed (saved by cms-e2e.sql) gets it back. Safe to run
-- without a seed, or twice.
PRAGMA foreign_keys = ON;

UPDATE music_tracks SET status = 'draft', is_showreel = 0 WHERE id GLOB 'e2e-cms-*';
UPDATE projects SET status = 'draft' WHERE id GLOB 'e2e-cms-*';
UPDATE recognitions SET status = 'draft' WHERE id GLOB 'e2e-cms-*';
UPDATE writings SET status = 'draft' WHERE id GLOB 'e2e-cms-*';
DELETE FROM media_usages WHERE entity_id GLOB 'e2e-cms-*';
DELETE FROM slug_redirects WHERE entity_id GLOB 'e2e-cms-*';
DELETE FROM music_tracks WHERE id GLOB 'e2e-cms-*';
DELETE FROM recognitions WHERE id GLOB 'e2e-cms-*';
DELETE FROM writings WHERE id GLOB 'e2e-cms-*';
DELETE FROM projects WHERE id GLOB 'e2e-cms-*';
DELETE FROM social_links WHERE id GLOB 'e2e-cms-*';
DELETE FROM media_assets WHERE id GLOB 'e2e-cms-asset-*';

CREATE TABLE IF NOT EXISTS e2e_cms_showreel_backup (
  slot INTEGER PRIMARY KEY CHECK (slot = 1),
  track_id TEXT NOT NULL
);
-- Not if the owner chose another showreel meanwhile, or archived this track.
UPDATE music_tracks SET is_showreel = 1
WHERE id = (SELECT track_id FROM e2e_cms_showreel_backup WHERE slot = 1)
  AND status <> 'archived'
  AND NOT EXISTS (SELECT 1 FROM music_tracks WHERE is_showreel = 1);
DROP TABLE e2e_cms_showreel_backup;

-- Removes the Content Studio e2e fixture. Published rows cannot be deleted,
-- so they are unpublished first; the showreel flag is cleared; redirects,
-- usage rows and assets go last.
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

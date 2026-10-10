-- Removes the media e2e fixture: unpublish first (published rows cannot be
-- deleted), then projects, then their assets.
PRAGMA foreign_keys = ON;

UPDATE projects SET status = 'draft' WHERE id GLOB 'e2e-media-*';
DELETE FROM media_usages WHERE entity_id GLOB 'e2e-media-*';
DELETE FROM projects WHERE id GLOB 'e2e-media-*';
DELETE FROM media_assets WHERE id GLOB 'e2e-media-asset-*';

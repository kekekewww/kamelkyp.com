-- Removes the commission terms e2e fixture and puts back the publications it
-- replaced (saved by terms-e2e.sql). Safe to run without a seed, or twice.
DROP TRIGGER IF EXISTS term_versions_immutable_delete;

DELETE FROM term_publications WHERE version_id LIKE 'e2e-%';
DELETE FROM term_versions WHERE id LIKE 'e2e-%';

-- Both immutability triggers end up in place (as migration 0004 made them),
-- even after a seed that stopped before it recreated them.
CREATE TRIGGER term_versions_immutable_delete
BEFORE DELETE ON term_versions
BEGIN
  SELECT RAISE(ABORT, 'term_version_immutable');
END;

CREATE TRIGGER IF NOT EXISTS term_versions_immutable_update
BEFORE UPDATE ON term_versions
BEGIN
  SELECT RAISE(ABORT, 'term_version_immutable');
END;

CREATE TABLE IF NOT EXISTS e2e_term_publications_backup (
  document_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  version_id TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  PRIMARY KEY (document_id, locale)
);

-- A publication the owner made while the fixture was in place is newer than
-- the saved one and stays.
INSERT OR IGNORE INTO term_publications
  (document_id, locale, version_id, effective_from)
SELECT b.document_id, b.locale, b.version_id, b.effective_from
FROM e2e_term_publications_backup b
WHERE EXISTS (SELECT 1 FROM term_versions v WHERE v.id = b.version_id);

DROP TABLE e2e_term_publications_backup;

DROP TRIGGER IF EXISTS term_versions_immutable_delete;

DELETE FROM term_publications WHERE version_id LIKE 'e2e-%';
DELETE FROM term_versions WHERE id LIKE 'e2e-%';

CREATE TRIGGER term_versions_immutable_delete
BEFORE DELETE ON term_versions
BEGIN
  SELECT RAISE(ABORT, 'term_version_immutable');
END;

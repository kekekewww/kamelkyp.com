-- 0010_cms_footer_groups.sql — footer group placement becomes CMS data
-- (docs/superpowers/specs/2026-10-13-wp3-footer.md §7, content-schema "Footer link groups").
-- Additive and idempotent: INSERT OR IGNORE only; nothing is updated or deleted
-- and a second run changes nothing. The five built-in footer groups get
-- link_groups rows (position, visibility, label); their links stay derived at
-- read time (site navigation, service areas, social links, brand contact email,
-- legal pages). Custom groups keep their rows in `links`. Positions wrap the
-- existing groups so the public footer order is unchanged.

INSERT OR IGNORE INTO link_groups (id, stable_key, sort_order, enabled)
SELECT 'seed-footer-navigate', 'navigate',
  COALESCE((SELECT MIN(sort_order) FROM link_groups
            WHERE stable_key NOT IN ('navigate', 'services', 'find_me', 'contact', 'legal', 'social')), 30) - 20,
  1;

INSERT OR IGNORE INTO link_groups (id, stable_key, sort_order, enabled)
SELECT 'seed-footer-services', 'services',
  COALESCE((SELECT MIN(sort_order) FROM link_groups
            WHERE stable_key NOT IN ('navigate', 'services', 'find_me', 'contact', 'legal', 'social')), 30) - 10,
  1;

INSERT OR IGNORE INTO link_groups (id, stable_key, sort_order, enabled)
SELECT 'seed-footer-find-me', 'find_me',
  COALESCE((SELECT MAX(sort_order) FROM link_groups
            WHERE stable_key NOT IN ('navigate', 'services', 'find_me', 'contact', 'legal', 'social')), 30) + 10,
  1;

INSERT OR IGNORE INTO link_groups (id, stable_key, sort_order, enabled)
SELECT 'seed-footer-contact', 'contact',
  COALESCE((SELECT MAX(sort_order) FROM link_groups
            WHERE stable_key NOT IN ('navigate', 'services', 'find_me', 'contact', 'legal', 'social')), 30) + 20,
  1;

INSERT OR IGNORE INTO link_groups (id, stable_key, sort_order, enabled)
SELECT 'seed-footer-legal', 'legal',
  COALESCE((SELECT MAX(sort_order) FROM link_groups
            WHERE stable_key NOT IN ('navigate', 'services', 'find_me', 'contact', 'legal', 'social')), 30) + 30,
  1;

WITH x(stable_key, locale, label) AS (
  VALUES
    ('navigate', 'zh', '導覽'), ('navigate', 'en', 'Navigate'),
    ('services', 'zh', '服務'), ('services', 'en', 'Services'),
    ('find_me', 'zh', '社群'), ('find_me', 'en', 'Find Me'),
    ('contact', 'zh', '聯絡'), ('contact', 'en', 'Contact'),
    ('legal', 'zh', '條款與網站'), ('legal', 'en', 'Legal')
)
INSERT OR IGNORE INTO link_group_labels (group_id, locale, label)
SELECT g.id, x.locale, x.label
FROM x JOIN link_groups g ON g.stable_key = x.stable_key;

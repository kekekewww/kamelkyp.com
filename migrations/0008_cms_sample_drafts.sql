-- 0008_cms_sample_drafts.sql — file-based placeholder content → drafts
-- (docs/content-schema.md §3.4, §6.1).
--
-- TODO_CONTENT: every row below is sample/placeholder content from the
-- redesign files. It is seeded as status 'draft' with todo_content = 1, never
-- featured. A table CHECK makes status 'published' impossible while
-- todo_content = 1, so sample content can never reach the public site; Kevin
-- replaces the text and clears the flag in the Studio first.
-- INSERT OR IGNORE: a legacy row that already owns a slug wins.

-- Projects ---------------------------------------------------------------------
INSERT OR IGNORE INTO projects (
  id, slug, status, todo_content, year, primary_category_id, title_i18n, role_i18n,
  short_description_i18n, tools_json, technologies_json, context_i18n, approach_i18n,
  architecture_i18n, result_i18n, featured, featured_order, sort_order, legacy_source,
  created_at, updated_at
) VALUES (
  'seed-p-001', 'sample-generative-audio-visual-tool', 'draft', 1, 2026,
  'term-project_category-ai',
  '{"zh":"示意：生成式影音工具","en":"Sample: Generative Audio-Visual Tool"}',
  '{"zh":"設計與開發","en":"Design & development"}',
  '{"zh":"示意內容：將音訊特徵轉為生成式畫面的工具。","en":"Placeholder for a tool that turns audio features into generative visuals."}',
  '[]', '["TypeScript","Web Audio API","Canvas 2D"]',
  '{"zh":"示意段落：這裡將說明專案背景。","en":"Sample paragraph: this will describe the project context."}',
  '{"zh":"示意段落：這裡將說明從音訊特徵到畫面的對應方式。","en":"Sample paragraph: this will explain how audio features map to visuals."}',
  '{"zh":"示意段落：這裡將說明系統架構。\n\n- 示意項目：音訊分析\n- 示意項目：畫面生成","en":"Sample paragraph: this will outline the system architecture.\n\n- Sample item: audio analysis\n- Sample item: visual generation"}',
  '{"zh":"示意段落：這裡將說明成果。","en":"Sample paragraph: this will describe the result."}',
  0, NULL, 10, 'file:projects/p-001', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'
);

INSERT OR IGNORE INTO projects (
  id, slug, status, todo_content, year, primary_category_id, title_i18n, role_i18n,
  short_description_i18n, tools_json, technologies_json, context_i18n, process_i18n,
  result_i18n, featured, featured_order, sort_order, legacy_source, created_at, updated_at
) VALUES (
  'seed-p-002', 'sample-full-song-mix', 'draft', 1, 2025,
  'term-project_category-mixing',
  '{"zh":"示意：完整歌曲混音——獨立單曲","en":"Sample: Full Song Mix — Indie Single"}',
  '{"zh":"混音與母帶","en":"Mixing & mastering"}',
  '{"zh":"示意內容：一首獨立單曲的完整混音與母帶。","en":"Placeholder for a full mix and master of an independent single."}',
  '[]', '["Pro Tools","FabFilter"]',
  '{"zh":"示意段落：這裡將說明歌曲與需求。","en":"Sample paragraph: this will describe the song and the brief."}',
  '{"zh":"示意段落：這裡將說明混音過程。","en":"Sample paragraph: this will walk through the mixing process."}',
  '{"zh":"示意段落：這裡將說明成果。","en":"Sample paragraph: this will describe the result."}',
  0, NULL, 20, 'file:projects/p-002', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'
);

INSERT OR IGNORE INTO projects (
  id, slug, status, todo_content, year, primary_category_id, title_i18n, role_i18n,
  short_description_i18n, tools_json, technologies_json, context_i18n, approach_i18n,
  reflection_i18n, featured, featured_order, sort_order, legacy_source, created_at, updated_at
) VALUES (
  'seed-p-003', 'sample-interactive-projection-study', 'draft', 1, 2025,
  'term-project_category-interactive',
  '{"zh":"示意：互動投影研究","en":"Sample: Interactive Projection Study"}',
  '{"zh":"創意開發","en":"Creative development"}',
  '{"zh":"示意內容：以肢體動作改變線條場的投影作品。","en":"Placeholder for a projection piece where movement shapes a line field."}',
  '[]', '["TouchDesigner","Depth camera"]',
  '{"zh":"示意段落：這裡將說明展演情境。","en":"Sample paragraph: this will describe the setting."}',
  '{"zh":"示意段落：這裡將說明動作與線條的互動設計。","en":"Sample paragraph: this will explain how movement shapes the lines."}',
  '{"zh":"示意段落：這裡將記錄心得。","en":"Sample paragraph: this will record the lessons learned."}',
  0, NULL, 30, 'file:projects/p-003', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'
);

INSERT OR IGNORE INTO projects (
  id, slug, status, todo_content, year, primary_category_id, title_i18n, role_i18n,
  short_description_i18n, tools_json, technologies_json, problem_i18n, architecture_i18n,
  result_i18n, featured, featured_order, sort_order, legacy_source, created_at, updated_at
) VALUES (
  'seed-p-004', 'sample-booking-management-system', 'draft', 1, 2024,
  'term-project_category-software',
  '{"zh":"示意：預約管理系統","en":"Sample: Booking Management System"}',
  '{"zh":"全端開發","en":"Full-stack development"}',
  '{"zh":"示意內容：以網頁系統取代試算表的內部工具。","en":"Placeholder for an internal system that replaces spreadsheets with a web app."}',
  '[]', '["React Router","Cloudflare Workers","D1"]',
  '{"zh":"示意段落：這裡將說明要解決的問題。","en":"Sample paragraph: this will describe the problem."}',
  '{"zh":"示意段落：這裡將說明系統架構。","en":"Sample paragraph: this will outline the system architecture."}',
  '{"zh":"示意段落：這裡將說明成果。","en":"Sample paragraph: this will describe the result."}',
  0, NULL, 40, 'file:projects/p-004', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'
);

INSERT OR IGNORE INTO projects (
  id, slug, status, todo_content, year, primary_category_id, title_i18n, role_i18n,
  short_description_i18n, tools_json, technologies_json, context_i18n, process_i18n,
  featured, featured_order, sort_order, legacy_source, created_at, updated_at
) VALUES (
  'seed-p-005', 'sample-vocal-production-session', 'draft', 1, 2024,
  'term-project_category-music',
  '{"zh":"示意：Vocal 製作紀錄","en":"Sample: Vocal Production Session"}',
  '{"zh":"人聲製作","en":"Vocal production"}',
  '{"zh":"示意內容：一次人聲錄製、編輯與修音的製作紀錄。","en":"Placeholder for a vocal recording, editing and tuning session."}',
  '[]', '["Pro Tools","Melodyne"]',
  '{"zh":"示意段落：這裡將說明錄音情境。","en":"Sample paragraph: this will describe the session."}',
  '{"zh":"示意段落：這裡將說明編輯與修音。","en":"Sample paragraph: this will explain editing and tuning."}',
  0, NULL, 50, 'file:projects/p-005', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'
);

INSERT OR IGNORE INTO projects (
  id, slug, status, todo_content, year, primary_category_id, title_i18n, role_i18n,
  short_description_i18n, tools_json, technologies_json, context_i18n, approach_i18n,
  reflection_i18n, featured, featured_order, sort_order, legacy_source, created_at, updated_at
) VALUES (
  'seed-p-006', 'sample-realtime-audio-analysis-notes', 'draft', 1, 2025,
  'term-project_category-research',
  '{"zh":"示意：即時音訊分析筆記","en":"Sample: Real-Time Audio Analysis Notes"}',
  '{"zh":"研究","en":"Research"}',
  '{"zh":"示意內容：關於瀏覽器即時頻譜分析的研究筆記。","en":"Placeholder for research notes on real-time spectral analysis in the browser."}',
  '[]', '["Web Audio API","TypeScript"]',
  '{"zh":"示意段落：這裡將說明研究問題。","en":"Sample paragraph: this will describe the research question."}',
  '{"zh":"示意段落：這裡將說明研究方法。","en":"Sample paragraph: this will describe the method."}',
  '{"zh":"示意段落：這裡將記錄心得。","en":"Sample paragraph: this will record the lessons learned."}',
  0, NULL, 60, 'file:projects/p-006', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'
);

-- Multi-row VALUES in a CTE (D1 caps compound SELECTs); the guard skips rows
-- whose seed project was not inserted because a legacy row owns the slug.
WITH x(project_id, term_id, position) AS (
  VALUES
    ('seed-p-001', 'term-project_category-ai', 0),
    ('seed-p-001', 'term-project_category-software', 1),
    ('seed-p-002', 'term-project_category-mixing', 0),
    ('seed-p-002', 'term-project_category-music', 1),
    ('seed-p-003', 'term-project_category-interactive', 0),
    ('seed-p-004', 'term-project_category-software', 0),
    ('seed-p-005', 'term-project_category-music', 0),
    ('seed-p-006', 'term-project_category-research', 0),
    ('seed-p-006', 'term-project_category-ai', 1)
)
INSERT OR IGNORE INTO project_categories (project_id, term_id, position)
SELECT x.project_id, x.term_id, x.position
FROM x
WHERE EXISTS (
  SELECT 1 FROM projects p
  WHERE p.id = x.project_id AND p.legacy_source GLOB 'file:*'
);

-- Recognition ------------------------------------------------------------------
INSERT OR IGNORE INTO recognitions (
  id, status, todo_content, type_term_id, discipline_term_id, year, event_i18n, result_i18n,
  featured, sort_order, legacy_source, created_at, updated_at
) VALUES
  ('seed-r-001', 'draft', 1, 'term-recognition_type-competition', 'term-project_category-software', 2026,
   '{"zh":"示意：黑客松參賽","en":"Sample: Hackathon Entry"}',
   '{"zh":"示意結果——開發工具組","en":"Placeholder result — developer tools track"}',
   0, 10, 'file:recognition/r-001', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('seed-r-002', 'draft', 1, 'term-recognition_type-competition', 'term-project_category-music', 2025,
   '{"zh":"示意：音樂製作比賽","en":"Sample: Music Production Competition"}',
   '{"zh":"示意結果","en":"Placeholder result"}',
   0, 20, 'file:recognition/r-002', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('seed-r-003', 'draft', 1, 'term-recognition_type-event', 'term-project_category-interactive', 2024,
   '{"zh":"示意：創意科技展演","en":"Sample: Creative Technology Showcase"}',
   '{"zh":"示意結果——展出作品","en":"Placeholder result — exhibited work"}',
   0, 30, 'file:recognition/r-003', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z');

-- Writing ----------------------------------------------------------------------
INSERT OR IGNORE INTO writings (
  id, slug, status, todo_content, date, platform, title_i18n, featured, sort_order,
  legacy_source, created_at, updated_at
) VALUES
  ('seed-w-001', 'sample-why-i-build-tools', 'draft', 1, '2026-09-01', 'internal',
   '{"zh":"示意：為什麼我自己做工具","en":"Sample: Why I Build Tools Instead of Just Using Them"}',
   0, 10, 'file:writing/w-001', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('seed-w-002', 'sample-notes-on-mixing-vocals', 'draft', 1, '2026-08-18', 'threads',
   '{"zh":"示意：為舞蹈演出混人聲的筆記","en":"Sample: Notes on Mixing Vocals for Dance Performances"}',
   0, 20, 'file:writing/w-002', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('seed-w-003', 'sample-studio-session-snapshot', 'draft', 1, '2026-07-30', 'instagram',
   '{"zh":"示意：工作室片段","en":"Sample: Studio Session Snapshot"}',
   0, 30, 'file:writing/w-003', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('seed-w-004', 'sample-bilingual-site-on-the-edge', 'draft', 1, '2026-06-12', 'internal',
   '{"zh":"示意：在邊緣網路上做雙語網站","en":"Sample: Building a Bilingual Site on the Edge"}',
   0, 40, 'file:writing/w-004', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z');

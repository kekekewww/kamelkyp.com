-- 0006_cms_base_seed.sql — vocabularies, brand and site settings, services
-- (docs/content-schema.md §3.2, §6.1). Idempotent: deterministic ids and
-- INSERT OR IGNORE; the publish UPDATE only touches unpublished seed rows.
--
-- Brand rule: the only public identity is "Kamel". No personal-name variant
-- appears in any seeded label, title or setting. The one exception is the
-- operational contact address (brand.contactEmail), copied from the site's
-- existing CONTACT_EMAIL so contact keeps working; it is exempt from the brand
-- guard and flagged (contactEmailConfirmedAt: null) until confirmed or changed
-- in Studio → Settings → Brand.
--
-- Copy in brand/site settings is taken verbatim from the redesign files
-- (hero, About, capabilities, service areas, software page, site copy). It is
-- real content, not placeholder text, and is flagged for review
-- (redesignCopyAcknowledgedAt: null).

-- Taxonomy -------------------------------------------------------------------
INSERT OR IGNORE INTO taxonomy_terms
  (id, vocabulary, slug, label_i18n, data_json, sort_order, created_at, updated_at)
VALUES
  ('term-project_category-software', 'project_category', 'software', '{"zh":"軟體","en":"Software"}', '{}', 10, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-project_category-ai', 'project_category', 'ai', '{"zh":"AI","en":"AI"}', '{}', 20, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-project_category-interactive', 'project_category', 'interactive', '{"zh":"互動","en":"Interactive"}', '{}', 30, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-project_category-creative-technology', 'project_category', 'creative-technology', '{"zh":"創意科技","en":"Creative Technology"}', '{}', 40, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-project_category-music', 'project_category', 'music', '{"zh":"音樂","en":"Music"}', '{}', 50, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-project_category-mixing', 'project_category', 'mixing', '{"zh":"混音","en":"Mixing"}', '{}', 60, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-project_category-research', 'project_category', 'research', '{"zh":"研究","en":"Research"}', '{}', 70, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z');

INSERT OR IGNORE INTO taxonomy_terms
  (id, vocabulary, slug, label_i18n, data_json, sort_order, created_at, updated_at)
VALUES
  ('term-recognition_type-award', 'recognition_type', 'award', '{"zh":"獎項","en":"Award"}', '{}', 10, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-recognition_type-publication', 'recognition_type', 'publication', '{"zh":"出版","en":"Publication"}', '{}', 20, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-recognition_type-speaking', 'recognition_type', 'speaking', '{"zh":"演講","en":"Speaking"}', '{}', 30, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-recognition_type-event', 'recognition_type', 'event', '{"zh":"活動","en":"Event"}', '{}', 40, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-recognition_type-competition', 'recognition_type', 'competition', '{"zh":"競賽","en":"Competition"}', '{}', 50, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-recognition_type-research', 'recognition_type', 'research', '{"zh":"研究","en":"Research"}', '{}', 60, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z');

INSERT OR IGNORE INTO taxonomy_terms
  (id, vocabulary, slug, label_i18n, data_json, sort_order, created_at, updated_at)
VALUES
  ('term-service_group-mixing', 'service_group', 'mixing', '{"zh":"混音","en":"Mixing"}', '{"area":"mixing"}', 10, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-service_group-song-transition', 'service_group', 'song-transition', '{"zh":"歌曲銜接","en":"Song Transition"}', '{"area":"song_transition"}', 20, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-service_group-music-production', 'service_group', 'music-production', '{"zh":"音樂製作","en":"Music Production"}', '{"area":"mixing"}', 30, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-service_group-software-development', 'service_group', 'software-development', '{"zh":"軟體開發","en":"Software Development"}', '{"area":"software"}', 40, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-service_group-creative-technology', 'service_group', 'creative-technology', '{"zh":"創意科技","en":"Creative Technology"}', '{"area":"software"}', 50, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('term-service_group-interactive-experiences', 'service_group', 'interactive-experiences', '{"zh":"互動體驗","en":"Interactive Experiences"}', '{"area":"software"}', 60, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z');

-- Brand settings ---------------------------------------------------------------
INSERT OR IGNORE INTO settings (key, data_json, revision, updated_at)
VALUES ('brand', '{
  "schemaVersion": 1,
  "brandName": "Kamel",
  "tagline": {"zh": "聲音、軟體與互動創作", "en": "Sound, Software & Interactive Work"},
  "roles": [
    {"zh": "音樂製作人", "en": "Music Producer"},
    {"zh": "軟體開發者", "en": "Software Developer"},
    {"zh": "創意科技", "en": "Creative Technologist"}
  ],
  "heroStatement": {"zh": "打造系統、聲音與互動體驗。", "en": "Building systems, sound, and interactive experiences."},
  "heroSubtext": {"zh": "", "en": ""},
  "primaryCta": {"label": {"zh": "開始合作", "en": "Start a project"}, "href": "/commission"},
  "secondaryCta": {"label": {"zh": "查看作品", "en": "View work"}, "href": "/works"},
  "shortBio": {
    "zh": "寫程式和混音用的是同一套耳朵：聽出哪裡多了、哪裡不穩，然後把它整理乾淨。",
    "en": "Writing code and mixing use the same ears: hear what is extra or unstable, then make it clean."
  },
  "longBio": {
    "zh": "我做系統，也做聲音。兩者對我來說是同一件事：把複雜的東西整理成可以被感受的結構。",
    "en": "I build systems and I make sound. To me they are the same job: turning complexity into structure you can feel."
  },
  "aboutSections": [
    {
      "key": "what",
      "heading": {"zh": "我做的東西", "en": "What I make"},
      "body": {
        "zh": "軟體系統、AI 與創意科技、互動體驗，以及混音與歌曲銜接。形式不同，方法一樣。",
        "en": "Software systems, AI and creative technology, interactive experiences, and mixing and song transitions. Different forms, one method."
      }
    },
    {
      "key": "think",
      "heading": {"zh": "我怎麼思考", "en": "How I think"},
      "body": {
        "zh": "先看整個系統，再決定細節。一個功能、一軌人聲，都要放回整體裡才知道該怎麼處理。\n\n精準比花俏重要。能被量測、能被重現的決定，才能被信任。\n\n做一版、聽一次、改一次。迭代是方法，不是補救。",
        "en": "I look at the whole system before the details. A feature or a vocal track only makes sense once it sits in the whole.\n\nPrecision matters more than flourish. Decisions that can be measured and repeated are the ones you can trust.\n\nMake a version, listen, revise. Iteration is the method, not the fix."
      }
    },
    {
      "key": "connect",
      "heading": {"zh": "軟體與聲音", "en": "Software and sound"},
      "body": {
        "zh": "混音教會我分層與取捨；寫程式教會我結構與可維護。兩邊互相校正，讓作品既好用也好聽。",
        "en": "Mixing taught me layering and trade-offs; software taught me structure and maintainability. Each keeps the other honest, so the work both functions and sounds right."
      }
    },
    {
      "key": "work",
      "heading": {"zh": "工作方式", "en": "How I work"},
      "body": {
        "zh": "- 先把需求說清楚，再開始做。\n- 早點給看得到、聽得到的版本。\n- 每個決定都說得出理由。\n- 交付之後，東西要能被維護。",
        "en": "- Get the brief clear before starting.\n- Share something you can see or hear early.\n- Every decision has a reason I can explain.\n- What I hand over can be maintained."
      }
    }
  ],
  "capabilities": [
    {
      "key": "software",
      "index": "01",
      "title": {"zh": "軟體系統", "en": "Software Systems"},
      "description": {"zh": "網站、內部工具與可維護的系統。", "en": "Websites, internal tools and maintainable systems."},
      "items": [
        {"zh": "網頁開發", "en": "Web development"},
        {"zh": "內部系統", "en": "Internal systems"},
        {"zh": "客製軟體", "en": "Custom software"}
      ],
      "categoryIds": ["term-project_category-software"]
    },
    {
      "key": "ai-creative",
      "index": "02",
      "title": {"zh": "AI 與創意科技", "en": "AI & Creative Technology"},
      "description": {"zh": "把模型與演算法變成可以使用的工具。", "en": "Turning models and algorithms into usable tools."},
      "items": [
        {"zh": "AI 整合", "en": "AI integrations"},
        {"zh": "生成式系統", "en": "Generative systems"},
        {"zh": "研究原型", "en": "Research prototypes"}
      ],
      "categoryIds": ["term-project_category-ai", "term-project_category-research"]
    },
    {
      "key": "interactive",
      "index": "03",
      "title": {"zh": "互動體驗", "en": "Interactive Experiences"},
      "description": {"zh": "回應人、聲音與空間的作品。", "en": "Work that responds to people, sound and space."},
      "items": [
        {"zh": "互動裝置", "en": "Interactive installations"},
        {"zh": "原型", "en": "Prototypes"},
        {"zh": "創意開發", "en": "Creative development"}
      ],
      "categoryIds": ["term-project_category-interactive"]
    },
    {
      "key": "sound",
      "index": "04",
      "title": {"zh": "聲音", "en": "Sound"},
      "description": {"zh": "混音、製作與歌曲銜接。", "en": "Mixing, production and song transitions."},
      "items": [
        {"zh": "混音與母帶", "en": "Mixing & mastering"},
        {"zh": "人聲製作", "en": "Vocal production"},
        {"zh": "歌曲銜接", "en": "Song transitions"}
      ],
      "categoryIds": ["term-project_category-music", "term-project_category-mixing"]
    }
  ],
  "locationDisplay": {"zh": "臺灣 / 遠端合作", "en": "Taiwan / Remote"},
  "contactEmail": "kevinyaungputra@gmail.com",
  "contactEmailConfirmedAt": null,
  "redesignCopyAcknowledgedAt": null,
  "portraitId": null,
  "logoId": null,
  "faviconId": null,
  "brandAssetIds": []
}', 0, '2026-09-24T00:00:00Z');

-- Site settings ----------------------------------------------------------------
INSERT OR IGNORE INTO settings (key, data_json, revision, updated_at)
VALUES ('site', '{
  "schemaVersion": 1,
  "siteTitle": {"zh": "Kamel — 聲音、軟體與互動創作", "en": "Kamel — Sound, Software & Interactive Work"},
  "siteDescription": {
    "zh": "Kamel 的作品與服務：混音、歌曲銜接、軟體開發與互動體驗。",
    "en": "Kamel''s work and services: mixing, song transitions, software development and interactive experiences."
  },
  "seoDescription": {
    "zh": "Kamel 的作品與服務：混音、歌曲銜接、軟體開發與互動體驗。",
    "en": "Kamel''s work and services: mixing, song transitions, software development and interactive experiences."
  },
  "ogImageId": null,
  "defaultSocialImageId": null,
  "navigation": {
    "items": [
      {"key": "work", "visible": true},
      {"key": "services", "visible": true},
      {"key": "about", "visible": true},
      {"key": "writing", "visible": true}
    ]
  },
  "footerMessage": {
    "zh": "混音、歌曲銜接、軟體與互動專案——先說說你想做的東西。",
    "en": "Mixing, song transitions, software and interactive work — tell me what you want to make."
  },
  "copyright": {"zh": "© {year} {brand}", "en": "© {year} {brand}"},
  "availability": {"status": "unspecified", "message": {"zh": "", "en": ""}},
  "homepage": {
    "sections": {
      "showreel": true,
      "selectedWork": true,
      "capabilities": true,
      "recognition": true,
      "services": true,
      "pricing": true,
      "about": true,
      "writing": true,
      "contact": true
    },
    "featuredProjectCount": 4,
    "writingCount": 3,
    "recognitionCount": 3,
    "contactBandBody": {
      "zh": "混音與歌曲銜接可線上委託；軟體與互動專案以 Email 洽談。",
      "en": "Mixing and song transitions can be commissioned online; software and interactive projects are handled by email."
    }
  },
  "serviceAreas": [
    {
      "key": "mixing",
      "name": {"zh": "混音", "en": "Mixing"},
      "summary": {"zh": "完整歌曲或 Vocal 混音，含母帶。", "en": "Full-song or vocal mixing, mastering included."},
      "linkLabel": {"zh": "查看混音服務", "en": "View mixing"}
    },
    {
      "key": "song_transition",
      "name": {"zh": "歌曲銜接", "en": "Song Transition"},
      "summary": {"zh": "舞蹈、活動與表演用的歌曲銜接與剪輯。", "en": "Transitions and edits for dance, events and performance."},
      "linkLabel": {"zh": "查看歌曲銜接服務", "en": "View song transition"}
    },
    {
      "key": "software",
      "name": {"zh": "軟體與互動", "en": "Software & Interactive"},
      "summary": {"zh": "網站、原型、AI 整合、互動裝置。", "en": "Websites, prototypes, AI integrations, interactive installations."},
      "linkLabel": {"zh": "查看軟體與互動服務", "en": "View software & interactive"}
    }
  ],
  "servicesPage": {
    "process": [
      {"title": {"zh": "需求", "en": "Brief"}},
      {"title": {"zh": "報價與確認", "en": "Quote & confirm"}},
      {"title": {"zh": "製作", "en": "Production"}},
      {"title": {"zh": "交付與修改", "en": "Delivery & revisions"}}
    ]
  },
  "softwarePage": {
    "engagementModels": [
      {
        "key": "project-based",
        "label": "PROJECT BASED",
        "title": {"zh": "專案制", "en": "Project based"},
        "description": {"zh": "範圍明確的案子，依需求與時程一次報價。", "en": "Defined scope, quoted once against requirements and timeline."},
        "priceNote": {"zh": "依專案報價", "en": "Contact for quote"}
      },
      {
        "key": "custom-quote",
        "label": "CUSTOM QUOTE",
        "title": {"zh": "客製報價", "en": "Custom quote"},
        "description": {"zh": "範圍仍在探索的案子，先討論再估價。", "en": "Scope still forming; we talk first, then estimate."},
        "priceNote": {"zh": "依專案報價", "en": "Contact for quote"}
      }
    ],
    "process": [
      {"title": {"zh": "對話", "en": "Conversation"}},
      {"title": {"zh": "範圍與報價", "en": "Scope & quote"}},
      {"title": {"zh": "原型", "en": "Prototype"}},
      {"title": {"zh": "開發", "en": "Build"}},
      {"title": {"zh": "交付", "en": "Handover"}}
    ],
    "inquiry": {
      "subject": {"zh": "[軟體與互動] 專案洽詢", "en": "[Software & Interactive] Project inquiry"},
      "include": [
        {"zh": "專案類型", "en": "Project type"},
        {"zh": "想解決的問題", "en": "The problem to solve"},
        {"zh": "期望時程", "en": "Timeline"},
        {"zh": "參考資料或連結", "en": "References or links"},
        {"zh": "預算範圍（可選）", "en": "Budget range (optional)"}
      ]
    }
  },
  "contactBand": {
    "default": {"zh": "有想做的作品嗎？", "en": "Have a project in mind?"},
    "project": {"zh": "想做類似的東西？", "en": "Want something like this?"},
    "work": {"zh": "沒看到類似的案子？直接聊聊。", "en": "Don''t see something similar? Let''s talk."}
  }
}', 0, '2026-09-24T00:00:00Z');

-- Commission-linked services --------------------------------------------------
-- Marketing content from SERVICE_CATALOG. No price columns: the displayed
-- price is always the active price_versions rule (the one source of truth the
-- commission wizard locks into a case). A table CHECK keeps these rows at
-- price_mode 'starting_from' with price_amount and currency NULL.
INSERT OR IGNORE INTO services (
  id, slug, status, group_term_id, commission_service_id,
  name_i18n, short_description_i18n, description_i18n, price_mode,
  turnaround_i18n, deliverables_json, sort_order, legacy_source, created_at, updated_at
) VALUES (
  'svc-full_mix', 'full-mix', 'draft', 'term-service_group-mixing', 'full_mix',
  '{"zh":"完整歌曲混音","en":"Full Song Mixing"}',
  '{"zh":"包含人聲、各式樂器、完整混音與母帶。","en":"Full vocal, instrument, mix and master production."}',
  '{"zh":"包含人聲、各式樂器、完整混音與母帶。","en":"Full vocal, instrument, mix and master production."}',
  'starting_from',
  '{"zh":"7–14 個工作日","en":"7–14 business days"}',
  '[{"zh":"24-bit / 48 kHz WAV Final Master","en":"24-bit / 48 kHz WAV Final Master"},{"zh":"Vocal Stem","en":"Vocal Stem"},{"zh":"Instrumental Mix Stem","en":"Instrumental Mix Stem"}]',
  10, 'catalog:full_mix', '2026-08-10T00:00:00Z', '2026-09-24T00:00:00Z'
);

INSERT OR IGNORE INTO services (
  id, slug, status, group_term_id, commission_service_id,
  name_i18n, short_description_i18n, description_i18n, price_mode,
  turnaround_i18n, deliverables_json, sort_order, legacy_source, created_at, updated_at
) VALUES (
  'svc-vocal_mix', 'vocal-mix', 'draft', 'term-service_group-mixing', 'vocal_mix',
  '{"zh":"Vocal 混音","en":"Vocal Mixing"}',
  '{"zh":"人聲、和音、修音、對拍、效果與母帶。","en":"Vocals, harmonies, tuning, timing, effects and mastering."}',
  '{"zh":"人聲、和音、修音、對拍、效果與母帶。","en":"Vocals, harmonies, tuning, timing, effects and mastering."}',
  'starting_from',
  '{"zh":"5–7 個工作日","en":"5–7 business days"}',
  '[{"zh":"24-bit / 48 kHz WAV Final Master","en":"24-bit / 48 kHz WAV Final Master"},{"zh":"Vocal Stem","en":"Vocal Stem"},{"zh":"Instrumental Mix Stem","en":"Instrumental Mix Stem"}]',
  20, 'catalog:vocal_mix', '2026-08-10T00:00:00Z', '2026-09-24T00:00:00Z'
);

INSERT OR IGNORE INTO services (
  id, slug, status, group_term_id, commission_service_id,
  name_i18n, short_description_i18n, description_i18n, price_mode,
  turnaround_i18n, deliverables_json, sort_order, legacy_source, created_at, updated_at
) VALUES (
  'svc-simple_transition', 'simple-transition', 'draft', 'term-service_group-song-transition', 'simple_transition',
  '{"zh":"單純歌曲銜接","en":"Simple Song Transition"}',
  '{"zh":"1–5 首基本銜接，不包含歌曲結構編輯。","en":"Basic transitions for 1–5 songs without structural editing."}',
  '{"zh":"1–5 首基本銜接，不包含歌曲結構編輯。","en":"Basic transitions for 1–5 songs without structural editing."}',
  'starting_from',
  '{"zh":"3–5 個工作日","en":"3–5 business days"}',
  '[{"zh":"24-bit / 48 kHz WAV","en":"24-bit / 48 kHz WAV"},{"zh":"MP3 與 AAC","en":"MP3 and AAC"}]',
  30, 'catalog:simple_transition', '2026-08-10T00:00:00Z', '2026-09-24T00:00:00Z'
);

INSERT OR IGNORE INTO services (
  id, slug, status, group_term_id, commission_service_id,
  name_i18n, short_description_i18n, description_i18n, price_mode,
  turnaround_i18n, deliverables_json, sort_order, legacy_source, created_at, updated_at
) VALUES (
  'svc-edit_transition', 'edit-transition', 'draft', 'term-service_group-song-transition', 'edit_transition',
  '{"zh":"編輯／剪輯歌曲銜接","en":"Edited Song Transition"}',
  '{"zh":"包含刪減、重排、速度／音高、音效、平衡與重新母帶。","en":"Cuts, restructuring, tempo or pitch, effects, balance and remastering."}',
  '{"zh":"包含刪減、重排、速度／音高、音效、平衡與重新母帶。","en":"Cuts, restructuring, tempo or pitch, effects, balance and remastering."}',
  'starting_from',
  '{"zh":"7–14 個工作日","en":"7–14 business days"}',
  '[{"zh":"24-bit / 48 kHz WAV","en":"24-bit / 48 kHz WAV"},{"zh":"MP3 與 AAC","en":"MP3 and AAC"}]',
  40, 'catalog:edit_transition', '2026-08-10T00:00:00Z', '2026-09-24T00:00:00Z'
);

-- Software offerings: custom quote, never a number.
INSERT OR IGNORE INTO services (
  id, slug, status, group_term_id, name_i18n, description_i18n, price_mode,
  inquiry_subject_i18n, sort_order, legacy_source, created_at, updated_at
) VALUES
  ('svc-software-web', 'software-web', 'draft', 'term-service_group-software-development',
   '{"zh":"網頁開發","en":"Web development"}',
   '{"zh":"雙語網站、作品集與內容系統，從設計到上線。","en":"Bilingual sites, portfolios and content systems, from design to launch."}',
   'custom_quote', '{"zh":"[軟體與互動] 專案洽詢","en":"[Software & Interactive] Project inquiry"}',
   10, 'software-services:web', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('svc-software-prototypes', 'software-prototypes', 'draft', 'term-service_group-software-development',
   '{"zh":"原型開發","en":"Prototypes"}',
   '{"zh":"把想法快速做成可以操作、可以測試的版本。","en":"Turning an idea into something you can click through and test."}',
   'custom_quote', '{"zh":"[軟體與互動] 專案洽詢","en":"[Software & Interactive] Project inquiry"}',
   20, 'software-services:prototypes', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('svc-software-ai', 'software-ai', 'draft', 'term-service_group-software-development',
   '{"zh":"AI 整合","en":"AI integrations"}',
   '{"zh":"把語言模型與其他模型接進既有流程或產品。","en":"Connecting language models and other models to existing workflows or products."}',
   'custom_quote', '{"zh":"[軟體與互動] 專案洽詢","en":"[Software & Interactive] Project inquiry"}',
   30, 'software-services:ai', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('svc-software-internal', 'software-internal', 'draft', 'term-service_group-software-development',
   '{"zh":"內部系統","en":"Internal systems"}',
   '{"zh":"取代試算表與手動流程的管理工具。","en":"Management tools that replace spreadsheets and manual steps."}',
   'custom_quote', '{"zh":"[軟體與互動] 專案洽詢","en":"[Software & Interactive] Project inquiry"}',
   40, 'software-services:internal', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('svc-software-creative-tech', 'software-creative-tech', 'draft', 'term-service_group-creative-technology',
   '{"zh":"創意科技","en":"Creative technology"}',
   '{"zh":"結合聲音、畫面與程式的實驗與作品。","en":"Experiments and pieces that combine sound, image and code."}',
   'custom_quote', '{"zh":"[軟體與互動] 專案洽詢","en":"[Software & Interactive] Project inquiry"}',
   50, 'software-services:creative-tech', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('svc-software-installations', 'software-installations', 'draft', 'term-service_group-interactive-experiences',
   '{"zh":"互動裝置","en":"Interactive installations"}',
   '{"zh":"回應觀眾動作與聲音的展演與空間作品。","en":"Exhibition and space pieces that respond to movement and sound."}',
   'custom_quote', '{"zh":"[軟體與互動] 專案洽詢","en":"[Software & Interactive] Project inquiry"}',
   60, 'software-services:installations', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z'),
  ('svc-software-custom', 'software-custom', 'draft', 'term-service_group-software-development',
   '{"zh":"客製軟體","en":"Custom software"}',
   '{"zh":"為特定需求打造、可以長期維護的軟體。","en":"Software built for a specific need and made to be maintained."}',
   'custom_quote', '{"zh":"[軟體與互動] 專案洽詢","en":"[Software & Interactive] Project inquiry"}',
   70, 'software-services:custom', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z');

-- Publish every seeded service through the snapshot view (the one serializer).
UPDATE services SET
  status = 'published',
  published_json = (SELECT s.snapshot FROM service_snapshots s WHERE s.id = services.id),
  published_slug = slug,
  published_revision = revision,
  published_at = '2026-09-24T00:00:00Z',
  first_published_at = '2026-09-24T00:00:00Z'
WHERE (legacy_source GLOB 'catalog:*' OR legacy_source GLOB 'software-services:*')
  AND status = 'draft' AND published_json IS NULL;

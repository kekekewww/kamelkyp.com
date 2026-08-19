# Kamel Google Form and Gmail relay

This directory is the cloud-side relay for commission submissions. The Worker sends a signed payload; Apps Script writes one Google Form response and sends one administrator email, even when the same Case ID is retried.

## Google setup

1. In Kamel's Google account, create a dedicated Google Form for commission intake.
2. Add these 16 items. Use short-answer items for `case_id`, `submitted_at`, `locale`, `service`, `locked_price`, `display_name`, and `email`; use paragraph items for the others: `contacts`, `age_and_guardian`, `student_and_proof`, `project_links`, `purpose_and_date`, `credit_and_portfolio`, `options`, `service_details`, and `terms`.
3. Copy each numeric Google Form Item ID and link the Form to a Google Sheet.
4. Open Apps Script for the owner account and paste `Code.gs`; copy `appsscript.json` into the project manifest.
5. In **Project Settings → Script Properties**, set `FORM_ID`, `ADMIN_EMAIL`, `HMAC_SECRET`, and `FORM_ITEM_MAP`. `FORM_ITEM_MAP` is a JSON object mapping all 16 keys above to their numeric item IDs. Use a randomly generated HMAC value of at least 32 characters.
6. Deploy as a **Web app**, execute as the owner, and select the invocation policy intended for the Worker relay.
7. Copy the Web app `/exec` URL to the Cloudflare Worker secret `APPS_SCRIPT_URL`.
8. Copy the same HMAC value to the Cloudflare Worker secret `APPS_SCRIPT_HMAC_SECRET`.
9. Send one signed Preview submission and confirm exactly one Form row and one email to the administrator.
10. Never commit or paste the HMAC secret, Form ID, administrator address, item map, or deployment URL into GitHub.

Use a separate Preview Form/Sheet and test recipient. Production data must never be used by Preview.

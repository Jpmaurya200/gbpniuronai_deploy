# niuronai — Production SaaS Roadmap (PRD)

AI-powered Google Business Profile & Local SEO SaaS. Target: India-first (INR/Razorpay), global-ready (Stripe). Stack: Next.js 15 (App Router) + MongoDB, Gemini via Emergent LLM gateway.

## WHERE THE PREVIOUS BUILD STOPPED (resume point)
The **SaaS BACKEND layer (Milestone 1) is fully built & tested** (auth, multi-tenant, entitlements/usage, billing stub, coupons, admin API, notifications API). The build stopped **before any SaaS FRONTEND was created** (credits ran out). Also the `.env` was lost and has been recreated.

### Already DONE (backend, verified by testing agent)
- Auth: register/login/logout/me — email+password, JWT httpOnly cookie `nai_session` + Bearer. Multi-tenant org scoping, RBAC (owner/admin/super_admin).
- Entitlements/usage engine: DB-driven plans (Free/Starter/Growth/Pro), limit keys + feature flags, 402 limit_reached / feature_locked enforcement. `/api/me/entitlements`.
- Billing: `/api/billing` coupon/validate, checkout, confirm (idempotent), cancel, invoices, webhook (stub). Sequential invoices NAI-YYYY-#####, GST from settings. Razorpay wired but STUB until keys.
- Coupons: advanced (percent/fixed, startsAt/expiresAt, minAmount, applicablePlanIds, maxRedemptions, perUserLimit, firstTimeOnly, isActive).
- Admin API: `/api/admin/*` metrics, users (patch status/role/plan), plans CRUD+duplicate, coupons CRUD, subscriptions, settings. RBAC 403.
- Notifications API: GET `/api/notifications`, POST `/api/notifications/read`. In-app notify() used across flows. Email = STUB (lib/mailer.js).
- Core product backend: campaigns, public review page + AI drafts, reviews inbox + AI replies + publish, automated replies engine, local SEO audit.

### Frontend pages that EXIST
`/` (landing, pricing already dynamic from /api/plans), `/dashboard`, `/reviews`, `/audit`, `/r/[slug]` (public). NONE handle auth yet.

### Frontend MISSING (the resume work)
`/login`, `/register`, `/billing`, `/account`, `/admin`, and auth-guard/user-menu wiring into existing pages.

## ROADMAP (logical order)

### PHASE 1 — SaaS Frontend (NO external keys needed) ← START HERE
Unlocks the fully-built backend. Sub-steps in order:
1. **Auth UI + guard**: `/login`, `/register` (email+password; "Continue with Google" button visible, wired in Phase 3). Shared auth context, protect /dashboard /reviews /audit (redirect to /login), header user menu + logout, show plan badge.
2. **User billing & account**: `/billing` (current plan, usage meters + remaining, plan cards monthly/yearly toggle, coupon apply, checkout→confirm stub, invoices list/download, upgrade/downgrade/cancel/renew) + `/account` (profile, org, billing profile). Wire 402 responses across dashboard/reviews/audit into upgrade prompts → /billing.
3. **Admin panel**: `/admin` (super_admin/admin only) — metrics dashboard (users, MRR/ARR, paid, plan distribution, coupons, campaigns), users mgmt, plans CRUD (create/edit/duplicate/activate/limits+features editor), coupons CRUD (all fields), subscriptions, settings (tax, announcement, trial days).
4. **Landing polish**: strengthen conversion sections (hero, benefits, product demo/screenshots, testimonials, FAQ, CTAs, trust). Pricing already dynamic.
5. **In-app notifications UI**: bell + dropdown consuming notifications API.

### PHASE 2 — Real payments + webhooks (keys: Razorpay, Stripe)
STATUS: Razorpay DONE (TEST mode) — real order creation + Checkout + signature verify (validatePaymentVerification returns boolean, checked) + webhook (raw-body validateWebhookSignature + idempotency + fulfillOrder). TEST keys in /app/.env. Webhook secret NOT set yet (webhook returns received/ignored until RAZORPAY_WEBHOOK_SECRET added). Backend verified 12/12. Frontend /billing opens Razorpay Checkout for live orders. TODO: set RAZORPAY_WEBHOOK_SECRET (create webhook in dashboard) for auto event sync; go LIVE keys after Razorpay approval. Stripe (international) SKIPPED for now per user.

### PHASE 3 — Google auth + GBP integration (keys: Google OAuth client; GBP API needs Google approval)
"Continue with Google" OAuth login; connect Google Business Profile via OAuth; multi-location per plan limit; secure token storage/refresh; architecture for future GBP features (posts, Q&A, insights).

### PHASE 4 — Feature expansion + hardening
Local rank tracking / keywords / grid scans / reports (new metered features), email notifications (provider key), rate limiting + webhook verification + structured logging + input validation, i18n + multi-currency scaffolding, churn/feature-usage analytics.

## KEYS TO COLLECT FROM USER (for later phases; Phase 1 needs none)
- Razorpay: RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET + webhook secret
- Stripe: STRIPE_SECRET_KEY + publishable + webhook secret
- Google OAuth: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (+ GBP API access approval)
- Email provider (e.g., SendGrid/Resend) API key

## Super admin: admin@niuron.ai / Admin@12345

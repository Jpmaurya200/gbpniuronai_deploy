// Centralized plan catalog. These are only DEFAULTS used to seed the DB the
// first time. After seeding, everything is admin-editable in the DB — nothing
// about pricing/limits/features is hardcoded into feature logic.

export const LIMIT_KEYS = [
  'locations',
  'team_seats',
  'campaigns',
  'monthly_ai_review_drafts',
  'monthly_ai_replies',
  'monthly_audits',
  'rank_keywords',
  'monthly_reports',
]

export const FEATURE_KEYS = [
  'automated_replies',
  'custom_qr_designer',
  'rank_tracking',
  'white_label',
  'api_access',
  'priority_support',
]

export const LIMIT_LABELS = {
  locations: 'Google Business locations',
  team_seats: 'Team seats',
  campaigns: 'Review campaigns',
  monthly_ai_review_drafts: 'AI review drafts / month',
  monthly_ai_replies: 'AI review replies / month',
  monthly_audits: 'Local SEO audits / month',
  rank_keywords: 'Rank-tracked keywords',
  monthly_reports: 'Reports / month',
}

export const FEATURE_LABELS = {
  automated_replies: 'Automated AI replies',
  custom_qr_designer: 'Custom QR poster designer',
  rank_tracking: 'Local rank tracking',
  white_label: 'White-label branding',
  api_access: 'API access',
  priority_support: 'Priority support',
}

// -1 means unlimited
export const DEFAULT_PLANS = [
  {
    name: 'Free', slug: 'free', description: 'Explore niuronai with the essentials.',
    prices: { INR: { monthly: 0, yearly: 0 } },
    trialDays: 0, isActive: true, isPublic: true, sortOrder: 0,
    limits: { locations: 1, team_seats: 1, campaigns: 1, monthly_ai_review_drafts: 25, monthly_ai_replies: 10, monthly_audits: 2, rank_keywords: 0, monthly_reports: 1 },
    features: { automated_replies: false, custom_qr_designer: true, rank_tracking: false, white_label: false, api_access: false, priority_support: false },
  },
  {
    name: 'Starter', slug: 'starter', description: 'For a single location getting serious about reviews.',
    prices: { INR: { monthly: 999, yearly: 9990 } },
    trialDays: 14, isActive: true, isPublic: true, sortOrder: 1,
    limits: { locations: 1, team_seats: 3, campaigns: 5, monthly_ai_review_drafts: 500, monthly_ai_replies: 300, monthly_audits: 15, rank_keywords: 0, monthly_reports: 5 },
    features: { automated_replies: true, custom_qr_designer: true, rank_tracking: false, white_label: false, api_access: false, priority_support: false },
  },
  {
    name: 'Growth', slug: 'growth', description: 'For multi-location businesses and agencies.',
    prices: { INR: { monthly: 2499, yearly: 24990 } },
    trialDays: 14, isActive: true, isPublic: true, sortOrder: 2, popular: true,
    limits: { locations: 3, team_seats: 10, campaigns: -1, monthly_ai_review_drafts: 2500, monthly_ai_replies: 1500, monthly_audits: 60, rank_keywords: 50, monthly_reports: 25 },
    features: { automated_replies: true, custom_qr_designer: true, rank_tracking: true, white_label: false, api_access: false, priority_support: true },
  },
  {
    name: 'Pro', slug: 'pro', description: 'For agencies scaling many locations.',
    prices: { INR: { monthly: 4999, yearly: 49990 } },
    trialDays: 14, isActive: true, isPublic: true, sortOrder: 3,
    limits: { locations: 10, team_seats: 25, campaigns: -1, monthly_ai_review_drafts: -1, monthly_ai_replies: -1, monthly_audits: -1, rank_keywords: 250, monthly_reports: -1 },
    features: { automated_replies: true, custom_qr_designer: true, rank_tracking: true, white_label: true, api_access: true, priority_support: true },
  },
]

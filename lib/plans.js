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

// Addon pricing (per additional location+campaign)
export const ADDON_PRICE = 150 // INR per extra location (includes 1 campaign)

// Duration map for interval calculation
export const INTERVAL_DAYS = {
  '1month': 30,
  '3month': 90,
  '6month': 180,
  '12month': 365,
  'trial': 14,
}

// Interval labels for display
export const INTERVAL_LABELS = {
  '1month': '1 Month',
  '3month': '3 Months',
  '6month': '6 Months',
  '12month': '12 Months',
  'trial': '14-Day Trial',
}

// -1 means unlimited
const UNLIMITED_LIMITS = {
  locations: 1,
  team_seats: -1,
  campaigns: 1,
  monthly_ai_review_drafts: -1,
  monthly_ai_replies: -1,
  monthly_audits: -1,
  rank_keywords: -1,
  monthly_reports: -1,
}

const ALL_FEATURES = {
  automated_replies: true,
  custom_qr_designer: true,
  rank_tracking: true,
  white_label: true,
  api_access: true,
  priority_support: true,
}

export const DEFAULT_PLANS = [
  {
    name: 'Trial', slug: 'trial',
    description: 'Experience niuronai for 14 days at just ₹199.',
    prices: { INR: { trial: 199, '1month': 199, '3month': 199, '6month': 199, '12month': 199 } },
    originalPrices: { INR: { trial: 199 } },
    trialDays: 14, isActive: true, isPublic: true, sortOrder: 0,
    isTrial: true, firstTimeOnly: true,
    limits: { ...UNLIMITED_LIMITS },
    features: { ...ALL_FEATURES },
  },
  {
    name: '1 Month', slug: '1month',
    description: 'Full access to all features, billed monthly.',
    prices: { INR: { '1month': 449 } },
    originalPrices: { INR: { '1month': 1349 } },
    trialDays: 0, isActive: true, isPublic: true, sortOrder: 1,
    limits: { ...UNLIMITED_LIMITS },
    features: { ...ALL_FEATURES },
  },
  {
    name: '3 Months', slug: '3month',
    description: 'Best value — save 75% with quarterly billing.',
    prices: { INR: { '3month': 999 } },
    originalPrices: { INR: { '3month': 4047 } },
    trialDays: 0, isActive: true, isPublic: true, sortOrder: 2,
    popular: true,
    limits: { ...UNLIMITED_LIMITS },
    features: { ...ALL_FEATURES },
  },
  {
    name: '6 Months', slug: '6month',
    description: 'Half-yearly plan with massive savings.',
    prices: { INR: { '6month': 1799 } },
    originalPrices: { INR: { '6month': 8094 } },
    trialDays: 0, isActive: true, isPublic: true, sortOrder: 3,
    limits: { ...UNLIMITED_LIMITS },
    features: { ...ALL_FEATURES },
  },
  {
    name: '12 Months', slug: '12month',
    description: 'Annual plan — maximum savings for committed growth.',
    prices: { INR: { '12month': 2999 } },
    originalPrices: { INR: { '12month': 16188 } },
    trialDays: 0, isActive: true, isPublic: true, sortOrder: 4,
    limits: { ...UNLIMITED_LIMITS },
    features: { ...ALL_FEATURES },
  },
]

/**
 * Canonical English category taxonomy, seeded per household on
 * creation (see supabase/seed.sql, which mirrors this list). Kept
 * here as the single source of truth so the web app can reference
 * icons/colors without a DB round trip, and so the SQL seed and the
 * app never drift apart.
 *
 * Israel-aware where it matters (Arnona, Bituach Leumi, Kupat Holim)
 * but every label is plain English per the UI-language requirement.
 */
export interface CategorySeed {
  slug: string;
  name: string;
  parentSlug: string | null;
  isIncome: boolean;
  icon: string;
  sort: number;
}

export const CATEGORY_SEED: CategorySeed[] = [
  // Income
  { slug: "income", name: "Income", parentSlug: null, isIncome: true, icon: "banknote", sort: 0 },
  { slug: "income-salary", name: "Salary", parentSlug: "income", isIncome: true, icon: "wallet", sort: 1 },
  { slug: "income-other", name: "Other Income", parentSlug: "income", isIncome: true, icon: "plus-circle", sort: 2 },

  // Housing
  { slug: "housing", name: "Housing", parentSlug: null, isIncome: false, icon: "home", sort: 10 },
  { slug: "housing-rent-mortgage", name: "Rent / Mortgage", parentSlug: "housing", isIncome: false, icon: "key", sort: 11 },
  { slug: "housing-arnona", name: "Arnona (Municipal Tax)", parentSlug: "housing", isIncome: false, icon: "landmark", sort: 12 },
  { slug: "housing-vaad-bayit", name: "Vaad Bayit (Building Fees)", parentSlug: "housing", isIncome: false, icon: "building", sort: 13 },
  { slug: "housing-utilities", name: "Utilities (Electric / Water / Gas)", parentSlug: "housing", isIncome: false, icon: "plug", sort: 14 },
  { slug: "housing-maintenance", name: "Home Maintenance", parentSlug: "housing", isIncome: false, icon: "hammer", sort: 15 },

  // Food
  { slug: "food", name: "Food", parentSlug: null, isIncome: false, icon: "utensils", sort: 20 },
  { slug: "food-groceries", name: "Groceries", parentSlug: "food", isIncome: false, icon: "shopping-cart", sort: 21 },
  { slug: "food-dining", name: "Restaurants & Dining", parentSlug: "food", isIncome: false, icon: "coffee", sort: 22 },
  { slug: "food-delivery", name: "Food Delivery", parentSlug: "food", isIncome: false, icon: "bike", sort: 23 },

  // Transportation
  { slug: "transport", name: "Transportation", parentSlug: null, isIncome: false, icon: "car", sort: 30 },
  { slug: "transport-fuel", name: "Fuel", parentSlug: "transport", isIncome: false, icon: "fuel", sort: 31 },
  { slug: "transport-public", name: "Public Transit", parentSlug: "transport", isIncome: false, icon: "bus", sort: 32 },
  { slug: "transport-parking-tolls", name: "Parking & Tolls", parentSlug: "transport", isIncome: false, icon: "parking-circle", sort: 33 },
  { slug: "transport-maintenance", name: "Car Maintenance & Insurance", parentSlug: "transport", isIncome: false, icon: "wrench", sort: 34 },
  { slug: "transport-rideshare", name: "Rideshare & Taxis", parentSlug: "transport", isIncome: false, icon: "car-taxi-front", sort: 35 },

  // Health
  { slug: "health", name: "Health", parentSlug: null, isIncome: false, icon: "heart-pulse", sort: 40 },
  { slug: "health-kupat-holim", name: "Kupat Holim (Health Fund)", parentSlug: "health", isIncome: false, icon: "stethoscope", sort: 41 },
  { slug: "health-pharmacy", name: "Pharmacy", parentSlug: "health", isIncome: false, icon: "pill", sort: 42 },
  { slug: "health-dental", name: "Dental & Vision", parentSlug: "health", isIncome: false, icon: "smile", sort: 43 },
  { slug: "health-fitness", name: "Fitness & Wellness", parentSlug: "health", isIncome: false, icon: "dumbbell", sort: 44 },

  // Shopping
  { slug: "shopping", name: "Shopping", parentSlug: null, isIncome: false, icon: "shopping-bag", sort: 50 },
  { slug: "shopping-clothing", name: "Clothing", parentSlug: "shopping", isIncome: false, icon: "shirt", sort: 51 },
  { slug: "shopping-electronics", name: "Electronics", parentSlug: "shopping", isIncome: false, icon: "smartphone", sort: 52 },
  { slug: "shopping-home-goods", name: "Home Goods", parentSlug: "shopping", isIncome: false, icon: "sofa", sort: 53 },
  { slug: "shopping-general", name: "General Shopping", parentSlug: "shopping", isIncome: false, icon: "package", sort: 54 },

  // Subscriptions & bills
  { slug: "bills", name: "Bills & Subscriptions", parentSlug: null, isIncome: false, icon: "receipt", sort: 60 },
  { slug: "bills-phone-internet", name: "Phone & Internet", parentSlug: "bills", isIncome: false, icon: "wifi", sort: 61 },
  { slug: "bills-streaming", name: "Streaming & Subscriptions", parentSlug: "bills", isIncome: false, icon: "tv", sort: 62 },
  { slug: "bills-insurance", name: "Insurance", parentSlug: "bills", isIncome: false, icon: "shield", sort: 63 },

  // Family & personal
  { slug: "family", name: "Family & Personal", parentSlug: null, isIncome: false, icon: "users", sort: 70 },
  { slug: "family-childcare", name: "Childcare & Education", parentSlug: "family", isIncome: false, icon: "graduation-cap", sort: 71 },
  { slug: "family-gifts", name: "Gifts & Donations", parentSlug: "family", isIncome: false, icon: "gift", sort: 72 },
  { slug: "family-personal-care", name: "Personal Care", parentSlug: "family", isIncome: false, icon: "sparkles", sort: 73 },

  // Leisure
  { slug: "leisure", name: "Leisure & Travel", parentSlug: null, isIncome: false, icon: "plane", sort: 80 },
  { slug: "leisure-entertainment", name: "Entertainment", parentSlug: "leisure", isIncome: false, icon: "clapperboard", sort: 81 },
  { slug: "leisure-travel", name: "Travel & Vacations", parentSlug: "leisure", isIncome: false, icon: "luggage", sort: 82 },
  { slug: "leisure-hobbies", name: "Hobbies", parentSlug: "leisure", isIncome: false, icon: "palette", sort: 83 },

  // Finance
  { slug: "finance", name: "Finance", parentSlug: null, isIncome: false, icon: "piggy-bank", sort: 90 },
  { slug: "finance-savings-investing", name: "Savings & Investing", parentSlug: "finance", isIncome: false, icon: "trending-up", sort: 91 },
  { slug: "finance-fees", name: "Bank & Card Fees", parentSlug: "finance", isIncome: false, icon: "circle-dollar-sign", sort: 92 },
  { slug: "finance-taxes", name: "Taxes & Bituach Leumi", parentSlug: "finance", isIncome: false, icon: "scale", sort: 93 },

  // Transfers (internal, excluded from spend totals by default via rules)
  { slug: "transfers", name: "Transfers", parentSlug: null, isIncome: false, icon: "arrow-left-right", sort: 100 },
  { slug: "transfers-credit-card-payment", name: "Credit Card Payment", parentSlug: "transfers", isIncome: false, icon: "credit-card", sort: 101 },
  { slug: "transfers-internal", name: "Internal Transfer", parentSlug: "transfers", isIncome: false, icon: "repeat", sort: 102 },

  // Catch-all
  { slug: "uncategorized", name: "Uncategorized", parentSlug: null, isIncome: false, icon: "help-circle", sort: 999 },
];

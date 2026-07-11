-- Local/dev seed data. This file mirrors packages/shared/src/categories.ts
-- (the canonical category list) so the SQL seed and the app's icon/color
-- lookups never drift apart. If you change one, change the other.
--
-- IMPORTANT: fill in both real household emails in the allowlist insert
-- below before this is ever run against a project with signups enabled
-- for real users -- the placeholder is a fake address on purpose.

insert into household_signup_allowlist (email) values
  ('elior015@gmail.com'),
  ('REPLACE_WITH_WIFES_EMAIL@example.com')
on conflict (email) do nothing;

insert into households (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Our Household')
on conflict (id) do nothing;

-- Category tree: two-level, English-only labels, Israel-aware where
-- it matters. Parents are inserted first so children can resolve
-- parent_id by slug within the same statement batch.
with household as (
  select '00000000-0000-0000-0000-000000000001'::uuid as id
),
parents as (
  insert into categories (household_id, slug, name, parent_id, is_income, icon, sort)
  select household.id, v.slug, v.name, null, v.is_income, v.icon, v.sort
  from household, (values
    ('income', 'Income', true, 'banknote', 0),
    ('housing', 'Housing', false, 'home', 10),
    ('food', 'Food', false, 'utensils', 20),
    ('transport', 'Transportation', false, 'car', 30),
    ('health', 'Health', false, 'heart-pulse', 40),
    ('shopping', 'Shopping', false, 'shopping-bag', 50),
    ('bills', 'Bills & Subscriptions', false, 'receipt', 60),
    ('family', 'Family & Personal', false, 'users', 70),
    ('leisure', 'Leisure & Travel', false, 'plane', 80),
    ('finance', 'Finance', false, 'piggy-bank', 90),
    ('transfers', 'Transfers', false, 'arrow-left-right', 100),
    ('uncategorized', 'Uncategorized', false, 'help-circle', 999)
  ) as v(slug, name, is_income, icon, sort)
  on conflict (household_id, slug) do nothing
  returning id, slug
)
insert into categories (household_id, slug, name, parent_id, is_income, icon, sort)
select
  (select id from household),
  v.slug,
  v.name,
  parents.id,
  v.is_income,
  v.icon,
  v.sort
from (values
    ('income-salary', 'Salary', 'income', true, 'wallet', 1),
    ('income-other', 'Other Income', 'income', true, 'plus-circle', 2),

    ('housing-rent-mortgage', 'Rent / Mortgage', 'housing', false, 'key', 11),
    ('housing-arnona', 'Arnona (Municipal Tax)', 'housing', false, 'landmark', 12),
    ('housing-vaad-bayit', 'Vaad Bayit (Building Fees)', 'housing', false, 'building', 13),
    ('housing-utilities', 'Utilities (Electric / Water / Gas)', 'housing', false, 'plug', 14),
    ('housing-maintenance', 'Home Maintenance', 'housing', false, 'hammer', 15),

    ('food-groceries', 'Groceries', 'food', false, 'shopping-cart', 21),
    ('food-dining', 'Restaurants & Dining', 'food', false, 'coffee', 22),
    ('food-delivery', 'Food Delivery', 'food', false, 'bike', 23),

    ('transport-fuel', 'Fuel', 'transport', false, 'fuel', 31),
    ('transport-public', 'Public Transit', 'transport', false, 'bus', 32),
    ('transport-parking-tolls', 'Parking & Tolls', 'transport', false, 'parking-circle', 33),
    ('transport-maintenance', 'Car Maintenance & Insurance', 'transport', false, 'wrench', 34),
    ('transport-rideshare', 'Rideshare & Taxis', 'transport', false, 'car-taxi-front', 35),

    ('health-kupat-holim', 'Kupat Holim (Health Fund)', 'health', false, 'stethoscope', 41),
    ('health-pharmacy', 'Pharmacy', 'health', false, 'pill', 42),
    ('health-dental', 'Dental & Vision', 'health', false, 'smile', 43),
    ('health-fitness', 'Fitness & Wellness', 'health', false, 'dumbbell', 44),

    ('shopping-clothing', 'Clothing', 'shopping', false, 'shirt', 51),
    ('shopping-electronics', 'Electronics', 'shopping', false, 'smartphone', 52),
    ('shopping-home-goods', 'Home Goods', 'shopping', false, 'sofa', 53),
    ('shopping-general', 'General Shopping', 'shopping', false, 'package', 54),

    ('bills-phone-internet', 'Phone & Internet', 'bills', false, 'wifi', 61),
    ('bills-streaming', 'Streaming & Subscriptions', 'bills', false, 'tv', 62),
    ('bills-insurance', 'Insurance', 'bills', false, 'shield', 63),

    ('family-childcare', 'Childcare & Education', 'family', false, 'graduation-cap', 71),
    ('family-gifts', 'Gifts & Donations', 'family', false, 'gift', 72),
    ('family-personal-care', 'Personal Care', 'family', false, 'sparkles', 73),

    ('leisure-entertainment', 'Entertainment', 'leisure', false, 'clapperboard', 81),
    ('leisure-travel', 'Travel & Vacations', 'leisure', false, 'luggage', 82),
    ('leisure-hobbies', 'Hobbies', 'leisure', false, 'palette', 83),

    ('finance-savings-investing', 'Savings & Investing', 'finance', false, 'trending-up', 91),
    ('finance-fees', 'Bank & Card Fees', 'finance', false, 'circle-dollar-sign', 92),
    ('finance-taxes', 'Taxes & Bituach Leumi', 'finance', false, 'scale', 93),

    ('transfers-credit-card-payment', 'Credit Card Payment', 'transfers', false, 'credit-card', 101),
    ('transfers-internal', 'Internal Transfer', 'transfers', false, 'repeat', 102)
) as v(slug, name, parent_slug, is_income, icon, sort)
join parents on parents.slug = v.parent_slug
on conflict (household_id, slug) do nothing;

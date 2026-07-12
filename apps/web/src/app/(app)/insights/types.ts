export interface AnomalyRow {
  id: string;
  kind:
    | "unusual_amount"
    | "possible_duplicate"
    | "subscription_increase"
    | "missed_recurring"
    | "balance_drift";
  status: "open" | "acknowledged" | "dismissed";
  created_at: string;
  baseline: Record<string, unknown> | null;
  transaction_id: string | null;
  account_id: string | null;
  series_id: string | null;
  transactions: {
    description: string;
    charged_amount: number;
    charged_currency: string;
    date: string;
  } | null;
  accounts: {
    display_name: string;
    kind: string;
  } | null;
  recurring_series: {
    merchant_key: string;
    expected_amount: number | null;
  } | null;
}

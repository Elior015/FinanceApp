export type RecurringSeriesStatus = "proposed" | "confirmed" | "dismissed";
export type RecurringSeriesCadence = "weekly" | "monthly" | "yearly" | "irregular";
export type RecurringSeriesType = "income" | "bill" | "subscription";

export interface RecurringSeriesRow {
  id: string;
  merchant_key: string;
  cadence: RecurringSeriesCadence;
  expected_amount: number | null;
  next_expected_date: string | null;
  series_type: RecurringSeriesType;
  status: RecurringSeriesStatus;
  is_manual: boolean;
  amount_history: { date: string; amount: number }[] | null;
  created_at: string;
}

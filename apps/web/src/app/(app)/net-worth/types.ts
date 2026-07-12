export interface NetWorthRow {
  account_id: string;
  display_name: string;
  kind: "checking" | "credit_card" | "manual_asset";
  currency: string;
  scraped_balance: number;
  latest_manual_value: number;
  remaining_installment_liability: number;
}

export interface InstallmentPlanRow {
  id: string;
  merchant_description: string;
  monthly_amount: number;
  remaining_count: number;
}

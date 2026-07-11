export interface TransactionListRow {
  id: string;
  date: string;
  description: string;
  charged_amount: number;
  charged_currency: string;
  status: "pending" | "completed";
  category_id: string | null;
  is_personal: boolean;
  tags: string[];
  notes: string | null;
  account_id: string;
  accounts: { display_name: string } | null;
}

export interface CategoryOption {
  id: string;
  name: string;
  is_income: boolean;
}

export interface AccountOption {
  id: string;
  display_name: string;
}

export type UserRole = 'admin' | 'viewer';

export interface Profile {
  id: string;
  display_name: string;
  role: UserRole;
  created_at: string;
}

export interface Trip {
  id: string;
  name: string;
  country_code: string | null;
  start_date: string | null;
  end_date: string | null;
  default_total_people: number;
  notes: string | null;
  photo_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TripTotal {
  trip_id: string;
  currency: string;
  total_spent: number;
}

export interface Currency {
  code: string;
}

export interface VisitedLocality {
  id: string;
  country_code: string;
  profile_id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

export interface TripParticipant {
  id: string;
  trip_id: string;
  name: string;
  profile_id: string | null;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  icon: string | null;
}

export interface Expense {
  id: string;
  trip_id: string;
  category_id: string | null;
  total_amount: number;
  currency: string;
  total_people: number;
  is_personal: boolean;
  description: string | null;
  expense_date: string;
  created_by: string | null;
  created_at: string;
}

export interface ExpensePayment {
  id: string;
  expense_id: string;
  payer_profile_id: string | null;
  payer_label: string | null;
  amount_paid: number;
  people_covered: number;
}

export interface TripBalanceRow {
  trip_id: string;
  currency: string;
  payer_profile_id: string | null;
  payer_label: string | null;
  total_balance: number;
}

export interface ItineraryDay {
  id: string;
  trip_id: string;
  day_date: string;
  day_number: number;
  title: string | null;
}

export interface ItineraryItem {
  id: string;
  day_id: string;
  time: string | null;
  title: string;
  description: string | null;
  category: string | null;
  order_index: number;
}

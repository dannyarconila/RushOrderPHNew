export type AppRole = "customer" | "seller" | "rider" | "admin";
export type ApplicationStatus = "pending" | "approved" | "rejected" | "under_review";
export type SellerBusinessType = "registered" | "home_based";

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  city: string | null;
}

export interface SellerApplication {
  id: string;
  user_id: string;
  business_type: SellerBusinessType;
  status: ApplicationStatus;
  business_info: Record<string, string>;
  owner_info: Record<string, string>;
  address: Record<string, string>;
  store_info: Record<string, string>;
  documents: Record<string, string>;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiderApplication {
  id: string;
  user_id: string;
  status: ApplicationStatus;
  personal_info: Record<string, string>;
  address: Record<string, string>;
  vehicle_info: Record<string, string>;
  documents: Record<string, string>;
  emergency_contact: Record<string, string>;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

export const ROLE_HOME: Record<AppRole, string> = {
  customer: "/customer",
  seller: "/seller",
  rider: "/rider",
  admin: "/customer",
};

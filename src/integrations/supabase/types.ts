export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      addresses: {
        Row: {
          barangay: string | null;
          city: string | null;
          created_at: string;
          id: string;
          is_default: boolean;
          label: string | null;
          latitude: number | null;
          line1: string;
          line2: string | null;
          longitude: number | null;
          phone: string | null;
          postal_code: string | null;
          province: string | null;
          recipient_name: string | null;
          user_id: string;
        };
        Insert: {
          barangay?: string | null;
          city?: string | null;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          label?: string | null;
          latitude?: number | null;
          line1: string;
          line2?: string | null;
          longitude?: number | null;
          phone?: string | null;
          postal_code?: string | null;
          province?: string | null;
          recipient_name?: string | null;
          user_id: string;
        };
        Update: {
          barangay?: string | null;
          city?: string | null;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          label?: string | null;
          latitude?: number | null;
          line1?: string;
          line2?: string | null;
          longitude?: number | null;
          phone?: string | null;
          postal_code?: string | null;
          province?: string | null;
          recipient_name?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      admin_accounts: {
        Row: {
          created_at: string;
          created_by: string | null;
          failed_attempts: number;
          id: string;
          is_active: boolean;
          is_default_credentials: boolean;
          last_login_at: string | null;
          last_login_ip: string | null;
          locked_until: string | null;
          must_change_credentials: boolean;
          password_hash: string;
          role: Database["public"]["Enums"]["admin_role"];
          updated_at: string;
          username: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          failed_attempts?: number;
          id?: string;
          is_active?: boolean;
          is_default_credentials?: boolean;
          last_login_at?: string | null;
          last_login_ip?: string | null;
          locked_until?: string | null;
          must_change_credentials?: boolean;
          password_hash: string;
          role?: Database["public"]["Enums"]["admin_role"];
          updated_at?: string;
          username: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          failed_attempts?: number;
          id?: string;
          is_active?: boolean;
          is_default_credentials?: boolean;
          last_login_at?: string | null;
          last_login_ip?: string | null;
          locked_until?: string | null;
          must_change_credentials?: boolean;
          password_hash?: string;
          role?: Database["public"]["Enums"]["admin_role"];
          updated_at?: string;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_accounts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "admin_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_audit_logs: {
        Row: {
          action: string;
          admin_id: string | null;
          admin_username: string | null;
          created_at: string;
          details: Json;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          ip_address: string | null;
        };
        Insert: {
          action: string;
          admin_id?: string | null;
          admin_username?: string | null;
          created_at?: string;
          details?: Json;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          ip_address?: string | null;
        };
        Update: {
          action?: string;
          admin_id?: string | null;
          admin_username?: string | null;
          created_at?: string;
          details?: Json;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          ip_address?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "admin_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          name: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      deliveries: {
        Row: {
          accepted_at: string | null;
          claim_number: string | null;
          created_at: string;
          delivered_at: string | null;
          distance_km: number;
          dropoff_address: Json;
          fee: number;
          id: string;
          order_id: string;
          pickup_address: Json;
          rider_id: string | null;
          rider_latitude: number | null;
          rider_longitude: number | null;
          status: Database["public"]["Enums"]["delivery_status"];
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          claim_number?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          distance_km?: number;
          dropoff_address?: Json;
          fee?: number;
          id?: string;
          order_id: string;
          pickup_address?: Json;
          rider_id?: string | null;
          rider_latitude?: number | null;
          rider_longitude?: number | null;
          status?: Database["public"]["Enums"]["delivery_status"];
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          claim_number?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          distance_km?: number;
          dropoff_address?: Json;
          fee?: number;
          id?: string;
          order_id?: string;
          pickup_address?: Json;
          rider_id?: string | null;
          rider_latitude?: number | null;
          rider_longitude?: number | null;
          status?: Database["public"]["Enums"]["delivery_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deliveries_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      dispatch_chat_messages: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          order_id: string;
          recipient_id: string;
          sender_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          order_id: string;
          recipient_id: string;
          sender_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          order_id?: string;
          recipient_id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dispatch_chat_messages_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      dispatch_jobs: {
        Row: {
          assigned_at: string | null;
          assigned_rider_id: string | null;
          attempt: number;
          created_at: string;
          customer_notes: string | null;
          delivered_at: string | null;
          delivery_fee: number;
          dispatch_type: string;
          distance_km: number;
          dropoff_address: string | null;
          dropoff_lat: number | null;
          dropoff_lng: number | null;
          expires_at: string | null;
          id: string;
          last_attempt_at: string;
          max_attempts: number;
          order_id: string;
          picked_up_at: string | null;
          pickup_address: string | null;
          pickup_lat: number | null;
          pickup_lng: number | null;
          radius_km: number;
          status: Database["public"]["Enums"]["dispatch_status"];
          store_id: string | null;
          store_name: string | null;
          updated_at: string;
        };
        Insert: {
          assigned_at?: string | null;
          assigned_rider_id?: string | null;
          attempt?: number;
          created_at?: string;
          customer_notes?: string | null;
          delivered_at?: string | null;
          delivery_fee?: number;
          dispatch_type?: string;
          distance_km?: number;
          dropoff_address?: string | null;
          dropoff_lat?: number | null;
          dropoff_lng?: number | null;
          expires_at?: string | null;
          id?: string;
          last_attempt_at?: string;
          max_attempts?: number;
          order_id: string;
          picked_up_at?: string | null;
          pickup_address?: string | null;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          radius_km?: number;
          status?: Database["public"]["Enums"]["dispatch_status"];
          store_id?: string | null;
          store_name?: string | null;
          updated_at?: string;
        };
        Update: {
          assigned_at?: string | null;
          assigned_rider_id?: string | null;
          attempt?: number;
          created_at?: string;
          customer_notes?: string | null;
          delivered_at?: string | null;
          delivery_fee?: number;
          dispatch_type?: string;
          distance_km?: number;
          dropoff_address?: string | null;
          dropoff_lat?: number | null;
          dropoff_lng?: number | null;
          expires_at?: string | null;
          id?: string;
          last_attempt_at?: string;
          max_attempts?: number;
          order_id?: string;
          picked_up_at?: string | null;
          pickup_address?: string | null;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          radius_km?: number;
          status?: Database["public"]["Enums"]["dispatch_status"];
          store_id?: string | null;
          store_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      dispatch_offers: {
        Row: {
          attempt: number;
          created_at: string;
          distance_km: number | null;
          expires_at: string;
          id: string;
          job_id: string;
          order_id: string;
          responded_at: string | null;
          rider_id: string;
          status: Database["public"]["Enums"]["dispatch_offer_status"];
          updated_at: string;
        };
        Insert: {
          attempt?: number;
          created_at?: string;
          distance_km?: number | null;
          expires_at?: string;
          id?: string;
          job_id: string;
          order_id: string;
          responded_at?: string | null;
          rider_id: string;
          status?: Database["public"]["Enums"]["dispatch_offer_status"];
          updated_at?: string;
        };
        Update: {
          attempt?: number;
          created_at?: string;
          distance_km?: number | null;
          expires_at?: string;
          id?: string;
          job_id?: string;
          order_id?: string;
          responded_at?: string | null;
          rider_id?: string;
          status?: Database["public"]["Enums"]["dispatch_offer_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dispatch_offers_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "dispatch_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      favorites: {
        Row: {
          created_at: string;
          id: string;
          product_id: string | null;
          store_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          product_id?: string | null;
          store_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          product_id?: string | null;
          store_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorites_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      legal_acceptance_logs: {
        Row: {
          accepted_at: string;
          audience: Database["public"]["Enums"]["app_role"];
          created_at: string;
          id: string;
          metadata: Json;
          privacy_version: string;
          source: string;
          terms_version: string;
          user_id: string | null;
        };
        Insert: {
          accepted_at?: string;
          audience: Database["public"]["Enums"]["app_role"];
          created_at?: string;
          id?: string;
          metadata?: Json;
          privacy_version: string;
          source?: string;
          terms_version: string;
          user_id?: string | null;
        };
        Update: {
          accepted_at?: string;
          audience?: Database["public"]["Enums"]["app_role"];
          created_at?: string;
          id?: string;
          metadata?: Json;
          privacy_version?: string;
          source?: string;
          terms_version?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      legal_documents: {
        Row: {
          content: string;
          created_at: string;
          is_published: boolean;
          published_at: string;
          slug: string;
          summary: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
          version: string;
        };
        Insert: {
          content?: string;
          created_at?: string;
          is_published?: boolean;
          published_at?: string;
          slug: string;
          summary?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          is_published?: boolean;
          published_at?: string;
          slug?: string;
          summary?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "legal_documents_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "admin_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          is_read: boolean;
          kind: string;
          pasugo_booking_id: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          kind?: string;
          pasugo_booking_id?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          kind?: string;
          pasugo_booking_id?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          created_at: string;
          id: string;
          line_subtotal: number;
          order_id: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
          unit_price: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          line_subtotal?: number;
          order_id: string;
          product_id?: string | null;
          product_name: string;
          quantity?: number;
          unit_price?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          line_subtotal?: number;
          order_id?: string;
          product_id?: string | null;
          product_name?: string;
          quantity?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          address_id: string | null;
          claim_number: string | null;
          created_at: string;
          customer_id: string;
          deleted_at: string | null;
          delivery_fee: number;
          distance_km: number;
          id: string;
          idempotency_key: string | null;
          inventory_reserved: boolean;
          notes: string | null;
          payment_method: Database["public"]["Enums"]["payment_method"];
          payment_status: Database["public"]["Enums"]["payment_status"];
          rider_commission: number;
          rider_id: string | null;
          rider_platform_fee: number;
          rider_platform_fee_deducted_at: string | null;
          rider_platform_fee_refunded_at: string | null;
          seller_commission: number;
          status: Database["public"]["Enums"]["order_status"];
          store_id: string | null;
          subtotal: number;
          surge_fee: number;
          tax: number;
          total: number;
          updated_at: string;
        };
        Insert: {
          address_id?: string | null;
          claim_number?: string | null;
          created_at?: string;
          customer_id: string;
          deleted_at?: string | null;
          delivery_fee?: number;
          distance_km?: number;
          id?: string;
          idempotency_key?: string | null;
          inventory_reserved?: boolean;
          notes?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          payment_status?: Database["public"]["Enums"]["payment_status"];
          rider_commission?: number;
          rider_id?: string | null;
          rider_platform_fee?: number;
          rider_platform_fee_deducted_at?: string | null;
          rider_platform_fee_refunded_at?: string | null;
          seller_commission?: number;
          status?: Database["public"]["Enums"]["order_status"];
          store_id?: string | null;
          subtotal?: number;
          surge_fee?: number;
          tax?: number;
          total?: number;
          updated_at?: string;
        };
        Update: {
          address_id?: string | null;
          claim_number?: string | null;
          created_at?: string;
          customer_id?: string;
          deleted_at?: string | null;
          delivery_fee?: number;
          distance_km?: number;
          id?: string;
          idempotency_key?: string | null;
          inventory_reserved?: boolean;
          notes?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          payment_status?: Database["public"]["Enums"]["payment_status"];
          rider_commission?: number;
          rider_id?: string | null;
          rider_platform_fee?: number;
          rider_platform_fee_deducted_at?: string | null;
          rider_platform_fee_refunded_at?: string | null;
          seller_commission?: number;
          status?: Database["public"]["Enums"]["order_status"];
          store_id?: string | null;
          subtotal?: number;
          surge_fee?: number;
          tax?: number;
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey";
            columns: ["address_id"];
            isOneToOne: false;
            referencedRelation: "addresses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      pasugo_bookings: {
        Row: {
          assigned_rider_id: string | null;
          cancelled_at: string | null;
          completed_at: string | null;
          created_at: string;
          customer_id: string;
          customer_name: string | null;
          customer_phone: string | null;
          dropoff_address: string;
          dropoff_lat: number | null;
          dropoff_lng: number | null;
          estimated_distance_km: number;
          estimated_fare: number;
          id: string;
          notes: string | null;
          pickup_address: string;
          pickup_lat: number | null;
          pickup_lng: number | null;
          rider_fee_deducted_at: string | null;
          rider_fee_per_booking: number;
          status: Database["public"]["Enums"]["pasugo_booking_status"];
          updated_at: string;
        };
        Insert: {
          assigned_rider_id?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          customer_id: string;
          customer_name?: string | null;
          customer_phone?: string | null;
          dropoff_address: string;
          dropoff_lat?: number | null;
          dropoff_lng?: number | null;
          estimated_distance_km?: number;
          estimated_fare?: number;
          id?: string;
          notes?: string | null;
          pickup_address: string;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          rider_fee_deducted_at?: string | null;
          rider_fee_per_booking?: number;
          status?: Database["public"]["Enums"]["pasugo_booking_status"];
          updated_at?: string;
        };
        Update: {
          assigned_rider_id?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          customer_id?: string;
          customer_name?: string | null;
          customer_phone?: string | null;
          dropoff_address?: string;
          dropoff_lat?: number | null;
          dropoff_lng?: number | null;
          estimated_distance_km?: number;
          estimated_fare?: number;
          id?: string;
          notes?: string | null;
          pickup_address?: string;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          rider_fee_deducted_at?: string | null;
          rider_fee_per_booking?: number;
          status?: Database["public"]["Enums"]["pasugo_booking_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      pasugo_chat_messages: {
        Row: {
          booking_id: string;
          created_at: string;
          id: string;
          message: string;
          recipient_id: string;
          sender_id: string;
        };
        Insert: {
          booking_id: string;
          created_at?: string;
          id?: string;
          message: string;
          recipient_id: string;
          sender_id: string;
        };
        Update: {
          booking_id?: string;
          created_at?: string;
          id?: string;
          message?: string;
          recipient_id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pasugo_chat_messages_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "pasugo_bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      pasugo_dispatch_jobs: {
        Row: {
          assigned_at: string | null;
          assigned_rider_id: string | null;
          attempt: number;
          booking_id: string;
          created_at: string;
          delivered_at: string | null;
          delivery_fee: number;
          distance_km: number;
          dropoff_address: string | null;
          dropoff_lat: number | null;
          dropoff_lng: number | null;
          expires_at: string | null;
          id: string;
          last_attempt_at: string | null;
          max_attempts: number;
          picked_up_at: string | null;
          pickup_address: string | null;
          pickup_lat: number | null;
          pickup_lng: number | null;
          radius_km: number;
          status: Database["public"]["Enums"]["dispatch_status"];
          updated_at: string;
        };
        Insert: {
          assigned_at?: string | null;
          assigned_rider_id?: string | null;
          attempt?: number;
          booking_id: string;
          created_at?: string;
          delivered_at?: string | null;
          delivery_fee?: number;
          distance_km?: number;
          dropoff_address?: string | null;
          dropoff_lat?: number | null;
          dropoff_lng?: number | null;
          expires_at?: string | null;
          id?: string;
          last_attempt_at?: string | null;
          max_attempts?: number;
          picked_up_at?: string | null;
          pickup_address?: string | null;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          radius_km?: number;
          status?: Database["public"]["Enums"]["dispatch_status"];
          updated_at?: string;
        };
        Update: {
          assigned_at?: string | null;
          assigned_rider_id?: string | null;
          attempt?: number;
          booking_id?: string;
          created_at?: string;
          delivered_at?: string | null;
          delivery_fee?: number;
          distance_km?: number;
          dropoff_address?: string | null;
          dropoff_lat?: number | null;
          dropoff_lng?: number | null;
          expires_at?: string | null;
          id?: string;
          last_attempt_at?: string | null;
          max_attempts?: number;
          picked_up_at?: string | null;
          pickup_address?: string | null;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          radius_km?: number;
          status?: Database["public"]["Enums"]["dispatch_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pasugo_dispatch_jobs_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "pasugo_bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      pasugo_dispatch_offers: {
        Row: {
          attempt: number;
          booking_id: string;
          created_at: string;
          distance_km: number | null;
          expires_at: string;
          id: string;
          job_id: string;
          responded_at: string | null;
          rider_id: string;
          status: Database["public"]["Enums"]["dispatch_offer_status"];
          updated_at: string;
        };
        Insert: {
          attempt: number;
          booking_id: string;
          created_at?: string;
          distance_km?: number | null;
          expires_at: string;
          id?: string;
          job_id: string;
          responded_at?: string | null;
          rider_id: string;
          status?: Database["public"]["Enums"]["dispatch_offer_status"];
          updated_at?: string;
        };
        Update: {
          attempt?: number;
          booking_id?: string;
          created_at?: string;
          distance_km?: number | null;
          expires_at?: string;
          id?: string;
          job_id?: string;
          responded_at?: string | null;
          rider_id?: string;
          status?: Database["public"]["Enums"]["dispatch_offer_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pasugo_dispatch_offers_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "pasugo_bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pasugo_dispatch_offers_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "pasugo_dispatch_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_callbacks: {
        Row: {
          created_at: string;
          error: string | null;
          id: string;
          is_valid: boolean;
          payload: Json;
          processed: boolean;
          provider_code: string;
          reference: string | null;
          signature: string | null;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          id?: string;
          is_valid?: boolean;
          payload?: Json;
          processed?: boolean;
          provider_code: string;
          reference?: string | null;
          signature?: string | null;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          id?: string;
          is_valid?: boolean;
          payload?: Json;
          processed?: boolean;
          provider_code?: string;
          reference?: string | null;
          signature?: string | null;
        };
        Relationships: [];
      };
      payment_methods: {
        Row: {
          account_name: string | null;
          account_number: string | null;
          code: string;
          created_at: string;
          id: string;
          instructions: string | null;
          is_active: boolean;
          name: string;
          qr_image_path: string | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          account_name?: string | null;
          account_number?: string | null;
          code: string;
          created_at?: string;
          id?: string;
          instructions?: string | null;
          is_active?: boolean;
          name: string;
          qr_image_path?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          account_name?: string | null;
          account_number?: string | null;
          code?: string;
          created_at?: string;
          id?: string;
          instructions?: string | null;
          is_active?: boolean;
          name?: string;
          qr_image_path?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_providers: {
        Row: {
          code: string;
          config: Json;
          created_at: string;
          id: string;
          is_enabled: boolean;
          name: string;
          sort_order: number;
          supports_qr: boolean;
          supports_redirect: boolean;
          updated_at: string;
        };
        Insert: {
          code: string;
          config?: Json;
          created_at?: string;
          id?: string;
          is_enabled?: boolean;
          name: string;
          sort_order?: number;
          supports_qr?: boolean;
          supports_redirect?: boolean;
          updated_at?: string;
        };
        Update: {
          code?: string;
          config?: Json;
          created_at?: string;
          id?: string;
          is_enabled?: boolean;
          name?: string;
          sort_order?: number;
          supports_qr?: boolean;
          supports_redirect?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_sessions: {
        Row: {
          amount: number;
          checkout_url: string | null;
          completed_at: string | null;
          created_at: string;
          currency: string;
          expires_at: string;
          id: string;
          metadata: Json;
          order_id: string | null;
          provider_code: string;
          provider_reference: string | null;
          purpose: string;
          qr_payload: string | null;
          reference: string;
          status: Database["public"]["Enums"]["payment_status"];
          updated_at: string;
          user_id: string;
          wallet_id: string | null;
        };
        Insert: {
          amount: number;
          checkout_url?: string | null;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          expires_at?: string;
          id?: string;
          metadata?: Json;
          order_id?: string | null;
          provider_code: string;
          provider_reference?: string | null;
          purpose?: string;
          qr_payload?: string | null;
          reference: string;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
          user_id: string;
          wallet_id?: string | null;
        };
        Update: {
          amount?: number;
          checkout_url?: string | null;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          expires_at?: string;
          id?: string;
          metadata?: Json;
          order_id?: string | null;
          provider_code?: string;
          provider_reference?: string | null;
          purpose?: string;
          qr_payload?: string | null;
          reference?: string;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
          user_id?: string;
          wallet_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payment_sessions_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_sessions_provider_code_fkey";
            columns: ["provider_code"];
            isOneToOne: false;
            referencedRelation: "payment_providers";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "payment_sessions_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "wallets";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_transactions: {
        Row: {
          amount: number;
          created_at: string;
          fee: number;
          id: string;
          payment_method: Database["public"]["Enums"]["payment_method"];
          provider_code: string;
          provider_reference: string | null;
          raw_response: Json;
          reference: string;
          session_id: string | null;
          status: Database["public"]["Enums"]["payment_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          fee?: number;
          id?: string;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          provider_code: string;
          provider_reference?: string | null;
          raw_response?: Json;
          reference: string;
          session_id?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          fee?: number;
          id?: string;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          provider_code?: string;
          provider_reference?: string | null;
          raw_response?: Json;
          reference?: string;
          session_id?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_transactions_provider_code_fkey";
            columns: ["provider_code"];
            isOneToOne: false;
            referencedRelation: "payment_providers";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "payment_transactions_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "payment_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          category_id: string | null;
          compare_at_price: number | null;
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          id: string;
          images: Json;
          is_available: boolean;
          is_published: boolean;
          name: string;
          price: number;
          stock: number;
          store_id: string;
          updated_at: string;
        };
        Insert: {
          category_id?: string | null;
          compare_at_price?: number | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          images?: Json;
          is_available?: boolean;
          is_published?: boolean;
          name: string;
          price?: number;
          stock?: number;
          store_id: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string | null;
          compare_at_price?: number | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          images?: Json;
          is_available?: boolean;
          is_published?: boolean;
          name?: string;
          price?: number;
          stock?: number;
          store_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          accepted_terms: boolean;
          accepted_terms_at: string | null;
          account_status: Database["public"]["Enums"]["account_status"];
          avatar_url: string | null;
          city: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          privacy_version: string | null;
          status_changed_at: string | null;
          status_note: string | null;
          terms_version: string | null;
          updated_at: string;
        };
        Insert: {
          accepted_terms?: boolean;
          accepted_terms_at?: string | null;
          account_status?: Database["public"]["Enums"]["account_status"];
          avatar_url?: string | null;
          city?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          privacy_version?: string | null;
          status_changed_at?: string | null;
          status_note?: string | null;
          terms_version?: string | null;
          updated_at?: string;
        };
        Update: {
          accepted_terms?: boolean;
          accepted_terms_at?: string | null;
          account_status?: Database["public"]["Enums"]["account_status"];
          avatar_url?: string | null;
          city?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          privacy_version?: string | null;
          status_changed_at?: string | null;
          status_note?: string | null;
          terms_version?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      refund_transactions: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          order_id: string | null;
          payment_transaction_id: string | null;
          reason: string | null;
          reference: string;
          status: Database["public"]["Enums"]["payment_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          order_id?: string | null;
          payment_transaction_id?: string | null;
          reason?: string | null;
          reference: string;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          order_id?: string | null;
          payment_transaction_id?: string | null;
          reason?: string | null;
          reference?: string;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "refund_transactions_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_transactions_payment_transaction_id_fkey";
            columns: ["payment_transaction_id"];
            isOneToOne: false;
            referencedRelation: "payment_transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          comment: string | null;
          created_at: string;
          id: string;
          order_id: string | null;
          product_id: string | null;
          rating: number;
          store_id: string | null;
          user_id: string;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          id?: string;
          order_id?: string | null;
          product_id?: string | null;
          rating?: number;
          store_id?: string | null;
          user_id: string;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          id?: string;
          order_id?: string | null;
          product_id?: string | null;
          rating?: number;
          store_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      rider_applications: {
        Row: {
          accepted_terms: boolean;
          accepted_terms_at: string | null;
          address: Json;
          created_at: string;
          device_fingerprint: string | null;
          documents: Json;
          emergency_contact: Json;
          id: string;
          ip_address: string | null;
          personal_info: Json;
          privacy_version: string | null;
          review_notes: string | null;
          reviewed_at: string | null;
          status: Database["public"]["Enums"]["application_status"];
          terms_version: string | null;
          updated_at: string;
          user_id: string;
          vehicle_info: Json;
          welcome_bonus_credited_at: string | null;
        };
        Insert: {
          accepted_terms?: boolean;
          accepted_terms_at?: string | null;
          address?: Json;
          created_at?: string;
          device_fingerprint?: string | null;
          documents?: Json;
          emergency_contact?: Json;
          id?: string;
          ip_address?: string | null;
          personal_info?: Json;
          privacy_version?: string | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
          status?: Database["public"]["Enums"]["application_status"];
          terms_version?: string | null;
          updated_at?: string;
          user_id: string;
          vehicle_info?: Json;
          welcome_bonus_credited_at?: string | null;
        };
        Update: {
          accepted_terms?: boolean;
          accepted_terms_at?: string | null;
          address?: Json;
          created_at?: string;
          device_fingerprint?: string | null;
          documents?: Json;
          emergency_contact?: Json;
          id?: string;
          ip_address?: string | null;
          personal_info?: Json;
          privacy_version?: string | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
          status?: Database["public"]["Enums"]["application_status"];
          terms_version?: string | null;
          updated_at?: string;
          user_id?: string;
          vehicle_info?: Json;
          welcome_bonus_credited_at?: string | null;
        };
        Relationships: [];
      };
      rider_status: {
        Row: {
          active_order_id: string | null;
          created_at: string;
          is_available: boolean;
          is_online: boolean;
          last_seen_at: string;
          latitude: number | null;
          longitude: number | null;
          plate_number: string | null;
          updated_at: string;
          user_id: string;
          vehicle_type: string | null;
        };
        Insert: {
          active_order_id?: string | null;
          created_at?: string;
          is_available?: boolean;
          is_online?: boolean;
          last_seen_at?: string;
          latitude?: number | null;
          longitude?: number | null;
          plate_number?: string | null;
          updated_at?: string;
          user_id: string;
          vehicle_type?: string | null;
        };
        Update: {
          active_order_id?: string | null;
          created_at?: string;
          is_available?: boolean;
          is_online?: boolean;
          last_seen_at?: string;
          latitude?: number | null;
          longitude?: number | null;
          plate_number?: string | null;
          updated_at?: string;
          user_id?: string;
          vehicle_type?: string | null;
        };
        Relationships: [];
      };
      seller_applications: {
        Row: {
          accepted_terms: boolean;
          accepted_terms_at: string | null;
          address: Json;
          business_info: Json;
          business_type: Database["public"]["Enums"]["seller_business_type"];
          created_at: string;
          device_fingerprint: string | null;
          documents: Json;
          id: string;
          ip_address: string | null;
          owner_info: Json;
          privacy_version: string | null;
          review_notes: string | null;
          reviewed_at: string | null;
          status: Database["public"]["Enums"]["application_status"];
          store_info: Json;
          terms_version: string | null;
          updated_at: string;
          user_id: string;
          welcome_bonus_credited_at: string | null;
        };
        Insert: {
          accepted_terms?: boolean;
          accepted_terms_at?: string | null;
          address?: Json;
          business_info?: Json;
          business_type: Database["public"]["Enums"]["seller_business_type"];
          created_at?: string;
          device_fingerprint?: string | null;
          documents?: Json;
          id?: string;
          ip_address?: string | null;
          owner_info?: Json;
          privacy_version?: string | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
          status?: Database["public"]["Enums"]["application_status"];
          store_info?: Json;
          terms_version?: string | null;
          updated_at?: string;
          user_id: string;
          welcome_bonus_credited_at?: string | null;
        };
        Update: {
          accepted_terms?: boolean;
          accepted_terms_at?: string | null;
          address?: Json;
          business_info?: Json;
          business_type?: Database["public"]["Enums"]["seller_business_type"];
          created_at?: string;
          device_fingerprint?: string | null;
          documents?: Json;
          id?: string;
          ip_address?: string | null;
          owner_info?: Json;
          privacy_version?: string | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
          status?: Database["public"]["Enums"]["application_status"];
          store_info?: Json;
          terms_version?: string | null;
          updated_at?: string;
          user_id?: string;
          welcome_bonus_credited_at?: string | null;
        };
        Relationships: [];
      };
      stores: {
        Row: {
          address: Json;
          banner_url: string | null;
          business_hours: Json;
          category_id: string | null;
          cover_url: string | null;
          created_at: string;
          deleted_at: string | null;
          delivery_fee_override: number | null;
          delivery_radius_km: number;
          description: string | null;
          id: string;
          is_active: boolean;
          is_approved: boolean;
          is_featured: boolean;
          is_online: boolean;
          is_visible: boolean;
          latitude: number | null;
          logo_url: string | null;
          longitude: number | null;
          minimum_order: number;
          name: string;
          owner_id: string;
          phone: string | null;
          prep_time_minutes: number;
          rating: number;
          rating_count: number;
          service_type: string;
          slug: string | null;
          updated_at: string;
          verification_notes: string | null;
          verification_status: Database["public"]["Enums"]["store_verification_status"];
          verified_at: string | null;
          wallet_hold: boolean;
        };
        Insert: {
          address?: Json;
          banner_url?: string | null;
          business_hours?: Json;
          category_id?: string | null;
          cover_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          delivery_fee_override?: number | null;
          delivery_radius_km?: number;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_approved?: boolean;
          is_featured?: boolean;
          is_online?: boolean;
          is_visible?: boolean;
          latitude?: number | null;
          logo_url?: string | null;
          longitude?: number | null;
          minimum_order?: number;
          name: string;
          owner_id: string;
          phone?: string | null;
          prep_time_minutes?: number;
          rating?: number;
          rating_count?: number;
          service_type?: string;
          slug?: string | null;
          updated_at?: string;
          verification_notes?: string | null;
          verification_status?: Database["public"]["Enums"]["store_verification_status"];
          verified_at?: string | null;
          wallet_hold?: boolean;
        };
        Update: {
          address?: Json;
          banner_url?: string | null;
          business_hours?: Json;
          category_id?: string | null;
          cover_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          delivery_fee_override?: number | null;
          delivery_radius_km?: number;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_approved?: boolean;
          is_featured?: boolean;
          is_online?: boolean;
          is_visible?: boolean;
          latitude?: number | null;
          logo_url?: string | null;
          longitude?: number | null;
          minimum_order?: number;
          name?: string;
          owner_id?: string;
          phone?: string | null;
          prep_time_minutes?: number;
          rating?: number;
          rating_count?: number;
          service_type?: string;
          slug?: string | null;
          updated_at?: string;
          verification_notes?: string | null;
          verification_status?: Database["public"]["Enums"]["store_verification_status"];
          verified_at?: string | null;
          wallet_hold?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "stores_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      system_settings: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_public: boolean;
          key: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_public?: boolean;
          key: string;
          updated_at?: string;
          value?: Json;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_public?: boolean;
          key?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      wallet_topups: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          payment_method_id: string | null;
          payment_method_name: string;
          proof_path: string | null;
          reference_number: string;
          review_notes: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["topup_status"];
          updated_at: string;
          user_id: string;
          wallet_id: string | null;
          wallet_type: Database["public"]["Enums"]["wallet_type"];
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          payment_method_id?: string | null;
          payment_method_name: string;
          proof_path?: string | null;
          reference_number: string;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["topup_status"];
          updated_at?: string;
          user_id: string;
          wallet_id?: string | null;
          wallet_type: Database["public"]["Enums"]["wallet_type"];
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          payment_method_id?: string | null;
          payment_method_name?: string;
          proof_path?: string | null;
          reference_number?: string;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["topup_status"];
          updated_at?: string;
          user_id?: string;
          wallet_id?: string | null;
          wallet_type?: Database["public"]["Enums"]["wallet_type"];
        };
        Relationships: [
          {
            foreignKeyName: "wallet_topups_payment_method_id_fkey";
            columns: ["payment_method_id"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wallet_topups_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "wallets";
            referencedColumns: ["id"];
          },
        ];
      };
      wallet_transaction_hides: {
        Row: {
          hidden_at: string;
          id: string;
          user_id: string;
          wallet_transaction_id: string;
        };
        Insert: {
          hidden_at?: string;
          id?: string;
          user_id: string;
          wallet_transaction_id: string;
        };
        Update: {
          hidden_at?: string;
          id?: string;
          user_id?: string;
          wallet_transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wallet_transaction_hides_wallet_transaction_id_fkey";
            columns: ["wallet_transaction_id"];
            isOneToOne: false;
            referencedRelation: "wallet_transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      wallet_transactions: {
        Row: {
          amount: number;
          created_at: string;
          description: string | null;
          id: string;
          kind: string;
          new_balance: number;
          order_id: string | null;
          payment_method: Database["public"]["Enums"]["payment_method"] | null;
          previous_balance: number;
          provider_code: string | null;
          reference: string | null;
          status: Database["public"]["Enums"]["payment_status"];
          wallet_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          description?: string | null;
          id?: string;
          kind: string;
          new_balance?: number;
          order_id?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          previous_balance?: number;
          provider_code?: string | null;
          reference?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          wallet_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          description?: string | null;
          id?: string;
          kind?: string;
          new_balance?: number;
          order_id?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          previous_balance?: number;
          provider_code?: string | null;
          reference?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          wallet_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "wallets";
            referencedColumns: ["id"];
          },
        ];
      };
      wallets: {
        Row: {
          balance: number;
          created_at: string;
          currency: string;
          deleted_at: string | null;
          id: string;
          is_active: boolean;
          pending_balance: number;
          updated_at: string;
          user_id: string;
          wallet_type: Database["public"]["Enums"]["wallet_type"];
        };
        Insert: {
          balance?: number;
          created_at?: string;
          currency?: string;
          deleted_at?: string | null;
          id?: string;
          is_active?: boolean;
          pending_balance?: number;
          updated_at?: string;
          user_id: string;
          wallet_type?: Database["public"]["Enums"]["wallet_type"];
        };
        Update: {
          balance?: number;
          created_at?: string;
          currency?: string;
          deleted_at?: string | null;
          id?: string;
          is_active?: boolean;
          pending_balance?: number;
          updated_at?: string;
          user_id?: string;
          wallet_type?: Database["public"]["Enums"]["wallet_type"];
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_customer_legal: {
        Args: { _privacy_version: string; _terms_version: string };
        Returns: undefined;
      };
      admin_bootstrap_available: { Args: never; Returns: boolean };
      admin_portal_approve_topup: {
        Args: { _notes?: string; _topup_id: string };
        Returns: string;
      };
      admin_portal_reject_topup: {
        Args: { _reason: string; _topup_id: string };
        Returns: boolean;
      };
      admin_portal_review_application: {
        Args: {
          _application_id: string;
          _approval_bonus?: number;
          _kind: string;
          _next_status: Database["public"]["Enums"]["application_status"];
          _notes?: string;
        };
        Returns: Json;
      };
      admin_portal_set_account_status: {
        Args: {
          _note?: string;
          _status: Database["public"]["Enums"]["account_status"];
          _user_id: string;
        };
        Returns: boolean;
      };
      admin_portal_set_store_verification: {
        Args: {
          _notes?: string;
          _status: Database["public"]["Enums"]["store_verification_status"];
          _store_id: string;
        };
        Returns: boolean;
      };
      approve_wallet_topup: {
        Args: { _notes?: string; _topup_id: string };
        Returns: string;
      };
      calculate_rider_platform_fee: {
        Args: { _distance_km: number };
        Returns: number;
      };
      claim_first_admin: { Args: never; Returns: boolean };
      create_order_secure: {
        Args: {
          _address_id: string;
          _idempotency_key?: string;
          _items?: Json;
          _notes?: string;
          _payment_method: Database["public"]["Enums"]["payment_method"];
          _store_id: string;
        };
        Returns: string;
      };
      dispatch_accept: { Args: { _job_id: string }; Returns: Json };
      rider_delivery_details: {
        Args: { _order_id: string };
        Returns: Json;
      };
      seller_order_details: {
        Args: { _order_id: string };
        Returns: Json;
      };
      dispatch_advance: {
        Args: { _job_id: string; _step: string };
        Returns: boolean;
      };
      dispatch_broadcast: { Args: { _job_id: string }; Returns: number };
      dispatch_decline: { Args: { _job_id: string }; Returns: boolean };
      dispatch_retry: { Args: { _job_id: string }; Returns: boolean };
      dispatch_settings: { Args: never; Returns: Json };
      dispatch_start: { Args: { _order_id: string }; Returns: string };
      enforce_wallet_thresholds_from_settings: {
        Args: never;
        Returns: undefined;
      };
      generate_order_claim_number: { Args: never; Returns: string };
      get_marketplace_stores: {
        Args: {
          _customer_lat?: number;
          _customer_lng?: number;
          _service_type?: string;
        };
        Returns: {
          address: Json;
          banner_url: string;
          business_hours: Json;
          category_id: string;
          delivery_fee_override: number;
          description: string;
          distance_km: number;
          id: string;
          is_featured: boolean;
          is_online: boolean;
          latitude: number;
          logo_url: string;
          longitude: number;
          minimum_order: number;
          name: string;
          prep_time_minutes: number;
          rating: number;
          rating_count: number;
          service_type: string;
          slug: string;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      haversine_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number };
        Returns: number;
      };
      is_portal_admin: { Args: never; Returns: boolean };
      minimum_wallet_balance_for_role: {
        Args: { _role: string };
        Returns: number;
      };
      pasugo_available_riders_count: {
        Args: { _job_id: string };
        Returns: number;
      };
      pasugo_cancel: { Args: { _booking_id: string }; Returns: boolean };
      pasugo_dispatch_accept: { Args: { _job_id: string }; Returns: Json };
      pasugo_available_riders: {
        Args: { _job_id: string };
        Returns: {
          rider_id: string;
          rider_name: string;
          distance_km: number;
          latitude: number;
          longitude: number;
          last_seen_at: string | null;
        }[];
      };
      pasugo_select_rider: {
        Args: { _job_id: string; _rider_id: string };
        Returns: {
          ok: boolean;
          offer_id?: string;
          rider_id?: string;
          distance_km?: number;
          expires_at?: string;
        };
      };
      pasugo_dispatch_advance: {
        Args: { _job_id: string; _step: string };
        Returns: boolean;
      };
      pasugo_dispatch_broadcast: { Args: { _job_id: string }; Returns: number };
      pasugo_dispatch_decline: { Args: { _job_id: string }; Returns: boolean };
      pasugo_expire_selected_rider: { Args: { _job_id: string }; Returns: boolean };
      pasugo_dispatch_retry: { Args: { _job_id: string }; Returns: boolean };
      pasugo_start: { Args: { _booking_id: string }; Returns: string };
      refresh_store_rating: { Args: { _store_id: string }; Returns: undefined };
      reject_wallet_topup: {
        Args: { _reason: string; _topup_id: string };
        Returns: boolean;
      };
      request_client_ip: { Args: never; Returns: string };
      retry_expired_dispatches: { Args: { _limit?: number }; Returns: number };
      rider_set_presence: {
        Args: { _lat?: number; _lng?: number; _online: boolean };
        Returns: boolean;
      };
      store_is_open_now: {
        Args: { _at?: string; _hours: Json };
        Returns: boolean;
      };
      store_set_online: {
        Args: { _online: boolean; _store_id: string };
        Returns: boolean;
      };
      transition_order_status: {
        Args: {
          _next_status: Database["public"]["Enums"]["order_status"];
          _order_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      account_status: "active" | "suspended" | "banned";
      admin_role: "super_admin" | "admin" | "finance" | "support";
      app_role: "customer" | "seller" | "rider" | "admin";
      application_status: "pending" | "approved" | "rejected" | "under_review";
      delivery_status: "unassigned" | "assigned" | "picked_up" | "delivered" | "cancelled";
      dispatch_offer_status: "pending" | "accepted" | "declined" | "expired" | "cancelled";
      dispatch_status:
        "searching" | "assigned" | "picked_up" | "delivered" | "cancelled" | "failed";
      order_status:
        "pending" | "confirmed" | "preparing" | "ready" | "picked_up" | "delivered" | "cancelled";
      pasugo_booking_status:
        | "requested"
        | "finding_rider"
        | "accepted"
        | "rider_arriving"
        | "picked_up"
        | "on_the_way"
        | "delivered"
        | "completed"
        | "cancelled"
        | "failed";
      payment_method: "cod" | "gcash" | "wallet" | "maya" | "card" | "bank_transfer" | "qrph";
      payment_status: "pending" | "processing" | "succeeded" | "failed" | "expired" | "refunded";
      seller_business_type: "registered" | "home_based";
      store_verification_status: "pending" | "verified" | "suspended" | "rejected";
      topup_status: "pending" | "approved" | "rejected" | "cancelled";
      wallet_type: "seller" | "rider";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_status: ["active", "suspended", "banned"],
      admin_role: ["super_admin", "admin", "finance", "support"],
      app_role: ["customer", "seller", "rider", "admin"],
      application_status: ["pending", "approved", "rejected", "under_review"],
      delivery_status: ["unassigned", "assigned", "picked_up", "delivered", "cancelled"],
      dispatch_offer_status: ["pending", "accepted", "declined", "expired", "cancelled"],
      dispatch_status: ["searching", "assigned", "picked_up", "delivered", "cancelled", "failed"],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "picked_up",
        "delivered",
        "cancelled",
      ],
      pasugo_booking_status: [
        "requested",
        "finding_rider",
        "accepted",
        "rider_arriving",
        "picked_up",
        "on_the_way",
        "delivered",
        "completed",
        "cancelled",
        "failed",
      ],
      payment_method: ["cod", "gcash", "wallet", "maya", "card", "bank_transfer", "qrph"],
      payment_status: ["pending", "processing", "succeeded", "failed", "expired", "refunded"],
      seller_business_type: ["registered", "home_based"],
      store_verification_status: ["pending", "verified", "suspended", "rejected"],
      topup_status: ["pending", "approved", "rejected", "cancelled"],
      wallet_type: ["seller", "rider"],
    },
  },
} as const;

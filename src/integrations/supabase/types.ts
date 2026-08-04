export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
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
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          after_data: Json | null;
          before_data: Json | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          ip_address: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          ip_address?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          ip_address?: string | null;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          name: string;
          service_type: string;
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
          service_type?: string;
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
          service_type?: string;
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
      dispatch_jobs: {
        Row: {
          assigned_at: string | null;
          assigned_rider_id: string | null;
          attempt: number;
          created_at: string;
          delivered_at: string | null;
          delivery_fee: number;
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
          delivered_at?: string | null;
          delivery_fee?: number;
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
          delivered_at?: string | null;
          delivery_fee?: number;
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
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          kind?: string;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          kind?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          created_at: string;
          id: string;
          order_id: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
          unit_price: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          order_id: string;
          product_id?: string | null;
          product_name: string;
          quantity?: number;
          unit_price?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
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
          notes: string | null;
          payment_method: Database["public"]["Enums"]["payment_method"];
          payment_status: Database["public"]["Enums"]["payment_status"];
          rider_commission: number;
          rider_id: string | null;
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
          notes?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          payment_status?: Database["public"]["Enums"]["payment_status"];
          rider_commission?: number;
          rider_id?: string | null;
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
          notes?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          payment_status?: Database["public"]["Enums"]["payment_status"];
          rider_commission?: number;
          rider_id?: string | null;
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
          account_status: Database["public"]["Enums"]["account_status"];
          accepted_terms: boolean;
          accepted_terms_at: string | null;
          avatar_url: string | null;
          city: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          privacy_version: string | null;
          phone: string | null;
          status_changed_at: string | null;
          status_note: string | null;
          terms_version: string | null;
          updated_at: string;
        };
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"];
          accepted_terms?: boolean;
          accepted_terms_at?: string | null;
          avatar_url?: string | null;
          city?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          privacy_version?: string | null;
          phone?: string | null;
          status_changed_at?: string | null;
          status_note?: string | null;
          terms_version?: string | null;
          updated_at?: string;
        };
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"];
          accepted_terms?: boolean;
          accepted_terms_at?: string | null;
          avatar_url?: string | null;
          city?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          privacy_version?: string | null;
          phone?: string | null;
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
          product_id: string | null;
          rating: number;
          store_id: string | null;
          user_id: string;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          id?: string;
          product_id?: string | null;
          rating?: number;
          store_id?: string | null;
          user_id: string;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          id?: string;
          product_id?: string | null;
          rating?: number;
          store_id?: string | null;
          user_id?: string;
        };
        Relationships: [
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
          privacy_version: string | null;
          personal_info: Json;
          review_notes: string | null;
          reviewed_at: string | null;
          status: Database["public"]["Enums"]["application_status"];
          terms_version: string | null;
          updated_at: string;
          user_id: string;
          vehicle_info: Json;
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
          privacy_version?: string | null;
          personal_info?: Json;
          review_notes?: string | null;
          reviewed_at?: string | null;
          status?: Database["public"]["Enums"]["application_status"];
          terms_version?: string | null;
          updated_at?: string;
          user_id: string;
          vehicle_info?: Json;
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
          privacy_version?: string | null;
          personal_info?: Json;
          review_notes?: string | null;
          reviewed_at?: string | null;
          status?: Database["public"]["Enums"]["application_status"];
          terms_version?: string | null;
          updated_at?: string;
          user_id?: string;
          vehicle_info?: Json;
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
      admin_bootstrap_available: { Args: never; Returns: boolean };
      admin_portal_approve_topup: {
        Args: { _notes?: string; _topup_id: string };
        Returns: string;
      };
      admin_portal_reject_topup: {
        Args: { _reason: string; _topup_id: string };
        Returns: boolean;
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
      claim_first_admin: { Args: never; Returns: boolean };
      dispatch_accept: { Args: { _job_id: string }; Returns: Json };
      dispatch_advance: {
        Args: { _job_id: string; _step: string };
        Returns: boolean;
      };
      dispatch_broadcast: { Args: { _job_id: string }; Returns: number };
      dispatch_decline: { Args: { _job_id: string }; Returns: boolean };
      dispatch_retry: { Args: { _job_id: string }; Returns: boolean };
      dispatch_settings: { Args: never; Returns: Json };
      dispatch_start: { Args: { _order_id: string }; Returns: string };
      minimum_wallet_balance_for_role: { Args: { _role: string }; Returns: number };
      store_set_online: { Args: { _store_id: string; _online: boolean }; Returns: boolean };
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
      reject_wallet_topup: {
        Args: { _reason: string; _topup_id: string };
        Returns: boolean;
      };
      rider_set_presence: {
        Args: { _lat?: number; _lng?: number; _online: boolean };
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
      payment_method: ["cod", "gcash", "wallet", "maya", "card", "bank_transfer", "qrph"],
      payment_status: ["pending", "processing", "succeeded", "failed", "expired", "refunded"],
      seller_business_type: ["registered", "home_based"],
      store_verification_status: ["pending", "verified", "suspended", "rejected"],
      topup_status: ["pending", "approved", "rejected", "cancelled"],
      wallet_type: ["seller", "rider"],
    },
  },
} as const;

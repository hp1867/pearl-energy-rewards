export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      campaign_awards: {
        Row: {
          applied_transaction_id: string | null
          bonus_points: number
          campaign_id: string
          campaign_version: number
          coupon_id: string | null
          created_at: string
          customer_id: string
          id: string
          prize: Json
          reversed_points: number
          revoked: boolean
          source_transaction_id: string
        }
        Insert: {
          applied_transaction_id?: string | null
          bonus_points?: number
          campaign_id: string
          campaign_version: number
          coupon_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          prize: Json
          reversed_points?: number
          revoked?: boolean
          source_transaction_id: string
        }
        Update: {
          applied_transaction_id?: string | null
          bonus_points?: number
          campaign_id?: string
          campaign_version?: number
          coupon_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          prize?: Json
          reversed_points?: number
          revoked?: boolean
          source_transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_awards_applied_transaction_id_fkey"
            columns: ["applied_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_awards_campaign_id_campaign_version_fkey"
            columns: ["campaign_id", "campaign_version"]
            isOneToOne: false
            referencedRelation: "campaign_rule_versions"
            referencedColumns: ["campaign_id", "version"]
          },
          {
            foreignKeyName: "campaign_awards_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_awards_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_awards_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_awards_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_rule_versions: {
        Row: {
          active: boolean
          campaign_id: string
          config: Json
          created_at: string
          effective_from: string
          version: number
        }
        Insert: {
          active: boolean
          campaign_id: string
          config: Json
          created_at?: string
          effective_from: string
          version: number
        }
        Update: {
          active?: boolean
          campaign_id?: string
          config?: Json
          created_at?: string
          effective_from?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_rule_versions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          active: boolean
          config: Json
          id: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          config: Json
          id: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          config?: Json
          id?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      catalog_items: {
        Row: {
          active: boolean
          category_id: string | null
          category_kind: string | null
          data: Json
          ends_at: string | null
          id: string
          in_stock: boolean
          kind: string
          points_cost: number | null
          price_cents: number | null
          starts_at: string | null
          title: string
          unit_price_micros: number | null
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          category_kind?: string | null
          data?: Json
          ends_at?: string | null
          id: string
          in_stock?: boolean
          kind: string
          points_cost?: number | null
          price_cents?: number | null
          starts_at?: string | null
          title: string
          unit_price_micros?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          category_id?: string | null
          category_kind?: string | null
          data?: Json
          ends_at?: string | null
          id?: string
          in_stock?: boolean
          kind?: string
          points_cost?: number | null
          price_cents?: number | null
          starts_at?: string | null
          title?: string
          unit_price_micros?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_category_kind_category_id_fkey"
            columns: ["category_kind", "category_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["kind", "id"]
          },
        ]
      }
      consent_events: {
        Row: {
          actor_user_id: string
          customer_id: string
          decision: string
          id: number
          policy_kind: string
          policy_version: string
          purpose: string
          recorded_at: string
        }
        Insert: {
          actor_user_id: string
          customer_id: string
          decision: string
          id?: never
          policy_kind: string
          policy_version: string
          purpose: string
          recorded_at?: string
        }
        Update: {
          actor_user_id?: string
          customer_id?: string
          decision?: string
          id?: never
          policy_kind?: string
          policy_version?: string
          purpose?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_events_policy_kind_policy_version_fkey"
            columns: ["policy_kind", "policy_version"]
            isOneToOne: false
            referencedRelation: "policy_versions"
            referencedColumns: ["kind", "version"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          created_at: string
          discount_cents: number
          line_id: string
          quantity_milli: number
          rule_id: string
          transaction_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          discount_cents: number
          line_id: string
          quantity_milli: number
          rule_id: string
          transaction_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          discount_cents?: number
          line_id?: string
          quantity_milli?: number
          rule_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: true
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "reward_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_transaction_id_line_id_fkey"
            columns: ["transaction_id", "line_id"]
            isOneToOne: false
            referencedRelation: "transaction_items"
            referencedColumns: ["transaction_id", "line_id"]
          },
        ]
      }
      coupons: {
        Row: {
          cost_points: number
          customer_id: string
          display: Json
          expires_at: string
          held_for_transaction_id: string | null
          id: string
          issued_at: string
          reward_id: string | null
          reward_kind: string
          rule_id: string | null
          status: string
          title: string
          used_at: string | null
          used_transaction_id: string | null
        }
        Insert: {
          cost_points: number
          customer_id: string
          display?: Json
          expires_at?: string
          held_for_transaction_id?: string | null
          id?: string
          issued_at?: string
          reward_id?: string | null
          reward_kind?: string
          rule_id?: string | null
          status?: string
          title: string
          used_at?: string | null
          used_transaction_id?: string | null
        }
        Update: {
          cost_points?: number
          customer_id?: string
          display?: Json
          expires_at?: string
          held_for_transaction_id?: string | null
          id?: string
          issued_at?: string
          reward_id?: string | null
          reward_kind?: string
          rule_id?: string | null
          status?: string
          title?: string
          used_at?: string | null
          used_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_held_for_transaction_id_fkey"
            columns: ["held_for_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_reward_kind_reward_id_fkey"
            columns: ["reward_kind", "reward_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["kind", "id"]
          },
          {
            foreignKeyName: "coupons_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "reward_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_used_transaction_id_fkey"
            columns: ["used_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          auth_user_id: string | null
          created_at: string
          customer_number: number
          dob: string | null
          first_name: string
          id: string
          last_name: string
          membership_code: string
          mobile: string
          preferences: Json
          schema_version: number
          status: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          customer_number?: never
          dob?: string | null
          first_name?: string
          id?: string
          last_name?: string
          membership_code?: string
          mobile?: string
          preferences?: Json
          schema_version?: number
          status?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          customer_number?: never
          dob?: string | null
          first_name?: string
          id?: string
          last_name?: string
          membership_code?: string
          mobile?: string
          preferences?: Json
          schema_version?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_accounts: {
        Row: {
          balance: number
          customer_id: string
          lifetime_points: number
          updated_at: string
          version: number
        }
        Insert: {
          balance?: number
          customer_id: string
          lifetime_points?: number
          updated_at?: string
          version?: number
        }
        Update: {
          balance?: number
          customer_id?: string
          lifetime_points?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_ledger: {
        Row: {
          actor_user_id: string | null
          balance_after: number
          created_at: string
          customer_id: string
          delta: number
          entry_type: string
          id: string
          lifetime_delta: number
          operation_key: string
          reason: string
          transaction_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          balance_after: number
          created_at?: string
          customer_id: string
          delta: number
          entry_type: string
          id?: string
          lifetime_delta?: number
          operation_key: string
          reason: string
          transaction_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          balance_after?: number
          created_at?: string
          customer_id?: string
          delta?: number
          entry_type?: string
          id?: string
          lifetime_delta?: number
          operation_key?: string
          reason?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "loyalty_ledger_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_programs: {
        Row: {
          active: boolean
          created_at: string
          effective_from: string
          excluded_categories: string[]
          id: string
          points_denominator: number
          points_numerator: number
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          effective_from?: string
          excluded_categories: string[]
          id: string
          points_denominator: number
          points_numerator: number
          version: number
        }
        Update: {
          active?: boolean
          created_at?: string
          effective_from?: string
          excluded_categories?: string[]
          id?: string
          points_denominator?: number
          points_numerator?: number
          version?: number
        }
        Relationships: []
      }
      mission_contributions: {
        Row: {
          customer_id: string
          cycle_id: string
          revoked: boolean
          transaction_id: string
        }
        Insert: {
          customer_id: string
          cycle_id: string
          revoked?: boolean
          transaction_id: string
        }
        Update: {
          customer_id?: string
          cycle_id?: string
          revoked?: boolean
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_contributions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_contributions_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "mission_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_contributions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_cycles: {
        Row: {
          award_id: string | null
          campaign_id: string
          campaign_version: number
          customer_id: string
          ends_at: string
          id: string
          starts_at: string
        }
        Insert: {
          award_id?: string | null
          campaign_id?: string
          campaign_version?: number
          customer_id: string
          ends_at: string
          id?: string
          starts_at: string
        }
        Update: {
          award_id?: string | null
          campaign_id?: string
          campaign_version?: number
          customer_id?: string
          ends_at?: string
          id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_cycles_award_id_fkey"
            columns: ["award_id"]
            isOneToOne: false
            referencedRelation: "campaign_awards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_cycles_campaign_id_campaign_version_fkey"
            columns: ["campaign_id", "campaign_version"]
            isOneToOne: false
            referencedRelation: "campaign_rule_versions"
            referencedColumns: ["campaign_id", "version"]
          },
          {
            foreignKeyName: "mission_cycles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      night_deals: {
        Row: {
          business_date: string
          created_at: string
          created_by: string | null
          deal_price_cents: number
          description: string
          id: string
          img: string
          original_price_cents: number
          product_id: string | null
          product_kind: string
          product_name: string
          quantity_available: number
          safety_cutoff_at: string
          sell_until: string
          starts_at: string
          station_id: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          business_date: string
          created_at?: string
          created_by?: string | null
          deal_price_cents: number
          description?: string
          id?: string
          img?: string
          original_price_cents: number
          product_id?: string | null
          product_kind?: string
          product_name: string
          quantity_available: number
          safety_cutoff_at: string
          sell_until: string
          starts_at: string
          station_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          business_date?: string
          created_at?: string
          created_by?: string | null
          deal_price_cents?: number
          description?: string
          id?: string
          img?: string
          original_price_cents?: number
          product_id?: string | null
          product_kind?: string
          product_name?: string
          quantity_available?: number
          safety_cutoff_at?: string
          sell_until?: string
          starts_at?: string
          station_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "night_deals_product_kind_product_id_fkey"
            columns: ["product_kind", "product_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["kind", "id"]
          },
          {
            foreignKeyName: "night_deals_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_versions: {
        Row: {
          body: string
          kind: string
          published_at: string
          published_by: string | null
          version: string
        }
        Insert: {
          body: string
          kind: string
          published_at?: string
          published_by?: string | null
          version: string
        }
        Update: {
          body?: string
          kind?: string
          published_at?: string
          published_by?: string | null
          version?: string
        }
        Relationships: []
      }
      reward_rule_products: {
        Row: {
          product_id: string
          product_kind: string
          rule_id: string
        }
        Insert: {
          product_id: string
          product_kind: string
          rule_id: string
        }
        Update: {
          product_id?: string
          product_kind?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_rule_products_product_kind_product_id_fkey"
            columns: ["product_kind", "product_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["kind", "id"]
          },
          {
            foreignKeyName: "reward_rule_products_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "reward_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_rules: {
        Row: {
          allow_stacking: boolean
          created_at: string
          created_by: string | null
          discount_kind: string
          discount_value: number
          effective_from: string
          enabled: boolean
          id: string
          max_discount_cents: number
          max_quantity_milli: number
          minimum_spend_cents: number
          name: string
          reward_id: string | null
          reward_kind: string
          station_ids: string[]
          version: number
        }
        Insert: {
          allow_stacking?: boolean
          created_at?: string
          created_by?: string | null
          discount_kind: string
          discount_value: number
          effective_from: string
          enabled?: boolean
          id?: string
          max_discount_cents: number
          max_quantity_milli?: number
          minimum_spend_cents?: number
          name: string
          reward_id?: string | null
          reward_kind?: string
          station_ids?: string[]
          version: number
        }
        Update: {
          allow_stacking?: boolean
          created_at?: string
          created_by?: string | null
          discount_kind?: string
          discount_value?: number
          effective_from?: string
          enabled?: boolean
          id?: string
          max_discount_cents?: number
          max_quantity_milli?: number
          minimum_spend_cents?: number
          name?: string
          reward_id?: string | null
          reward_kind?: string
          station_ids?: string[]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reward_rules_reward_kind_reward_id_fkey"
            columns: ["reward_kind", "reward_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["kind", "id"]
          },
        ]
      }
      stations: {
        Row: {
          active: boolean
          city: string
          data: Json
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          state: string
          timezone: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          city?: string
          data?: Json
          id: string
          latitude?: number | null
          longitude?: number | null
          name: string
          state?: string
          timezone?: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          city?: string
          data?: Json
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          state?: string
          timezone?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      transaction_items: {
        Row: {
          category: string
          description: string
          eligible_for_points: boolean
          fuel_grade: string | null
          line_id: string
          litres_milli: number | null
          mapping_id: string | null
          original_line_id: string | null
          quantity_milli: number
          sku: string | null
          total_cents: number
          transaction_id: string
          unit_price_micros: number
        }
        Insert: {
          category: string
          description: string
          eligible_for_points: boolean
          fuel_grade?: string | null
          line_id: string
          litres_milli?: number | null
          mapping_id?: string | null
          original_line_id?: string | null
          quantity_milli: number
          sku?: string | null
          total_cents: number
          transaction_id: string
          unit_price_micros: number
        }
        Update: {
          category?: string
          description?: string
          eligible_for_points?: boolean
          fuel_grade?: string | null
          line_id?: string
          litres_milli?: number | null
          mapping_id?: string | null
          original_line_id?: string | null
          quantity_milli?: number
          sku?: string | null
          total_cents?: number
          transaction_id?: string
          unit_price_micros?: number
        }
        Relationships: [
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_night_deals: {
        Row: {
          deal_price_cents: number
          line_id: string | null
          night_deal_id: string
          quantity: number
          transaction_id: string
        }
        Insert: {
          deal_price_cents: number
          line_id?: string | null
          night_deal_id: string
          quantity: number
          transaction_id: string
        }
        Update: {
          deal_price_cents?: number
          line_id?: string | null
          night_deal_id?: string
          quantity?: number
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_night_deals_night_deal_id_fkey"
            columns: ["night_deal_id"]
            isOneToOne: false
            referencedRelation: "night_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_night_deals_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_night_deals_transaction_id_line_id_fkey"
            columns: ["transaction_id", "line_id"]
            isOneToOne: false
            referencedRelation: "transaction_items"
            referencedColumns: ["transaction_id", "line_id"]
          },
        ]
      }
      transaction_payments: {
        Row: {
          amount_cents: number
          method: string
          ordinal: number
          transaction_id: string
        }
        Insert: {
          amount_cents: number
          method: string
          ordinal: number
          transaction_id: string
        }
        Update: {
          amount_cents?: number
          method?: string
          ordinal?: number
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          business_date: string
          created_at: string
          currency: string
          customer_id: string | null
          eligible_cents: number
          event_type: string
          external_id: string
          id: string
          integration_id: string
          occurred_at: string
          original_transaction_id: string | null
          payload_hash: string
          points_delta: number
          program_id: string
          program_version: number
          receipt_number: string
          schema_version: number
          station_id: string
          subtotal_cents: number
          tax_cents: number
          terminal_id: string
          total_cents: number
        }
        Insert: {
          business_date: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          eligible_cents: number
          event_type: string
          external_id: string
          id?: string
          integration_id: string
          occurred_at: string
          original_transaction_id?: string | null
          payload_hash: string
          points_delta: number
          program_id: string
          program_version: number
          receipt_number: string
          schema_version?: number
          station_id: string
          subtotal_cents: number
          tax_cents: number
          terminal_id: string
          total_cents: number
        }
        Update: {
          business_date?: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          eligible_cents?: number
          event_type?: string
          external_id?: string
          id?: string
          integration_id?: string
          occurred_at?: string
          original_transaction_id?: string | null
          payload_hash?: string
          points_delta?: number
          program_id?: string
          program_version?: number
          receipt_number?: string
          schema_version?: number
          station_id?: string
          subtotal_cents?: number
          tax_cents?: number
          terminal_id?: string
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_original_transaction_id_fkey"
            columns: ["original_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_program_id_program_version_fkey"
            columns: ["program_id", "program_version"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id", "version"]
          },
          {
            foreignKeyName: "transactions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      wheel_credits: {
        Row: {
          award_id: string | null
          campaign_id: string
          campaign_version: number
          created_at: string
          customer_id: string
          id: string
          state: string
          transaction_id: string
        }
        Insert: {
          award_id?: string | null
          campaign_id?: string
          campaign_version?: number
          created_at?: string
          customer_id: string
          id?: string
          state?: string
          transaction_id: string
        }
        Update: {
          award_id?: string | null
          campaign_id?: string
          campaign_version?: number
          created_at?: string
          customer_id?: string
          id?: string
          state?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wheel_credits_award_id_fkey"
            columns: ["award_id"]
            isOneToOne: false
            referencedRelation: "campaign_awards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wheel_credits_campaign_id_campaign_version_fkey"
            columns: ["campaign_id", "campaign_version"]
            isOneToOne: false
            referencedRelation: "campaign_rule_versions"
            referencedColumns: ["campaign_id", "version"]
          },
          {
            foreignKeyName: "wheel_credits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wheel_credits_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_points: {
        Args: {
          p_customer_id: string
          p_delta: number
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      admin_customers: {
        Args: { p_offset?: number; p_search?: string }
        Returns: Json
      }
      admin_database_action: {
        Args: { p_action: string; p_input: Json; p_request_id: string }
        Returns: Json
      }
      admin_database_overview: { Args: never; Returns: Json }
      admin_summary: { Args: never; Returns: Json }
      archive_catalog: {
        Args: { p_id: string; p_kind: string }
        Returns: undefined
      }
      begin_member_recovery: {
        Args: { p_customer_id: string; p_request_id: string }
        Returns: Json
      }
      campaign_status: { Args: never; Returns: Json }
      claim_push_batch: { Args: never; Returns: Json }
      close_my_account: {
        Args: { p_confirmation: string; p_disclosure_version: string }
        Returns: undefined
      }
      complete_registration: { Args: { p_versions: Json }; Returns: string }
      database_contract: { Args: never; Returns: Json }
      ensure_profile: { Args: { p_fields?: Json }; Returns: string }
      finish_member_recovery: {
        Args: { p_error_code: string; p_request_id: string; p_success: boolean }
        Returns: undefined
      }
      finish_push: {
        Args: {
          p_attempt: number
          p_gone?: boolean
          p_id: string
          p_success: boolean
        }
        Returns: undefined
      }
      ingest_pos: {
        Args: {
          p_event: Json
          p_integration_id: string
          p_payload_hash: string
        }
        Returns: Json
      }
      list_staff: { Args: never; Returns: Json }
      manage_campaign: {
        Args: { p_active: boolean; p_id: string }
        Returns: undefined
      }
      manage_staff: { Args: { p_input: Json }; Returns: Json }
      member_onboarding: { Args: never; Returns: Json }
      pos_member: {
        Args: { p_integration_id: string; p_membership_code: string }
        Returns: Json
      }
      pos_receipt_status: {
        Args: {
          p_event_type: string
          p_external_id: string
          p_integration_id: string
        }
        Returns: Json
      }
      process_pos: {
        Args: { p_inbox_id: string; p_integration_id: string }
        Returns: Json
      }
      promotion_reviews: { Args: never; Returns: Json }
      publish_policy: {
        Args: { p_body: string; p_kind: string; p_version: string }
        Returns: undefined
      }
      receipt_processing_status: {
        Args: { p_transaction_id: string }
        Returns: Json
      }
      record_pos: {
        Args: {
          p_event: Json
          p_integration_id: string
          p_payload_hash: string
        }
        Returns: Json
      }
      redeem_reward: {
        Args: { p_request_id: string; p_reward_id: string }
        Returns: Json
      }
      register_push_device: {
        Args: { p_subscription: Json }
        Returns: undefined
      }
      resolve_promotion_review: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      save_catalog: { Args: { p_item: Json; p_kind: string }; Returns: string }
      set_marketing_consent: {
        Args: { p_accepted: boolean; p_request_id: string }
        Returns: undefined
      }
      spin_wheel: { Args: { p_request_id: string }; Returns: Json }
      staff_session: { Args: never; Returns: Json }
      submit_pos_reconciliation: {
        Args: {
          p_business_date: string
          p_integration_id: string
          p_receipts: Json
        }
        Returns: Json
      }
      unregister_push_device: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      update_profile: { Args: { p_fields: Json }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

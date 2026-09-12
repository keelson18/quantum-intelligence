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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_models: {
        Row: {
          architecture: string
          created_at: string
          hyperparams: Json
          id: string
          input_features: string[]
          metrics: Json
          name: string
          output_classes: string[]
          status: string
          trained_at: string | null
          user_id: string
        }
        Insert: {
          architecture: string
          created_at?: string
          hyperparams?: Json
          id?: string
          input_features?: string[]
          metrics?: Json
          name: string
          output_classes?: string[]
          status?: string
          trained_at?: string | null
          user_id?: string
        }
        Update: {
          architecture?: string
          created_at?: string
          hyperparams?: Json
          id?: string
          input_features?: string[]
          metrics?: Json
          name?: string
          output_classes?: string[]
          status?: string
          trained_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_predictions: {
        Row: {
          confidence: number
          created_at: string
          id: string
          input: Json
          model_id: string | null
          output: Json
          symbol: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          input?: Json
          model_id?: string | null
          output?: Json
          symbol: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          input?: Json
          model_id?: string | null
          output?: Json
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_predictions_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ai_models"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_training_data: {
        Row: {
          created_at: string
          features: Json
          id: string
          label: number
          label_type: string
          source: string
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          features?: Json
          id?: string
          label?: number
          label_type?: string
          source?: string
          symbol: string
          user_id?: string
        }
        Update: {
          created_at?: string
          features?: Json
          id?: string
          label?: number
          label_type?: string
          source?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      alert_rules: {
        Row: {
          condition: string
          created_at: string | null
          enabled: boolean
          id: string
          message: string
          metadata: Json | null
          severity: string
          symbol: string
          threshold: number | null
          triggered_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          condition?: string
          created_at?: string | null
          enabled?: boolean
          id?: string
          message?: string
          metadata?: Json | null
          severity?: string
          symbol: string
          threshold?: number | null
          triggered_at?: string | null
          type: string
          user_id?: string
        }
        Update: {
          condition?: string
          created_at?: string | null
          enabled?: boolean
          id?: string
          message?: string
          metadata?: Json | null
          severity?: string
          symbol?: string
          threshold?: number | null
          triggered_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          created_at: string
          id: string
          message: string
          metadata: Json
          read: boolean
          severity: string
          symbol: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          metadata?: Json
          read?: boolean
          severity?: string
          symbol: string
          type: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          metadata?: Json
          read?: boolean
          severity?: string
          symbol?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      analysis_runs: {
        Row: {
          action: string
          confidence: number
          context_id: string
          contradictions: Json
          created_at: string
          data_quality_score: number
          engine_versions: Json
          explanation: Json | null
          id: string
          position_multiplier: number
          raw_confidence: number
          reasons: Json
          risk_violations: Json
          symbol: string
          timeframe: string
          user_id: string
        }
        Insert: {
          action: string
          confidence?: number
          context_id: string
          contradictions?: Json
          created_at?: string
          data_quality_score?: number
          engine_versions?: Json
          explanation?: Json | null
          id?: string
          position_multiplier?: number
          raw_confidence?: number
          reasons?: Json
          risk_violations?: Json
          symbol: string
          timeframe: string
          user_id: string
        }
        Update: {
          action?: string
          confidence?: number
          context_id?: string
          contradictions?: Json
          created_at?: string
          data_quality_score?: number
          engine_versions?: Json
          explanation?: Json | null
          id?: string
          position_multiplier?: number
          raw_confidence?: number
          reasons?: Json
          risk_violations?: Json
          symbol?: string
          timeframe?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json
          resource: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource?: string
          user_id?: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource?: string
          user_id?: string
        }
        Relationships: []
      }
      backtest_results: {
        Row: {
          created_at: string
          id: string
          last_run: string
          metrics: Json
          monte_carlo: Json
          strategy: string
          symbol: string
          timeframe: string
          user_id: string | null
          walk_forward: Json
        }
        Insert: {
          created_at?: string
          id?: string
          last_run?: string
          metrics?: Json
          monte_carlo?: Json
          strategy: string
          symbol: string
          timeframe: string
          user_id?: string | null
          walk_forward?: Json
        }
        Update: {
          created_at?: string
          id?: string
          last_run?: string
          metrics?: Json
          monte_carlo?: Json
          strategy?: string
          symbol?: string
          timeframe?: string
          user_id?: string | null
          walk_forward?: Json
        }
        Relationships: []
      }
      data_quality_events: {
        Row: {
          code: string
          created_at: string
          detail: string | null
          id: string
          occurrences: number
          quality_score: number
          severity: string
          symbol: string
          timeframe: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          detail?: string | null
          id?: string
          occurrences?: number
          quality_score?: number
          severity: string
          symbol: string
          timeframe: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          detail?: string | null
          id?: string
          occurrences?: number
          quality_score?: number
          severity?: string
          symbol?: string
          timeframe?: string
          user_id?: string
        }
        Relationships: []
      }
      engine_results: {
        Row: {
          confidence: number
          created_at: string
          engine_name: string
          engine_version: string
          evidence: Json
          id: string
          input_context_id: string
          latency_ms: number
          run_id: string
          status: string
          user_id: string
          warnings: Json
        }
        Insert: {
          confidence?: number
          created_at?: string
          engine_name: string
          engine_version: string
          evidence?: Json
          id?: string
          input_context_id: string
          latency_ms?: number
          run_id: string
          status: string
          user_id: string
          warnings?: Json
        }
        Update: {
          confidence?: number
          created_at?: string
          engine_name?: string
          engine_version?: string
          evidence?: Json
          id?: string
          input_context_id?: string
          latency_ms?: number
          run_id?: string
          status?: string
          user_id?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "engine_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_events: {
        Row: {
          created_at: string
          event_type: string
          fees: number
          fill_price: number | null
          id: string
          metadata: Json
          position_id: string | null
          quantity: number | null
          reason: string | null
          requested_price: number | null
          side: string | null
          slippage: number
          symbol: string
          trade_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          fees?: number
          fill_price?: number | null
          id?: string
          metadata?: Json
          position_id?: string | null
          quantity?: number | null
          reason?: string | null
          requested_price?: number | null
          side?: string | null
          slippage?: number
          symbol: string
          trade_id?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          fees?: number
          fill_price?: number | null
          id?: string
          metadata?: Json
          position_id?: string | null
          quantity?: number | null
          reason?: string | null
          requested_price?: number | null
          side?: string | null
          slippage?: number
          symbol?: string
          trade_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          created_at: string | null
          id: string
          lessons_learned: string
          mood: string | null
          notes: string
          screenshot_url: string | null
          symbol: string
          tags: string[] | null
          title: string
          trade_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          lessons_learned?: string
          mood?: string | null
          notes?: string
          screenshot_url?: string | null
          symbol: string
          tags?: string[] | null
          title?: string
          trade_id?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          lessons_learned?: string
          mood?: string | null
          notes?: string
          screenshot_url?: string | null
          symbol?: string
          tags?: string[] | null
          title?: string
          trade_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ml_predictions: {
        Row: {
          confidence: string
          created_at: string
          expected_move_pct: number
          id: string
          model_version: string
          payload: Json
          prediction: string
          probability: number
          symbol: string
          timeframe: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          expected_move_pct?: number
          id?: string
          model_version: string
          payload?: Json
          prediction: string
          probability: number
          symbol: string
          timeframe: string
        }
        Update: {
          confidence?: string
          created_at?: string
          expected_move_pct?: number
          id?: string
          model_version?: string
          payload?: Json
          prediction?: string
          probability?: number
          symbol?: string
          timeframe?: string
        }
        Relationships: []
      }
      news_items: {
        Row: {
          created_at: string
          headline: string
          id: string
          published_at: string
          sentiment: string
          sentiment_score: number
          source: string
          summary: string
          symbols: string[]
          url: string | null
        }
        Insert: {
          created_at?: string
          headline: string
          id?: string
          published_at?: string
          sentiment?: string
          sentiment_score?: number
          source?: string
          summary?: string
          symbols?: string[]
          url?: string | null
        }
        Update: {
          created_at?: string
          headline?: string
          id?: string
          published_at?: string
          sentiment?: string
          sentiment_score?: number
          source?: string
          summary?: string
          symbols?: string[]
          url?: string | null
        }
        Relationships: []
      }
      paper_positions: {
        Row: {
          ai_confidence: number | null
          close_price: number | null
          closed_at: string | null
          created_at: string | null
          entry_price: number
          fees: number
          id: string
          label: string
          limit_price: number | null
          notes: string | null
          opened_at: string | null
          order_type: string
          pnl: number | null
          pnl_pct: number | null
          quantity: number
          requested_price: number | null
          side: string
          slippage: number
          status: string
          stop_loss: number | null
          strategy: string | null
          symbol: string
          take_profit: number | null
          trailing_stop_pct: number | null
          user_id: string
        }
        Insert: {
          ai_confidence?: number | null
          close_price?: number | null
          closed_at?: string | null
          created_at?: string | null
          entry_price?: number
          fees?: number
          id?: string
          label: string
          limit_price?: number | null
          notes?: string | null
          opened_at?: string | null
          order_type?: string
          pnl?: number | null
          pnl_pct?: number | null
          quantity?: number
          requested_price?: number | null
          side?: string
          slippage?: number
          status?: string
          stop_loss?: number | null
          strategy?: string | null
          symbol: string
          take_profit?: number | null
          trailing_stop_pct?: number | null
          user_id?: string
        }
        Update: {
          ai_confidence?: number | null
          close_price?: number | null
          closed_at?: string | null
          created_at?: string | null
          entry_price?: number
          fees?: number
          id?: string
          label?: string
          limit_price?: number | null
          notes?: string | null
          opened_at?: string | null
          order_type?: string
          pnl?: number | null
          pnl_pct?: number | null
          quantity?: number
          requested_price?: number | null
          side?: string
          slippage?: number
          status?: string
          stop_loss?: number | null
          strategy?: string | null
          symbol?: string
          take_profit?: number | null
          trailing_stop_pct?: number | null
          user_id?: string
        }
        Relationships: []
      }
      paper_trades: {
        Row: {
          ai_confidence: number | null
          created_at: string | null
          entry_price: number
          entry_time: string | null
          exit_price: number
          exit_reason: string
          exit_time: string | null
          fees: number
          gross_pnl: number | null
          hold_duration_hours: number | null
          id: string
          label: string
          pnl: number
          pnl_pct: number
          quantity: number
          side: string
          slippage: number
          strategy: string | null
          symbol: string
          user_id: string
        }
        Insert: {
          ai_confidence?: number | null
          created_at?: string | null
          entry_price?: number
          entry_time?: string | null
          exit_price?: number
          exit_reason?: string
          exit_time?: string | null
          fees?: number
          gross_pnl?: number | null
          hold_duration_hours?: number | null
          id?: string
          label: string
          pnl?: number
          pnl_pct?: number
          quantity?: number
          side: string
          slippage?: number
          strategy?: string | null
          symbol: string
          user_id?: string
        }
        Update: {
          ai_confidence?: number | null
          created_at?: string | null
          entry_price?: number
          entry_time?: string | null
          exit_price?: number
          exit_reason?: string
          exit_time?: string | null
          fees?: number
          gross_pnl?: number | null
          hold_duration_hours?: number | null
          id?: string
          label?: string
          pnl?: number
          pnl_pct?: number
          quantity?: number
          side?: string
          slippage?: number
          strategy?: string | null
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      performance_snapshots: {
        Row: {
          created_at: string
          id: string
          max_drawdown: number | null
          sharpe: number | null
          snapshot_at: string
          total_pnl: number
          user_id: string
          win_rate: number
        }
        Insert: {
          created_at?: string
          id?: string
          max_drawdown?: number | null
          sharpe?: number | null
          snapshot_at?: string
          total_pnl?: number
          user_id?: string
          win_rate?: number
        }
        Update: {
          created_at?: string
          id?: string
          max_drawdown?: number | null
          sharpe?: number | null
          snapshot_at?: string
          total_pnl?: number
          user_id?: string
          win_rate?: number
        }
        Relationships: []
      }
      positions: {
        Row: {
          closed_at: string | null
          created_at: string
          entry_price: number
          id: string
          opened_at: string
          side: string
          size: number
          status: string
          stop_loss: number | null
          symbol: string
          take_profit: number | null
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          entry_price: number
          id?: string
          opened_at?: string
          side: string
          size: number
          status?: string
          stop_loss?: number | null
          symbol: string
          take_profit?: number | null
          user_id?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          entry_price?: number
          id?: string
          opened_at?: string
          side?: string
          size?: number
          status?: string
          stop_loss?: number | null
          symbol?: string
          take_profit?: number | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          phone: string
        }
        Insert: {
          created_at?: string | null
          email?: string
          first_name?: string
          id: string
          last_name?: string
          phone?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          phone?: string
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          action: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      risk_state: {
        Row: {
          created_at: string
          current_exposure_pct: number
          daily_loss_used: number
          equity: number
          id: string
          max_daily_loss_pct: number
          max_drawdown_pct: number
          max_exposure_pct: number
          open_positions: Json
          peak_equity: number
          starting_equity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_exposure_pct?: number
          daily_loss_used?: number
          equity?: number
          id?: string
          max_daily_loss_pct?: number
          max_drawdown_pct?: number
          max_exposure_pct?: number
          open_positions?: Json
          peak_equity?: number
          starting_equity?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          current_exposure_pct?: number
          daily_loss_used?: number
          equity?: number
          id?: string
          max_daily_loss_pct?: number
          max_drawdown_pct?: number
          max_exposure_pct?: number
          open_positions?: Json
          peak_equity?: number
          starting_equity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategy_results: {
        Row: {
          confidence: number
          created_at: string
          id: string
          last_run: string
          payload: Json
          sample_size: number
          strategy: string
          symbol: string
          timeframe: string
          user_id: string | null
          win_rate: number
        }
        Insert: {
          confidence: number
          created_at?: string
          id?: string
          last_run?: string
          payload?: Json
          sample_size?: number
          strategy: string
          symbol: string
          timeframe: string
          user_id?: string | null
          win_rate: number
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          last_run?: string
          payload?: Json
          sample_size?: number
          strategy?: string
          symbol?: string
          timeframe?: string
          user_id?: string | null
          win_rate?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          plan: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      trade_logs: {
        Row: {
          closed_at: string | null
          confidence: number
          created_at: string
          entry: number
          exit: number | null
          explanation: Json
          id: string
          opened_at: string
          pnl: number
          pnl_pct: number
          regime: string | null
          side: string
          size: number
          status: string
          stop_loss: number | null
          strategy: string
          symbol: string
          take_profit: number | null
          timeframe: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          confidence?: number
          created_at?: string
          entry: number
          exit?: number | null
          explanation?: Json
          id?: string
          opened_at?: string
          pnl?: number
          pnl_pct?: number
          regime?: string | null
          side: string
          size?: number
          status?: string
          stop_loss?: number | null
          strategy: string
          symbol: string
          take_profit?: number | null
          timeframe: string
          user_id?: string
        }
        Update: {
          closed_at?: string | null
          confidence?: number
          created_at?: string
          entry?: number
          exit?: number | null
          explanation?: Json
          id?: string
          opened_at?: string
          pnl?: number
          pnl_pct?: number
          regime?: string | null
          side?: string
          size?: number
          status?: string
          stop_loss?: number | null
          strategy?: string
          symbol?: string
          take_profit?: number | null
          timeframe?: string
          user_id?: string
        }
        Relationships: []
      }
      trade_reviews: {
        Row: {
          created_at: string
          engine_version: string
          execution_assessment: string
          failure_class: string
          id: string
          lessons: string[]
          outcome: string
          r_multiple: number | null
          risk_assessment: string
          symbol: string
          thesis_assessment: string
          trade_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          engine_version?: string
          execution_assessment?: string
          failure_class: string
          id?: string
          lessons?: string[]
          outcome: string
          r_multiple?: number | null
          risk_assessment?: string
          symbol: string
          thesis_assessment?: string
          trade_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          engine_version?: string
          execution_assessment?: string
          failure_class?: string
          id?: string
          lessons?: string[]
          outcome?: string
          r_multiple?: number | null
          risk_assessment?: string
          symbol?: string
          thesis_assessment?: string
          trade_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          created_at: string
          executed_at: string
          fee: number
          id: string
          pnl: number
          price: number
          side: string
          size: number
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          executed_at?: string
          fee?: number
          id?: string
          pnl?: number
          price: number
          side: string
          size: number
          symbol: string
          user_id?: string
        }
        Update: {
          created_at?: string
          executed_at?: string
          fee?: number
          id?: string
          pnl?: number
          price?: number
          side?: string
          size?: number
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          default_timeframe: string
          id: string
          notif_ai_signals: boolean
          notif_price_alerts: boolean
          notif_risk_warnings: boolean
          notif_strategy_triggers: boolean
          risk_tolerance: string
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_timeframe?: string
          id?: string
          notif_ai_signals?: boolean
          notif_price_alerts?: boolean
          notif_risk_warnings?: boolean
          notif_strategy_triggers?: boolean
          risk_tolerance?: string
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          default_timeframe?: string
          id?: string
          notif_ai_signals?: boolean
          notif_price_alerts?: boolean
          notif_risk_warnings?: boolean
          notif_strategy_triggers?: boolean
          risk_tolerance?: string
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      watchlist_items: {
        Row: {
          added_at: string | null
          display_order: number
          id: string
          label: string
          market: string
          symbol: string
          watchlist_id: string
        }
        Insert: {
          added_at?: string | null
          display_order?: number
          id?: string
          label: string
          market?: string
          symbol: string
          watchlist_id: string
        }
        Update: {
          added_at?: string | null
          display_order?: number
          id?: string
          label?: string
          market?: string
          symbol?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_items_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_default: boolean
          name: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string | null
          id?: string
          is_default?: boolean
          name: string
          user_id?: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_default?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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

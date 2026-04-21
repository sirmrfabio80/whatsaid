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
      async_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          job_type: string
          resource_id: string | null
          resource_type: string | null
          resource_url: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type: string
          resource_id?: string | null
          resource_type?: string | null
          resource_url?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type?: string
          resource_id?: string | null
          resource_type?: string | null
          resource_url?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cleanup_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          errors: Json
          exports_deleted: number
          finished_at: string | null
          id: string
          job_name: string
          metadata: Json | null
          missing_prefixes: number
          shared_pdfs_deleted: number
          shared_pdfs_orphans_deleted: number
          started_at: string
          status: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          errors?: Json
          exports_deleted?: number
          finished_at?: string | null
          id?: string
          job_name: string
          metadata?: Json | null
          missing_prefixes?: number
          shared_pdfs_deleted?: number
          shared_pdfs_orphans_deleted?: number
          started_at?: string
          status?: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          errors?: Json
          exports_deleted?: number
          finished_at?: string | null
          id?: string
          job_name?: string
          metadata?: Json | null
          missing_prefixes?: number
          shared_pdfs_deleted?: number
          shared_pdfs_orphans_deleted?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      credit_balances: {
        Row: {
          balance: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          job_id: string | null
          reason: string
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          job_id?: string | null
          reason: string
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          job_id?: string | null
          reason?: string
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      help_faq_feedback: {
        Row: {
          created_at: string
          faq_anchor: string
          helpful: boolean
          id: string
          locale: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          faq_anchor: string
          helpful: boolean
          id?: string
          locale: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          faq_anchor?: string
          helpful?: boolean
          id?: string
          locale?: string
          user_id?: string | null
        }
        Relationships: []
      }
      job_output_variants: {
        Row: {
          content: string
          created_at: string
          id: string
          job_output_id: string
          language: string
          source_hash: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          job_output_id: string
          language: string
          source_hash?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          job_output_id?: string
          language?: string
          source_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_output_variants_job_output_id_fkey"
            columns: ["job_output_id"]
            isOneToOne: false
            referencedRelation: "job_outputs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_outputs: {
        Row: {
          content: string
          created_at: string
          custom_prompt: string | null
          id: string
          job_id: string
          metadata: Json | null
          output_type: string
          raw_response: Json | null
        }
        Insert: {
          content?: string
          created_at?: string
          custom_prompt?: string | null
          id?: string
          job_id: string
          metadata?: Json | null
          output_type: string
          raw_response?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          custom_prompt?: string | null
          id?: string
          job_id?: string
          metadata?: Json | null
          output_type?: string
          raw_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "job_outputs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_tags: {
        Row: {
          created_at: string
          id: string
          job_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_tags_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          assemblyai_delete_status: string | null
          assemblyai_transcript_id: string | null
          audio_channels: number | null
          audio_deleted_at: string | null
          created_at: string
          credits_charged: number
          duration_seconds: number | null
          error_message: string | null
          file_name: string
          file_size_bytes: number | null
          guest_email: string | null
          guest_token: string | null
          id: string
          language_detected: string | null
          language_selected: string | null
          location_label: string | null
          metadata_apple_creationdate: string | null
          metadata_file_lastmodified: string | null
          metadata_location_iso6709: string | null
          metadata_mvhd_creation: string | null
          output_language: string | null
          processing_stage: string | null
          question_generation_count: number
          recorded_at: string | null
          recorded_at_source: string | null
          regeneration_count: number
          short_summary: string | null
          speaker_names: Json
          speech_model: string | null
          status: Database["public"]["Enums"]["job_status"]
          stripe_payment_id: string | null
          summary_language: string | null
          summary_needs_regen: boolean
          summary_regen_count: number
          temp_file_path: string | null
          title: string | null
          transcription_config: Json | null
          updated_at: string
          user_id: string | null
          watchdog_retry_count: number
        }
        Insert: {
          assemblyai_delete_status?: string | null
          assemblyai_transcript_id?: string | null
          audio_channels?: number | null
          audio_deleted_at?: string | null
          created_at?: string
          credits_charged?: number
          duration_seconds?: number | null
          error_message?: string | null
          file_name: string
          file_size_bytes?: number | null
          guest_email?: string | null
          guest_token?: string | null
          id?: string
          language_detected?: string | null
          language_selected?: string | null
          location_label?: string | null
          metadata_apple_creationdate?: string | null
          metadata_file_lastmodified?: string | null
          metadata_location_iso6709?: string | null
          metadata_mvhd_creation?: string | null
          output_language?: string | null
          processing_stage?: string | null
          question_generation_count?: number
          recorded_at?: string | null
          recorded_at_source?: string | null
          regeneration_count?: number
          short_summary?: string | null
          speaker_names?: Json
          speech_model?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          stripe_payment_id?: string | null
          summary_language?: string | null
          summary_needs_regen?: boolean
          summary_regen_count?: number
          temp_file_path?: string | null
          title?: string | null
          transcription_config?: Json | null
          updated_at?: string
          user_id?: string | null
          watchdog_retry_count?: number
        }
        Update: {
          assemblyai_delete_status?: string | null
          assemblyai_transcript_id?: string | null
          audio_channels?: number | null
          audio_deleted_at?: string | null
          created_at?: string
          credits_charged?: number
          duration_seconds?: number | null
          error_message?: string | null
          file_name?: string
          file_size_bytes?: number | null
          guest_email?: string | null
          guest_token?: string | null
          id?: string
          language_detected?: string | null
          language_selected?: string | null
          location_label?: string | null
          metadata_apple_creationdate?: string | null
          metadata_file_lastmodified?: string | null
          metadata_location_iso6709?: string | null
          metadata_mvhd_creation?: string | null
          output_language?: string | null
          processing_stage?: string | null
          question_generation_count?: number
          recorded_at?: string | null
          recorded_at_source?: string | null
          regeneration_count?: number
          short_summary?: string | null
          speaker_names?: Json
          speech_model?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          stripe_payment_id?: string | null
          summary_language?: string | null
          summary_needs_regen?: boolean
          summary_regen_count?: number
          temp_file_path?: string | null
          title?: string | null
          transcription_config?: Json | null
          updated_at?: string
          user_id?: string | null
          watchdog_retry_count?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          async_job_id: string | null
          created_at: string
          description: string | null
          id: string
          read: boolean
          resource_id: string | null
          resource_type: string | null
          resource_url: string | null
          status: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          async_job_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          read?: boolean
          resource_id?: string | null
          resource_type?: string | null
          resource_url?: string | null
          status?: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          async_job_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          read?: boolean
          resource_id?: string | null
          resource_type?: string | null
          resource_url?: string | null
          status?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      pending_invites: {
        Row: {
          claimed: boolean
          claimed_at: string | null
          created_at: string
          credits: number
          email: string
          id: string
          invited_by: string
          language: string | null
          package_id: string
        }
        Insert: {
          claimed?: boolean
          claimed_at?: string | null
          created_at?: string
          credits: number
          email: string
          id?: string
          invited_by: string
          language?: string | null
          package_id: string
        }
        Update: {
          claimed?: boolean
          claimed_at?: string | null
          created_at?: string
          credits?: number
          email?: string
          id?: string
          invited_by?: string
          language?: string | null
          package_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          needs_password_setup: boolean
          playback_speed: number
          preferred_voice: string
          ui_language: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          needs_password_setup?: boolean
          playback_speed?: number
          preferred_voice?: string
          ui_language?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          needs_password_setup?: boolean
          playback_speed?: number
          preferred_voice?: string
          ui_language?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      share_pdf_cache: {
        Row: {
          content_hash: string
          created_at: string
          id: string
          job_id: string
          last_used_at: string
          storage_path: string
          user_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          id?: string
          job_id: string
          last_used_at?: string
          storage_path: string
          user_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          id?: string
          job_id?: string
          last_used_at?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tag_quality_flags: {
        Row: {
          created_at: string
          detected_lang: string | null
          id: string
          resolved_at: string | null
          status: string
          tag_id: string
          tag_name: string
        }
        Insert: {
          created_at?: string
          detected_lang?: string | null
          id?: string
          resolved_at?: string | null
          status?: string
          tag_id: string
          tag_name: string
        }
        Update: {
          created_at?: string
          detected_lang?: string | null
          id?: string
          resolved_at?: string | null
          status?: string
          tag_id?: string
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_quality_flags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_translations: {
        Row: {
          created_at: string
          id: string
          normalized_name: string
          target_lang: string
          translated_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          normalized_name: string
          target_lang: string
          translated_name: string
        }
        Update: {
          created_at?: string
          id?: string
          normalized_name?: string
          target_lang?: string
          translated_name?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          normalized_name: string
          source: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          normalized_name: string
          source?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          normalized_name?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      transcribe_settings_templates: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      transcript_shares: {
        Row: {
          claimed: boolean
          claimed_at: string | null
          claimed_by: string | null
          claimed_job_id: string | null
          created_at: string
          expires_at: string
          id: string
          job_id: string
          recipient_email: string
          shared_by: string
          token: string
        }
        Insert: {
          claimed?: boolean
          claimed_at?: string | null
          claimed_by?: string | null
          claimed_job_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          job_id: string
          recipient_email: string
          shared_by: string
          token?: string
        }
        Update: {
          claimed?: boolean
          claimed_at?: string | null
          claimed_by?: string | null
          claimed_job_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          job_id?: string
          recipient_email?: string
          shared_by?: string
          token?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_credits: {
        Args: {
          p_amount: number
          p_reason: string
          p_stripe_session_id?: string
          p_user_id: string
        }
        Returns: number
      }
      deduct_credits: {
        Args: {
          p_amount: number
          p_job_id?: string
          p_reason: string
          p_user_id: string
        }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_review_aggregate: {
        Args: never
        Returns: {
          rating_value: number
          review_count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      job_status:
        | "pending"
        | "uploading"
        | "processing"
        | "completed"
        | "failed"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      job_status: ["pending", "uploading", "processing", "completed", "failed"],
    },
  },
} as const

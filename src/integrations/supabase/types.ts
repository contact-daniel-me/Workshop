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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          checked_in_at: string
          day_date: string
          id: string
          marked_by: string | null
          method: Database["public"]["Enums"]["att_method"]
          qr_session_id: string | null
          remarks: string | null
          selfie_path: string | null
          status: Database["public"]["Enums"]["att_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          checked_in_at?: string
          day_date: string
          id?: string
          marked_by?: string | null
          method: Database["public"]["Enums"]["att_method"]
          qr_session_id?: string | null
          remarks?: string | null
          selfie_path?: string | null
          status: Database["public"]["Enums"]["att_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          checked_in_at?: string
          day_date?: string
          id?: string
          marked_by?: string | null
          method?: Database["public"]["Enums"]["att_method"]
          qr_session_id?: string | null
          remarks?: string | null
          selfie_path?: string | null
          status?: Database["public"]["Enums"]["att_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_qr_session_id_fkey"
            columns: ["qr_session_id"]
            isOneToOne: false
            referencedRelation: "qr_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_user: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_user?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_user?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          consent_at: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          participant_code: string
          phone: string
          photo_path: string | null
          verification_status: Database["public"]["Enums"]["verify_status"]
        }
        Insert: {
          consent_at?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          participant_code: string
          phone: string
          photo_path?: string | null
          verification_status?: Database["public"]["Enums"]["verify_status"]
        }
        Update: {
          consent_at?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          participant_code?: string
          phone?: string
          photo_path?: string | null
          verification_status?: Database["public"]["Enums"]["verify_status"]
        }
        Relationships: []
      }
      qr_sessions: {
        Row: {
          created_at: string
          created_by: string
          day_date: string
          expires_at: string
          id: string
          revoked: boolean
          short_code: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          day_date: string
          expires_at: string
          id?: string
          revoked?: boolean
          short_code: string
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string
          day_date?: string
          expires_at?: string
          id?: string
          revoked?: boolean
          short_code?: string
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
      workshop_settings: {
        Row: {
          duration_days: number
          id: number
          low_attendance_threshold: number
          name: string
          qr_validity_minutes: number
          require_selfie: boolean
          start_date: string
          updated_at: string
        }
        Insert: {
          duration_days?: number
          id?: number
          low_attendance_threshold?: number
          name?: string
          qr_validity_minutes?: number
          require_selfie?: boolean
          start_date?: string
          updated_at?: string
        }
        Update: {
          duration_days?: number
          id?: number
          low_attendance_threshold?: number
          name?: string
          qr_validity_minutes?: number
          require_selfie?: boolean
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      workshops: {
        Row: {
          created_at: string
          description: string | null
          duration_days: number
          id: string
          is_active: boolean
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          name: string
          start_date?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      workshop_days: {
        Row: {
          created_at: string
          day_date: string
          day_number: number
          id: string
          is_active: boolean
          topic: string | null
          workshop_id: string | null
        }
        Insert: {
          created_at?: string
          day_date: string
          day_number: number
          id?: string
          is_active?: boolean
          topic?: string | null
          workshop_id?: string | null
        }
        Update: {
          created_at?: string
          day_date?: string
          day_number?: number
          id?: string
          is_active?: boolean
          topic?: string | null
          workshop_id?: string | null
        }
        Relationships: []
      }
      verification_attempts: {
        Row: {
          attempt_photo_path: string | null
          confidence: number | null
          created_at: string
          day_date: string
          id: string
          match_result: boolean | null
          method: string
          provider: string
          provider_response: Json | null
          reference_photo_path: string | null
          status: string
          user_id: string
        }
        Insert: {
          attempt_photo_path?: string | null
          confidence?: number | null
          created_at?: string
          day_date: string
          id?: string
          match_result?: boolean | null
          method?: string
          provider?: string
          provider_response?: Json | null
          reference_photo_path?: string | null
          status: string
          user_id: string
        }
        Update: {
          attempt_photo_path?: string | null
          confidence?: number | null
          created_at?: string
          day_date?: string
          id?: string
          match_result?: boolean | null
          method?: string
          provider?: string
          provider_response?: Json | null
          reference_photo_path?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          agreed: boolean
          consent_type: string
          created_at: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          agreed?: boolean
          consent_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          agreed?: boolean
          consent_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      registration_taken: {
        Args: { _email: string; _phone: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "super_admin" | "attendance_admin" | "participant"
      att_method: "qr" | "qr_selfie" | "manual"
      att_status: "present" | "pending" | "excused" | "absent" | "rejected"
      verify_status: "pending" | "verified" | "rejected"
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
    Enums: {
      app_role: ["super_admin", "attendance_admin", "participant"],
      att_method: ["qr", "qr_selfie", "manual"],
      att_status: ["present", "pending", "excused", "absent", "rejected"],
      verify_status: ["pending", "verified", "rejected"],
    },
  },
} as const

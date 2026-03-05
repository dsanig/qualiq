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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      action_attachments: {
        Row: {
          action_id: string
          bucket_id: string
          created_at: string
          created_by: string | null
          file_name: string | null
          id: string
          object_path: string
        }
        Insert: {
          action_id: string
          bucket_id?: string
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          object_path: string
        }
        Update: {
          action_id?: string
          bucket_id?: string
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          object_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_attachments_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
        ]
      }
      actions: {
        Row: {
          action_type: string
          created_at: string
          description: string
          due_date: string | null
          id: string
          non_conformity_id: string
          responsible_id: string | null
          status: string
        }
        Insert: {
          action_type?: string
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          non_conformity_id: string
          responsible_id?: string | null
          status?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          non_conformity_id?: string
          responsible_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "actions_non_conformity_id_fkey"
            columns: ["non_conformity_id"]
            isOneToOne: false
            referencedRelation: "non_conformities"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_findings: {
        Row: {
          affected_area: string | null
          category: string
          created_at: string
          document_id: string | null
          finding_description: string
          finding_title: string
          id: string
          recommendation: string
          regulation_reference: string | null
          severity: string
          simulation_id: string
        }
        Insert: {
          affected_area?: string | null
          category: string
          created_at?: string
          document_id?: string | null
          finding_description: string
          finding_title: string
          id?: string
          recommendation: string
          regulation_reference?: string | null
          severity: string
          simulation_id: string
        }
        Update: {
          affected_area?: string | null
          category?: string
          created_at?: string
          document_id?: string | null
          finding_description?: string
          finding_title?: string
          id?: string
          recommendation?: string
          regulation_reference?: string | null
          severity?: string
          simulation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_findings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_findings_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "audit_simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_simulations: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          critical_findings: number | null
          id: string
          major_findings: number | null
          minor_findings: number | null
          risk_score: number | null
          simulation_type: string
          started_at: string | null
          status: string
          summary: string | null
          total_findings: number | null
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          critical_findings?: number | null
          id?: string
          major_findings?: number | null
          minor_findings?: number | null
          risk_score?: number | null
          simulation_type: string
          started_at?: string | null
          status?: string
          summary?: string | null
          total_findings?: number | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          critical_findings?: number | null
          id?: string
          major_findings?: number | null
          minor_findings?: number | null
          risk_score?: number | null
          simulation_type?: string
          started_at?: string | null
          status?: string
          summary?: string | null
          total_findings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_simulations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          audit_date: string | null
          auditor_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          status: string
          source_insight_id: string | null
          title: string
        }
        Insert: {
          audit_date?: string | null
          auditor_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          status?: string
          source_insight_id?: string | null
          title: string
        }
        Update: {
          audit_date?: string | null
          auditor_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          status?: string
          source_insight_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "audits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      capa_plans: {
        Row: {
          audit_id: string
          created_at: string
          description: string | null
          id: string
          responsible_id: string | null
          title: string | null
        }
        Insert: {
          audit_id: string
          created_at?: string
          description?: string | null
          id?: string
          responsible_id?: string | null
          title?: string | null
        }
        Update: {
          audit_id?: string
          created_at?: string
          description?: string | null
          id?: string
          responsible_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "capa_plans_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_features: {
        Row: {
          company_id: string
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_features_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      document_owners: {
        Row: {
          created_at: string
          document_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_owners_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_responsibilities: {
        Row: {
          action_type: string
          completed_at: string | null
          created_at: string
          created_by: string
          document_id: string
          due_date: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          action_type: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          document_id: string
          due_date: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          action_type?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          document_id?: string
          due_date?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_responsibilities_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signatures: {
        Row: {
          created_at: string
          document_id: string
          id: string
          signature_data: string | null
          signature_method: string
          signed_at: string
          signed_by: string
          signer_email: string | null
          signer_name: string | null
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          signature_data?: string | null
          signature_method?: string
          signed_at?: string
          signed_by: string
          signer_email?: string | null
          signer_name?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          signature_data?: string | null
          signature_method?: string
          signed_at?: string
          signed_by?: string
          signer_email?: string | null
          signer_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_signatures_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_status_changes: {
        Row: {
          changed_at: string
          changed_by: string
          comment: string | null
          document_id: string
          id: string
          new_status: string
          old_status: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          comment?: string | null
          document_id: string
          id?: string
          new_status: string
          old_status?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          comment?: string | null
          document_id?: string
          id?: string
          new_status?: string
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_status_changes_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          changes_description: string | null
          created_at: string
          created_by: string
          document_id: string
          file_url: string
          id: string
          version: number
        }
        Insert: {
          changes_description?: string | null
          created_at?: string
          created_by: string
          document_id: string
          file_url: string
          id?: string
          version: number
        }
        Update: {
          changes_description?: string | null
          created_at?: string
          created_by?: string
          document_id?: string
          file_url?: string
          id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string
          code: string
          company_id: string
          created_at: string
          file_type: string
          file_url: string
          id: string
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          owner_id: string
          status: Database["public"]["Enums"]["document_status"]
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          category?: string
          code: string
          company_id: string
          created_at?: string
          file_type: string
          file_url: string
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          owner_id: string
          status?: Database["public"]["Enums"]["document_status"]
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          category?: string
          code?: string
          company_id?: string
          created_at?: string
          file_type?: string
          file_url?: string
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          owner_id?: string
          status?: Database["public"]["Enums"]["document_status"]
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencia_attachments: {
        Row: {
          bucket_id: string
          created_at: string
          created_by: string | null
          file_name: string | null
          file_type: string | null
          id: string
          incidencia_id: string
          object_path: string
        }
        Insert: {
          bucket_id?: string
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_type?: string | null
          id?: string
          incidencia_id: string
          object_path: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_type?: string | null
          id?: string
          incidencia_id?: string
          object_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencia_attachments_incidencia_id_fkey"
            columns: ["incidencia_id"]
            isOneToOne: false
            referencedRelation: "incidencias"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias: {
        Row: {
          audit_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          description: string | null
          id: string
          incidencia_type: string
          resolution_notes: string | null
          responsible_id: string | null
          status: string
          source_insight_id: string | null
          title: string
        }
        Insert: {
          audit_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          incidencia_type?: string
          resolution_notes?: string | null
          responsible_id?: string | null
          status?: string
          source_insight_id?: string | null
          title: string
        }
        Update: {
          audit_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          incidencia_type?: string
          resolution_notes?: string | null
          responsible_id?: string | null
          status?: string
          source_insight_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_source_insight_id_fkey"
            columns: ["source_insight_id"]
            isOneToOne: false
            referencedRelation: "predictive_insights"
            referencedColumns: ["id"]
          },
        ]
      }
      non_conformities: {
        Row: {
          capa_plan_id: string
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          root_cause: string | null
          severity: string | null
          status: string
          source_insight_id: string | null
          title: string
        }
        Insert: {
          capa_plan_id: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          root_cause?: string | null
          severity?: string | null
          status?: string
          source_insight_id?: string | null
          title: string
        }
        Update: {
          capa_plan_id?: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          root_cause?: string | null
          severity?: string | null
          status?: string
          source_insight_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "non_conformities_capa_plan_id_fkey"
            columns: ["capa_plan_id"]
            isOneToOne: false
            referencedRelation: "capa_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      pattern_detections: {
        Row: {
          company_id: string
          correlation_strength: number | null
          data_points: Json
          detected_at: string
          id: string
          insight_id: string | null
          pattern_type: string
        }
        Insert: {
          company_id: string
          correlation_strength?: number | null
          data_points: Json
          detected_at?: string
          id?: string
          insight_id?: string | null
          pattern_type: string
        }
        Update: {
          company_id?: string
          correlation_strength?: number | null
          data_points?: Json
          detected_at?: string
          id?: string
          insight_id?: string | null
          pattern_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pattern_detections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pattern_detections_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "predictive_insights"
            referencedColumns: ["id"]
          },
        ]
      }
      predictive_insights: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          affected_areas: string[] | null
          company_id: string
          confidence_score: number | null
          created_at: string
          description: string
          id: string
          insight_type: string
          is_acknowledged: boolean | null
          pattern_details: Json | null
          read_at: string | null
          read_by: string | null
          severity: string
          source: Json | null
          suggested_actions: string[] | null
          title: string
          converted_to_incident_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          affected_areas?: string[] | null
          company_id: string
          confidence_score?: number | null
          created_at?: string
          description: string
          id?: string
          insight_type: string
          is_acknowledged?: boolean | null
          pattern_details?: Json | null
          read_at?: string | null
          read_by?: string | null
          severity: string
          source?: Json | null
          suggested_actions?: string[] | null
          title: string
          converted_to_incident_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          affected_areas?: string[] | null
          company_id?: string
          confidence_score?: number | null
          created_at?: string
          description?: string
          id?: string
          insight_type?: string
          is_acknowledged?: boolean | null
          pattern_details?: Json | null
          read_at?: string | null
          read_by?: string | null
          severity?: string
          source?: Json | null
          suggested_actions?: string[] | null
          title?: string
          converted_to_incident_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "predictive_insights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictive_insights_converted_to_incident_id_fkey"
            columns: ["converted_to_incident_id"]
            isOneToOne: false
            referencedRelation: "incidencias"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_superadmin: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          is_superadmin?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_superadmin?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      training_answers: {
        Row: {
          answered_at: string
          id: string
          is_correct: boolean
          question_id: string
          selected_option_id: string
          session_id: string
        }
        Insert: {
          answered_at?: string
          id?: string
          is_correct: boolean
          question_id: string
          selected_option_id: string
          session_id: string
        }
        Update: {
          answered_at?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          selected_option_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "training_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_questions: {
        Row: {
          created_at: string
          explanation: string | null
          id: string
          options: Json
          question_number: number
          question_text: string
          session_id: string
        }
        Insert: {
          created_at?: string
          explanation?: string | null
          id?: string
          options: Json
          question_number: number
          question_text: string
          session_id: string
        }
        Update: {
          created_at?: string
          explanation?: string | null
          id?: string
          options?: Json
          question_number?: number
          question_text?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sessions: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          document_id: string
          id: string
          passed: boolean | null
          score: number | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          document_id: string
          id?: string
          passed?: boolean | null
          score?: number | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          document_id?: string
          id?: string
          passed?: boolean | null
          score?: number | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      user_directory: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          is_superadmin: boolean | null
          role: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_edit_content: { Args: { uid: string }; Returns: boolean }
      can_manage_company: { Args: { uid: string }; Returns: boolean }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_superadmin: { Args: { uid: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "quality_manager"
        | "quality_tech"
        | "regulatory"
        | "viewer"
        | "Administrador"
        | "Editor"
        | "Espectador"
      document_status: "draft" | "review" | "approved" | "obsolete" | "archived"
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
      app_role: [
        "admin",
        "quality_manager",
        "quality_tech",
        "regulatory",
        "viewer",
        "Administrador",
        "Editor",
        "Espectador",
      ],
      document_status: ["draft", "review", "approved", "obsolete", "archived"],
    },
  },
} as const

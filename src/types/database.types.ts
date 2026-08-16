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
      disponibilidades: {
        Row: {
          criado_em: string
          dia_semana: number
          disponivel: boolean
          funcionario_id: string
          id: string
          periodo: string | null
          restaurante_id: string
        }
        Insert: {
          criado_em?: string
          dia_semana: number
          disponivel?: boolean
          funcionario_id: string
          id?: string
          periodo?: string | null
          restaurante_id: string
        }
        Update: {
          criado_em?: string
          dia_semana?: number
          disponivel?: boolean
          funcionario_id?: string
          id?: string
          periodo?: string | null
          restaurante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disponibilidades_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disponibilidades_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      escalas: {
        Row: {
          criado_em: string
          criado_por: string | null
          id: string
          restaurante_id: string
          semana_fim: string
          semana_inicio: string
          status: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          id?: string
          restaurante_id: string
          semana_fim: string
          semana_inicio: string
          status?: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          id?: string
          restaurante_id?: string
          semana_fim?: string
          semana_inicio?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      funcionarios: {
        Row: {
          ativo: boolean
          carga_horaria_semanal_max: number
          cargo: string
          criado_em: string
          documento: string | null
          eh_gerencia: boolean
          folgas_obrigatorias_semana: number
          frequencia_pagamento: string | null
          genero: string | null
          id: string
          idade: number | null
          modalidade_pagamento: string
          nome: string
          pausa_almoco_minutos: number
          restaurante_id: string
          tipo_contrato: string
          usuario_id: string | null
          valor_hora: number | null
          valor_pagamento: number
          zona_id: string | null
        }
        Insert: {
          ativo?: boolean
          carga_horaria_semanal_max?: number
          cargo: string
          criado_em?: string
          documento?: string | null
          eh_gerencia?: boolean
          folgas_obrigatorias_semana?: number
          frequencia_pagamento?: string | null
          genero?: string | null
          id?: string
          idade?: number | null
          modalidade_pagamento: string
          nome: string
          pausa_almoco_minutos?: number
          restaurante_id: string
          tipo_contrato: string
          usuario_id?: string | null
          valor_hora?: number | null
          valor_pagamento?: number
          zona_id?: string | null
        }
        Update: {
          ativo?: boolean
          carga_horaria_semanal_max?: number
          cargo?: string
          criado_em?: string
          documento?: string | null
          eh_gerencia?: boolean
          folgas_obrigatorias_semana?: number
          frequencia_pagamento?: string | null
          genero?: string | null
          id?: string
          idade?: number | null
          modalidade_pagamento?: string
          nome?: string
          pausa_almoco_minutos?: number
          restaurante_id?: string
          tipo_contrato?: string
          usuario_id?: string | null
          valor_hora?: number | null
          valor_pagamento?: number
          zona_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funcionarios_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funcionarios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funcionarios_zona_id_fkey"
            columns: ["zona_id"]
            isOneToOne: false
            referencedRelation: "zonas"
            referencedColumns: ["id"]
          },
        ]
      }
      horarios_funcionamento: {
        Row: {
          dia_semana: number
          fechado: boolean
          hora_abertura: string | null
          hora_fechamento: string | null
          id: string
          restaurante_id: string
        }
        Insert: {
          dia_semana: number
          fechado?: boolean
          hora_abertura?: string | null
          hora_fechamento?: string | null
          id?: string
          restaurante_id: string
        }
        Update: {
          dia_semana?: number
          fechado?: boolean
          hora_abertura?: string | null
          hora_fechamento?: string | null
          id?: string
          restaurante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "horarios_funcionamento_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      movimento_operacional: {
        Row: {
          criado_em: string | null
          dia_semana: number
          id: string
          nivel: string
          periodo: string
          restaurante_id: string
        }
        Insert: {
          criado_em?: string | null
          dia_semana: number
          id?: string
          nivel?: string
          periodo: string
          restaurante_id: string
        }
        Update: {
          criado_em?: string | null
          dia_semana?: number
          id?: string
          nivel?: string
          periodo?: string
          restaurante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimento_operacional_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      necessidades_equipe: {
        Row: {
          criado_em: string | null
          dia_semana: number
          funcao: string | null
          id: string
          ideal: number
          maximo: number
          minimo: number
          periodo: string
          restaurante_id: string
          zona_id: string | null
        }
        Insert: {
          criado_em?: string | null
          dia_semana: number
          funcao?: string | null
          id?: string
          ideal?: number
          maximo?: number
          minimo?: number
          periodo: string
          restaurante_id: string
          zona_id?: string | null
        }
        Update: {
          criado_em?: string | null
          dia_semana?: number
          funcao?: string | null
          id?: string
          ideal?: number
          maximo?: number
          minimo?: number
          periodo?: string
          restaurante_id?: string
          zona_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "necessidades_equipe_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "necessidades_equipe_zona_id_fkey"
            columns: ["zona_id"]
            isOneToOne: false
            referencedRelation: "zonas"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos_historico: {
        Row: {
          funcionario_id: string
          horas_trabalhadas: number
          id: string
          pago_em: string
          pago_por: string | null
          periodo_fim: string
          periodo_inicio: string
          restaurante_id: string
          valor_pago: number
        }
        Insert: {
          funcionario_id: string
          horas_trabalhadas: number
          id?: string
          pago_em?: string
          pago_por?: string | null
          periodo_fim: string
          periodo_inicio: string
          restaurante_id: string
          valor_pago: number
        }
        Update: {
          funcionario_id?: string
          horas_trabalhadas?: number
          id?: string
          pago_em?: string
          pago_por?: string | null
          periodo_fim?: string
          periodo_inicio?: string
          restaurante_id?: string
          valor_pago?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_historico_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_historico_pago_por_fkey"
            columns: ["pago_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_historico_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_ponto: {
        Row: {
          criado_em: string
          entrada: string
          funcionario_id: string
          horas_trabalhadas: number | null
          id: string
          origem: string
          pago: boolean
          restaurante_id: string
          saida: string | null
          turno_id: string | null
        }
        Insert: {
          criado_em?: string
          entrada: string
          funcionario_id: string
          horas_trabalhadas?: number | null
          id?: string
          origem?: string
          pago?: boolean
          restaurante_id: string
          saida?: string | null
          turno_id?: string | null
        }
        Update: {
          criado_em?: string
          entrada?: string
          funcionario_id?: string
          horas_trabalhadas?: number | null
          id?: string
          origem?: string
          pago?: boolean
          restaurante_id?: string
          saida?: string | null
          turno_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registros_ponto_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_ponto_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_ponto_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurantes: {
        Row: {
          ativo: boolean
          cobertura_fds_prioritaria: boolean
          criado_em: string
          dias_funcionamento: number[]
          frequencia_pagamento_padrao: string
          fuso_horario: string
          id: string
          max_funcionarios: number
          moeda: string
          nome: string
          onboarding_concluido: boolean
          pais: string
          permite_ia: boolean
          plano: string
          ponto_automatico: boolean
          status_assinatura: string
          trial_ends_at: string
          usa_zonas: boolean
          valor_hora_padrao: number
        }
        Insert: {
          ativo?: boolean
          cobertura_fds_prioritaria?: boolean
          criado_em?: string
          dias_funcionamento?: number[]
          frequencia_pagamento_padrao?: string
          fuso_horario?: string
          id?: string
          max_funcionarios?: number
          moeda?: string
          nome: string
          onboarding_concluido?: boolean
          pais: string
          permite_ia?: boolean
          plano?: string
          ponto_automatico?: boolean
          status_assinatura?: string
          trial_ends_at?: string
          usa_zonas?: boolean
          valor_hora_padrao?: number
        }
        Update: {
          ativo?: boolean
          cobertura_fds_prioritaria?: boolean
          criado_em?: string
          dias_funcionamento?: number[]
          frequencia_pagamento_padrao?: string
          fuso_horario?: string
          id?: string
          max_funcionarios?: number
          moeda?: string
          nome?: string
          onboarding_concluido?: boolean
          pais?: string
          permite_ia?: boolean
          plano?: string
          ponto_automatico?: boolean
          status_assinatura?: string
          trial_ends_at?: string
          usa_zonas?: boolean
          valor_hora_padrao?: number
        }
        Relationships: []
      }
      turnos: {
        Row: {
          criado_em: string
          dia_semana: number
          escala_id: string
          fora_preferencia: boolean
          funcionario_id: string
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          periodo: string
          restaurante_id: string
          status: string
          zona_id: string | null
        }
        Insert: {
          criado_em?: string
          dia_semana: number
          escala_id: string
          fora_preferencia?: boolean
          funcionario_id: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          periodo: string
          restaurante_id: string
          status?: string
          zona_id?: string | null
        }
        Update: {
          criado_em?: string
          dia_semana?: number
          escala_id?: string
          fora_preferencia?: boolean
          funcionario_id?: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          periodo?: string
          restaurante_id?: string
          status?: string
          zona_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "turnos_escala_id_fkey"
            columns: ["escala_id"]
            isOneToOne: false
            referencedRelation: "escalas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_zona_id_fkey"
            columns: ["zona_id"]
            isOneToOne: false
            referencedRelation: "zonas"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          criado_em: string
          email: string
          id: string
          nome_completo: string
          papel: string
          restaurante_id: string | null
        }
        Insert: {
          criado_em?: string
          email: string
          id: string
          nome_completo: string
          papel: string
          restaurante_id?: string | null
        }
        Update: {
          criado_em?: string
          email?: string
          id?: string
          nome_completo?: string
          papel?: string
          restaurante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      zonas: {
        Row: {
          ativo: boolean
          capacidade_minima: number
          cor: string
          criado_em: string
          id: string
          nome: string
          ordem: number
          restaurante_id: string
        }
        Insert: {
          ativo?: boolean
          capacidade_minima?: number
          cor?: string
          criado_em?: string
          id?: string
          nome: string
          ordem?: number
          restaurante_id: string
        }
        Update: {
          ativo?: boolean
          capacidade_minima?: number
          cor?: string
          criado_em?: string
          id?: string
          nome?: string
          ordem?: number
          restaurante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zonas_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_papel: { Args: never; Returns: string }
      auth_restaurante_id: { Args: never; Returns: string }
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
    Enums: {},
  },
} as const

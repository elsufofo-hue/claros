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
      acessos: {
        Row: {
          created_at: string
          data_hora: string
          id: string
          pagina: string
          sucesso: boolean
          telefone_consultado: string | null
          valor_desconto: number | null
          valor_original: number | null
        }
        Insert: {
          created_at?: string
          data_hora?: string
          id?: string
          pagina: string
          sucesso?: boolean
          telefone_consultado?: string | null
          valor_desconto?: number | null
          valor_original?: number | null
        }
        Update: {
          created_at?: string
          data_hora?: string
          id?: string
          pagina?: string
          sucesso?: boolean
          telefone_consultado?: string | null
          valor_desconto?: number | null
          valor_original?: number | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          created_at: string
          documento: string | null
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          documento?: string | null
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          documento?: string | null
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string
          updated_at?: string
        }
        Relationships: []
      }
      faturas: {
        Row: {
          boleto_codigo: string | null
          boleto_url: string | null
          cliente_id: string
          created_at: string
          data_pagamento: string | null
          descricao: string
          id: string
          pix_copia_cola: string | null
          pix_txid: string | null
          pix_valor_centavos: number | null
          referencia: string | null
          status: Database["public"]["Enums"]["fatura_status"]
          updated_at: string
          valor_desconto: number
          valor_original: number
          vencimento: string
        }
        Insert: {
          boleto_codigo?: string | null
          boleto_url?: string | null
          cliente_id: string
          created_at?: string
          data_pagamento?: string | null
          descricao?: string
          id?: string
          pix_copia_cola?: string | null
          pix_txid?: string | null
          pix_valor_centavos?: number | null
          referencia?: string | null
          status?: Database["public"]["Enums"]["fatura_status"]
          updated_at?: string
          valor_desconto?: number
          valor_original?: number
          vencimento: string
        }
        Update: {
          boleto_codigo?: string | null
          boleto_url?: string | null
          cliente_id?: string
          created_at?: string
          data_pagamento?: string | null
          descricao?: string
          id?: string
          pix_copia_cola?: string | null
          pix_txid?: string | null
          pix_valor_centavos?: number | null
          referencia?: string | null
          status?: Database["public"]["Enums"]["fatura_status"]
          updated_at?: string
          valor_desconto?: number
          valor_original?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "faturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      gateways_config: {
        Row: {
          adapter: string
          ambiente: string
          api_url: string | null
          ativo: boolean
          created_at: string
          id: string
          limite_diario: number | null
          observacoes: string | null
          prioridade: number
          rotulo: string
          secret_names: string[]
          slug: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          adapter?: string
          ambiente?: string
          api_url?: string | null
          ativo?: boolean
          created_at?: string
          id?: string
          limite_diario?: number | null
          observacoes?: string | null
          prioridade?: number
          rotulo: string
          secret_names?: string[]
          slug: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          adapter?: string
          ambiente?: string
          api_url?: string | null
          ativo?: boolean
          created_at?: string
          id?: string
          limite_diario?: number | null
          observacoes?: string | null
          prioridade?: number
          rotulo?: string
          secret_names?: string[]
          slug?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      pagamentos: {
        Row: {
          cliente_id: string | null
          created_at: string
          fatura_id: string
          gateway: string | null
          gateway_payment_id: string | null
          id: string
          metodo: string
          pago_em: string | null
          status: Database["public"]["Enums"]["pagamento_status"]
          updated_at: string
          valor: number
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          fatura_id: string
          gateway?: string | null
          gateway_payment_id?: string | null
          id?: string
          metodo?: string
          pago_em?: string | null
          status?: Database["public"]["Enums"]["pagamento_status"]
          updated_at?: string
          valor?: number
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          fatura_id?: string
          gateway?: string | null
          gateway_payment_id?: string | null
          id?: string
          metodo?: string
          pago_em?: string | null
          status?: Database["public"]["Enums"]["pagamento_status"]
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas_por_telefone"
            referencedColumns: ["fatura_id"]
          },
        ]
      }
      pagamentos_log: {
        Row: {
          created_at: string
          fatura_id: string | null
          gateway_slug: string
          http_status: number | null
          id: string
          mensagem: string
          nivel: string
        }
        Insert: {
          created_at?: string
          fatura_id?: string | null
          gateway_slug: string
          http_status?: number | null
          id?: string
          mensagem: string
          nivel?: string
        }
        Update: {
          created_at?: string
          fatura_id?: string | null
          gateway_slug?: string
          http_status?: number | null
          id?: string
          mensagem?: string
          nivel?: string
        }
        Relationships: []
      }
      pix_generation_requests: {
        Row: {
          created_at: string
          erro: string | null
          fatura_id: string
          id: string
          request_key: string
          status: string
          transacao_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          erro?: string | null
          fatura_id: string
          id?: string
          request_key: string
          status?: string
          transacao_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          erro?: string | null
          fatura_id?: string
          id?: string
          request_key?: string
          status?: string
          transacao_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pix_generation_requests_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_generation_requests_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas_por_telefone"
            referencedColumns: ["fatura_id"]
          },
          {
            foreignKeyName: "pix_generation_requests_transacao_id_fkey"
            columns: ["transacao_id"]
            isOneToOne: false
            referencedRelation: "transacoes_pix"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string
          id: string
          nome?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      roteamento_config: {
        Row: {
          created_at: string
          estrategia: string
          gateway_fixa: string | null
          id: boolean
          novo_pix_por_acesso: boolean
          ponteiro: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          estrategia?: string
          gateway_fixa?: string | null
          id?: boolean
          novo_pix_por_acesso?: boolean
          ponteiro?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          estrategia?: string
          gateway_fixa?: string | null
          id?: boolean
          novo_pix_por_acesso?: boolean
          ponteiro?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roteamento_config_gateway_fixa_fkey"
            columns: ["gateway_fixa"]
            isOneToOne: false
            referencedRelation: "gateways_config"
            referencedColumns: ["id"]
          },
        ]
      }
      transacoes_pix: {
        Row: {
          cliente_id: string | null
          copia_cola: string | null
          created_at: string
          expira_em: string | null
          fatura_id: string
          gateway_id: string | null
          gateway_slug: string
          id: string
          idempotency_key: string
          pago_em: string | null
          qrcode: string | null
          status: string
          substituida_em: string | null
          transacao_gateway_id: string | null
          updated_at: string
          valor_centavos: number
          valor_pago_centavos: number | null
          webhook_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          copia_cola?: string | null
          created_at?: string
          expira_em?: string | null
          fatura_id: string
          gateway_id?: string | null
          gateway_slug: string
          id?: string
          idempotency_key: string
          pago_em?: string | null
          qrcode?: string | null
          status?: string
          substituida_em?: string | null
          transacao_gateway_id?: string | null
          updated_at?: string
          valor_centavos: number
          valor_pago_centavos?: number | null
          webhook_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          copia_cola?: string | null
          created_at?: string
          expira_em?: string | null
          fatura_id?: string
          gateway_id?: string | null
          gateway_slug?: string
          id?: string
          idempotency_key?: string
          pago_em?: string | null
          qrcode?: string | null
          status?: string
          substituida_em?: string | null
          transacao_gateway_id?: string | null
          updated_at?: string
          valor_centavos?: number
          valor_pago_centavos?: number | null
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_pix_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_pix_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_pix_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas_por_telefone"
            referencedColumns: ["fatura_id"]
          },
          {
            foreignKeyName: "transacoes_pix_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "gateways_config"
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
      webhooks_log: {
        Row: {
          assinatura_valida: boolean
          created_at: string
          evento: string | null
          gateway_slug: string
          id: string
          resumo: string | null
          transacao_gateway_id: string | null
        }
        Insert: {
          assinatura_valida?: boolean
          created_at?: string
          evento?: string | null
          gateway_slug: string
          id?: string
          resumo?: string | null
          transacao_gateway_id?: string | null
        }
        Update: {
          assinatura_valida?: boolean
          created_at?: string
          evento?: string | null
          gateway_slug?: string
          id?: string
          resumo?: string | null
          transacao_gateway_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      faturas_por_telefone: {
        Row: {
          boleto_codigo: string | null
          boleto_url: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          fatura_id: string | null
          nome: string | null
          pix_copia_e_cola: string | null
          status: string | null
          telefone: string | null
          valor_com_desconto: number | null
          valor_em_aberto: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      avancar_ponteiro_gateway: { Args: { p_total: number }; Returns: number }
      importar_faturas_lote: {
        Args: { p_actor: string; p_registros: Json; p_vencimento: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user"
      fatura_status:
        | "em_aberto"
        | "paga"
        | "vencida"
        | "cancelada"
        | "expirada"
        | "falhou"
        | "em_processamento"
      pagamento_status: "pendente" | "confirmado" | "falhou" | "estornado"
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
      app_role: ["admin", "user"],
      fatura_status: [
        "em_aberto",
        "paga",
        "vencida",
        "cancelada",
        "expirada",
        "falhou",
        "em_processamento",
      ],
      pagamento_status: ["pendente", "confirmado", "falhou", "estornado"],
    },
  },
} as const

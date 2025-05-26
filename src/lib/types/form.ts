export interface FormField {
  id: string
  type: 'text' | 'textarea' | 'checkbox' | 'radio' | 'select' | 'multi_select'
  label: string
  placeholder?: string
  required: boolean
  options?: string[]
}

export interface Form {
  id: string
  short_id: string
  title: string
  description: string
  schema: FormField[]
  user_id?: string
  created_at?: string
  responseCount?: number
  expires_at?: string
  is_public?: boolean
  is_draft?: boolean
  primary_color?: string
  secondary_color?: string
  logo_url?: string
}

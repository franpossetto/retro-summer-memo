/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** "true" to offer "Continue with Google" (needs the Google provider enabled in Supabase). */
  /** Local Mailpit URL, shown on the sign-in screen during development. */
  readonly VITE_DEV_MAILBOX_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

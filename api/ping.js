import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const { count, error } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })

  if (error) return res.status(500).json({ ok: false, error: error.message })

  return res.status(200).json({ ok: true, event_count: count })
}

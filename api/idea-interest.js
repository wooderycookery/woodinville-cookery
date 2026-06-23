import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { token, ideaId } = req.body

  if (!token) return res.status(401).json({ error: 'Token required' })
  if (!ideaId) return res.status(400).json({ error: 'ideaId is required' })

  const { data: guest } = await supabase
    .from('guests')
    .select('id')
    .eq('invite_token', token)
    .maybeSingle()

  if (!guest) return res.status(401).json({ error: 'Invalid token' })

  const { data: existing } = await supabase
    .from('idea_interests')
    .select('id')
    .eq('idea_id', ideaId)
    .eq('guest_id', guest.id)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('idea_interests')
      .delete()
      .eq('id', existing.id)

    return res.status(200).json({ interested: false })
  }

  await supabase
    .from('idea_interests')
    .insert({ idea_id: ideaId, guest_id: guest.id })

  return res.status(200).json({ interested: true })
}

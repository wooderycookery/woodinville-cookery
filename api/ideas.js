import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    const { token } = req.query

    let guestId = null
    if (token) {
      const { data: guest } = await supabase
        .from('guests')
        .select('id')
        .eq('invite_token', token)
        .maybeSingle()
      if (guest) guestId = guest.id
    }

    const { data: ideas, error } = await supabase
      .from('ideas')
      .select('id, author_name, body, season, scale, created_at, pinned')
      .eq('archived', false)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) return res.status(500).json({ error: 'Failed to fetch ideas' })

    if (!ideas || ideas.length === 0) return res.status(200).json({ ideas: [] })

    const { data: interests } = await supabase
      .from('idea_interests')
      .select('idea_id, guest_id')
      .in('idea_id', ideas.map(i => i.id))

    const enriched = ideas.map(idea => {
      const ideaInterests = (interests || []).filter(i => i.idea_id === idea.id)
      return {
        ...idea,
        interest_count: ideaInterests.length,
        my_interest: guestId ? ideaInterests.some(i => i.guest_id === guestId) : false,
      }
    })

    return res.status(200).json({ ideas: enriched })
  }

  if (req.method === 'POST') {
    const { body, season, scale, author_name, token } = req.body

    if (!token) return res.status(401).json({ error: 'Token required' })
    if (!body?.trim()) return res.status(400).json({ error: 'Body is required' })
    if (!author_name?.trim()) return res.status(400).json({ error: 'Author name is required' })

    const { data: guest } = await supabase
      .from('guests')
      .select('id')
      .eq('invite_token', token)
      .maybeSingle()

    if (!guest) return res.status(401).json({ error: 'Invalid token' })

    const { data, error } = await supabase
      .from('ideas')
      .insert({
        body: body.trim(),
        season: season || null,
        scale: scale || null,
        author_name: author_name.trim(),
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: 'Failed to create idea' })

    return res.status(201).json({ idea: { ...data, interest_count: 0, my_interest: false } })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

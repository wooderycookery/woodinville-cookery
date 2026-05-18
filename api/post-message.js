import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { eventId, body, channel = 'attendees', token, authorId } = req.body

  if (!eventId || !body?.trim()) {
    return res.status(400).json({ error: 'Missing eventId or body' })
  }

  // Determine author — either a host (authorId from Supabase session) or a guest (token)
  let authorName = 'Guest'
  let authorRole = 'guest'
  let resolvedAuthorId = authorId || null

  if (token && !authorId) {
    // Guest posting via invite token
    const { data: guest, error: guestError } = await supabase
      .from('guests')
      .select('id, rsvp_status, contacts(name)')
      .eq('invite_token', token)
      .eq('event_id', eventId)
      .single()

    if (guestError || !guest) {
      return res.status(403).json({ error: 'Invalid token' })
    }

    // Only confirmed guests (attending or maybe) can post
    if (!['attending', 'maybe'].includes(guest.rsvp_status)) {
      return res.status(403).json({ error: 'RSVP required before posting' })
    }

    authorName = guest.contacts?.name || 'Guest'
    authorRole = 'guest'
    resolvedAuthorId = guest.id
  } else if (authorId) {
    // Host posting — verify they own this event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('host_id, name')
      .eq('id', eventId)
      .single()

    if (eventError || !event || event.host_id !== authorId) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', authorId)
      .single()

    authorName = profile?.display_name || 'Host'
    authorRole = 'host'
  } else {
    return res.status(400).json({ error: 'Must provide token or authorId' })
  }

  const { data: message, error: insertError } = await supabase
    .from('messages')
    .insert({
      event_id: eventId,
      author_id: authorRole === 'host' ? resolvedAuthorId : null,
      channel,
      body: body.trim(),
      type: 'message',
      author_name: authorName,
      author_role: authorRole,
    })
    .select()
    .single()

  if (insertError) {
    console.error('post-message insert error:', insertError)
    return res.status(500).json({ error: 'Failed to post message' })
  }

  return res.status(200).json({ message })
}

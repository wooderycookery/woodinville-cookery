import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { eventId, preferences } = req.body
  if (!eventId) return res.status(400).json({ error: 'Missing eventId' })

  const [{ data: event }, { data: contributions }] = await Promise.all([
    supabase.from('events').select('name, description').eq('id', eventId).single(),
    supabase.from('table_contributions').select('item, is_host_provided').eq('event_id', eventId),
  ])

  if (!event) return res.status(404).json({ error: 'Event not found' })

  const hostItems = (contributions || []).filter(c => c.is_host_provided).map(c => c.item)
  const guestItems = (contributions || []).filter(c => !c.is_host_provided).map(c => c.item)

  const prompt = [
    `Event: ${event.name}`,
    event.description ? `Description: ${event.description}` : '',
    hostItems.length ? `Already provided by hosts: ${hostItems.join(', ')}` : '',
    guestItems.length ? `Already being brought by guests: ${guestItems.join(', ')}` : '',
    preferences ? `Guest preference: ${preferences}` : '',
  ].filter(Boolean).join('\n')

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      system: 'You are helping a guest decide what to bring to a dinner gathering. Return ONLY a JSON object with no preamble, no markdown, no code fences — exactly this format: {"suggestions": ["item one", "item two", "item three"]}. Suggestions should be 2–3 short, specific, complementary items. Avoid duplicating what hosts or guests have already listed.',
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0]?.text?.trim() || ''
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      parsed = match ? JSON.parse(match[0]) : { suggestions: [] }
    }

    return res.status(200).json({ suggestions: parsed.suggestions || [] })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'AI suggest failed' })
  }
}

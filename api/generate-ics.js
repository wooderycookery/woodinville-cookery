import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function toIcsDate(isoString) {
  const d = new Date(isoString)
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function addHours(isoString, hours) {
  const d = new Date(isoString)
  d.setTime(d.getTime() + hours * 60 * 60 * 1000)
  return d.toISOString()
}

function foldLine(str) {
  if (str.length <= 75) return str
  const chunks = []
  let i = 0
  chunks.push(str.slice(0, 75))
  i = 75
  while (i < str.length) {
    chunks.push(' ' + str.slice(i, i + 74))
    i += 74
  }
  return chunks.join('\r\n')
}

function escapeIcs(str) {
  if (!str) return ''
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { eventId, token } = req.query
  if (!eventId || !token) return res.status(400).send('Missing eventId or token')

  // Validate token belongs to a guest for this event
  const { data: guest, error: guestError } = await supabase
    .from('guests')
    .select('id')
    .eq('invite_token', token)
    .eq('event_id', eventId)
    .single()

  if (guestError || !guest) return res.status(403).send('Invalid token')

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, name, date, end_time, description, location')
    .eq('id', eventId)
    .single()

  if (eventError || !event) return res.status(404).send('Event not found')

  const dtStart = toIcsDate(event.date)
  const dtEnd   = toIcsDate(event.end_time || addHours(event.date, 3))
  const uid     = `wcs-${event.id}@woodinvillecookery.com`
  const safeName = escapeIcs(event.name)
  const safeDesc = escapeIcs(event.description || '')
  const safeLoc  = escapeIcs(event.location || '')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Woodinville Cookery Society//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    foldLine(`UID:${uid}`),
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    foldLine(`SUMMARY:${safeName}`),
    safeDesc ? foldLine(`DESCRIPTION:${safeDesc}`) : null,
    safeLoc  ? foldLine(`LOCATION:${safeLoc}`) : null,
    'ORGANIZER;CN=Woodinville Cookery Society:MAILTO:events@woodinvillecookery.com',
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  const filename = `${event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).send(lines)
}

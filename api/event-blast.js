import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const resend = new Resend(process.env.RESEND_API_KEY)

function renderHtml({ eventName, eventDate, note, eventUrl, appUrl }) {
  const logoUrl = `${appUrl}/wcs_logo.png`
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${eventName}</title>
</head>
<body style="margin:0;padding:40px 0;background-color:#F5F0E8;font-family:'Inter',system-ui,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background-color:#F5F0E8;">

    <div style="text-align:center;padding-bottom:4px;">
      <img src="${logoUrl}" alt="Woodinville Cookery Society" width="180" style="height:auto;display:inline-block;" />
    </div>

    <div style="width:40px;height:1px;background:#B87C5A;margin:16px auto;"></div>

    <div style="padding:32px 48px 0;text-align:center;">
      <p style="font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#B87C5A;margin:0 0 10px;">${eventName}</p>
      <p style="font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#B87C5A;margin:0 0 24px;">${eventDate}</p>

      <div style="width:40px;height:1px;background:#B87C5A;margin:0 auto 24px;"></div>

      <p style="font-size:15px;color:#3D5A3E;line-height:1.8;margin:0 0 32px;text-align:left;white-space:pre-wrap;">${note}</p>

      <a href="${eventUrl}" style="display:inline-block;background:#2C4A2E;color:#F5F0E8;padding:14px 40px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;font-family:'Inter',system-ui,sans-serif;">View the event page</a>
    </div>

    <div style="margin-top:40px;padding:20px 48px;border-top:1px solid #DDD5C8;text-align:center;">
      <p style="font-size:10px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#B87C5A;margin:0 0 8px;">Woodinville Cookery Society · woodinvillecookery.com</p>
      <p style="font-size:11px;color:#8C9E8E;margin:0;">You received this update because you RSVPd to ${eventName}. To unsubscribe, reply with "unsubscribe" or email <a href="mailto:events@woodinvillecookery.com" style="color:#8C9E8E;">events@woodinvillecookery.com</a>.</p>
    </div>

  </div>
</body>
</html>`
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })

  const accessToken = authHeader.slice(7)
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  const { eventId, subject, note } = req.body
  if (!eventId || !subject?.trim() || !note?.trim()) {
    return res.status(400).json({ error: 'eventId, subject, and note are required' })
  }

  const { data: event } = await supabase
    .from('events')
    .select('id, name, date, host_id')
    .eq('id', eventId)
    .single()

  if (!event) return res.status(404).json({ error: 'Event not found' })
  if (event.host_id !== user.id) return res.status(403).json({ error: 'Forbidden' })

  const { data: guests } = await supabase
    .from('guests')
    .select('id, invite_token, contacts(email, name)')
    .eq('event_id', eventId)
    .in('rsvp_status', ['attending', 'maybe'])

  const recipients = (guests || []).filter(g => g.contacts?.email)

  if (recipients.length === 0) return res.status(200).json({ sent: 0, failed: 0 })

  const formattedDate = new Date(event.date + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Los_Angeles',
  })

  const appUrl = process.env.VITE_APP_URL || 'https://woodinvillecookery.com'
  const baseEventUrl = `${appUrl}/event/${eventId}`

  let sent = 0
  let failed = 0

  const BATCH_SIZE = 100
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE).map(g => {
      const eventUrl = g.invite_token ? `${baseEventUrl}?token=${g.invite_token}` : baseEventUrl
      return {
        from: 'Woodinville Cookery Society <events@woodinvillecookery.com>',
        reply_to: process.env.REPLY_TO_EMAIL,
        to: [g.contacts.email],
        subject: subject.trim(),
        html: renderHtml({ eventName: event.name, eventDate: formattedDate, note: note.trim(), eventUrl, appUrl }),
        text: `${event.name}\n${formattedDate}\n\n${note.trim()}\n\nView the event page: ${eventUrl}\n\nWoodinville Cookery Society`,
        headers: {
          'List-Unsubscribe': '<mailto:events@woodinvillecookery.com?subject=unsubscribe>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'X-Entity-Ref-ID': `wcs-blast-${eventId}-${Date.now()}`,
        },
      }
    })
    try {
      await resend.batch.send(batch)
      sent += batch.length
    } catch {
      failed += batch.length
    }
  }

  return res.status(200).json({ sent, failed })
}

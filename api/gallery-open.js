import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const resend = new Resend(process.env.RESEND_API_KEY)

function galleryEmailHtml({ guestName, eventName, galleryUrl, phase, appUrl }) {
  const logoUrl = `${appUrl}/wcs_logo.png`
  const heading = phase === 'pre'
    ? 'A preview of what\'s to come.'
    : 'The table has been cleared, but the evening needn\'t end quite yet.'
  const body = phase === 'pre'
    ? `Rob has shared a few photographs from the preparations for <em>${eventName}</em>.`
    : `We\'ve opened a space to share what you remember from <em>${eventName}</em>. Add your own photographs, or simply look back on the evening.`
  const ctaLabel = phase === 'pre' ? 'View photographs' : 'Share what you remember'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${eventName}</title>
</head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#faf8f3;border:1px solid #e8e0d0;border-radius:8px;overflow:hidden;max-width:100%;">
        <tr>
          <td style="padding:40px 48px 32px;text-align:center;border-bottom:1px solid #e8e0d0;">
            <img src="${logoUrl}" alt="Woodinville Cookery Society" width="120" style="display:inline-block;" />
          </td>
        </tr>
        <tr>
          <td style="padding:40px 48px;">
            <p style="font-size:11px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#b87333;margin:0 0 24px;font-family:'Inter',sans-serif;text-align:center;">
              ${eventName}
            </p>
            <p style="font-size:22px;color:#2c4a2e;margin:0 0 20px;line-height:1.35;text-align:center;">
              ${heading}
            </p>
            <p style="font-size:14px;color:#4a6741;line-height:1.8;margin:0 0 32px;text-align:center;">
              Dear ${guestName},<br /><br />
              ${body}
            </p>
            <div style="text-align:center;">
              <a href="${galleryUrl}" style="display:inline-block;padding:14px 36px;background:#2c4a2e;color:#faf8f3;text-decoration:none;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;border-radius:4px;">
                ${ctaLabel}
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 48px 32px;text-align:center;border-top:1px solid #e8e0d0;">
            <p style="font-size:10px;color:#8a9e85;letter-spacing:0.12em;text-transform:uppercase;font-family:'Inter',sans-serif;margin:0;">
              Woodinville Cookery Society &middot; events@woodinvillecookery.com
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { eventId, phase, authorId, appUrl } = req.body
  if (!eventId || !phase || !authorId) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  if (!['pre', 'post'].includes(phase)) {
    return res.status(400).json({ error: 'Invalid phase' })
  }

  // Validate host
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, name, host_id')
    .eq('id', eventId)
    .single()

  if (eventError || !event) return res.status(404).json({ error: 'Event not found' })
  if (event.host_id !== authorId) return res.status(403).json({ error: 'Not authorized' })

  // Mark gallery open
  const column = phase === 'pre' ? 'pre_gallery_open' : 'post_gallery_open'
  const { error: updateError } = await supabase
    .from('events')
    .update({ [column]: true })
    .eq('id', eventId)

  if (updateError) return res.status(500).json({ error: updateError.message })

  // Fetch confirmed guests to notify
  const { data: guests } = await supabase
    .from('guests')
    .select('id, contacts(name, email)')
    .eq('event_id', eventId)
    .in('rsvp_status', ['attending', 'maybe'])

  const baseUrl = appUrl || 'https://woodinville-cookery.vercel.app'
  const subject = phase === 'pre'
    ? `A preview of what's to come — ${event.name}`
    : `The evening lives on — ${event.name}`

  const emailResults = await Promise.allSettled(
    (guests || [])
      .filter(g => g.contacts?.email)
      .map(g => {
        const galleryUrl = `${baseUrl}/gallery/${eventId}/${phase}`
        return resend.emails.send({
          from: 'Woodinville Cookery Society <events@woodinvillecookery.com>',
          to: g.contacts.email,
          replyTo: `"${event.name}" <events@woodinvillecookery.com>`,
          subject,
          html: galleryEmailHtml({
            guestName: g.contacts.name || 'Friend',
            eventName: event.name,
            galleryUrl,
            phase,
            appUrl: baseUrl,
          }),
        })
      })
  )

  const sent = emailResults.filter(r => r.status === 'fulfilled').length

  return res.status(200).json({ ok: true, notified: sent })
}

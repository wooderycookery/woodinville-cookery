import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

function renderHtml({ eventName, eventDate, hostNames, teaserLine, heroImageUrl, eventUrl }) {
  const heroSection = heroImageUrl
    ? `<img src="${heroImageUrl}" alt="" width="600" style="width:100%;max-height:320px;object-fit:cover;display:block;" />`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Save the Date — ${eventName}</title>
</head>
<body style="margin:0;padding:32px 0;background-color:#F9F6F1;font-family:Georgia,serif;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:4px;overflow:hidden;">
    ${heroSection}
    <div style="background-color:#1B3A2D;padding:16px 32px;text-align:center;">
      <p style="color:#F9F6F1;font-size:10px;letter-spacing:4px;margin:0;font-family:system-ui,sans-serif;">WOODINVILLE COOKERY SOCIETY</p>
    </div>
    <div style="padding:40px 48px;text-align:center;">
      <p style="color:#C8873C;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:system-ui,sans-serif;margin:0 0 16px;">Save the Date</p>
      <p style="color:#1B3A2D;font-size:28px;font-family:Georgia,serif;margin:0 0 12px;line-height:1.3;">${eventName}</p>
      <p style="color:#1B3A2D;font-size:18px;font-weight:bold;font-family:Georgia,serif;margin:0 0 24px;">${eventDate}</p>
      <hr style="border:none;border-top:1px solid rgba(27,58,45,0.1);margin:24px 0;" />
      <p style="color:#1B3A2D;font-size:14px;font-family:system-ui,sans-serif;margin:0 0 16px;opacity:0.7;">Hosted by ${hostNames}</p>
      <p style="color:#1B3A2D;font-size:18px;font-style:italic;font-family:Georgia,serif;margin:0 0 32px;line-height:1.5;">${teaserLine}</p>
      <hr style="border:none;border-top:1px solid rgba(27,58,45,0.1);margin:24px 0;" />
      <a href="${eventUrl}" style="display:inline-block;background-color:#1B3A2D;color:#F9F6F1;padding:12px 32px;border-radius:4px;text-decoration:none;font-size:13px;letter-spacing:1px;font-family:system-ui,sans-serif;">View Event Page</a>
    </div>
    <div style="background-color:#F9F6F1;padding:24px 48px;text-align:center;border-top:1px solid rgba(27,58,45,0.1);">
      <p style="color:#1B3A2D;font-size:13px;font-family:Georgia,serif;font-style:italic;margin:0 0 8px;opacity:0.8;">Full invitation coming soon — Woodinville Cookery Society</p>
      <p style="color:#1B3A2D;font-size:11px;font-family:system-ui,sans-serif;margin:0;opacity:0.4;">You received this because you were personally invited by your host.</p>
    </div>
  </div>
</body>
</html>`
}

function renderText({ eventName, eventDate, hostNames, teaserLine, eventUrl }) {
  return [
    'WOODINVILLE COOKERY SOCIETY',
    '',
    'SAVE THE DATE',
    '',
    eventName,
    eventDate,
    '',
    `Hosted by ${hostNames}`,
    '',
    teaserLine,
    '',
    `View the event page: ${eventUrl}`,
    '',
    'Full invitation coming soon — Woodinville Cookery Society',
    '',
    'You received this because you were personally invited by your host.',
  ].join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { eventId, eventName, eventDate, hostNames, teaserLine, heroImageUrl, emails, appUrl } = req.body

  if (!emails || emails.length === 0) {
    return res.status(400).json({ error: 'No recipient emails provided' })
  }

  const formattedDate = new Date(eventDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  })

  const eventUrl = `${appUrl}/event/${eventId}`
  const params = { eventName, eventDate: formattedDate, hostNames, teaserLine, heroImageUrl, eventUrl }
  const html = renderHtml(params)
  const text = renderText(params)

  const BATCH_SIZE = 100
  try {
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE).map(email => ({
        from: 'Woodinville Cookery Society <events@woodinvillecookery.com>',
        reply_to: 'events@woodinvillecookery.com',
        to: [email],
        subject: `Save the Date — ${eventName}`,
        html,
        text,
        headers: {
          'List-Unsubscribe': `<mailto:events@woodinvillecookery.com?subject=unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'X-Entity-Ref-ID': `wcs-std-${eventId}`,
        },
      }))
      await resend.batch.send(batch)
    }
    return res.status(200).json({ sent: emails.length })
  } catch (err) {
    console.error('Resend error:', err)
    return res.status(500).json({ error: err.message || 'Failed to send email' })
  }
}

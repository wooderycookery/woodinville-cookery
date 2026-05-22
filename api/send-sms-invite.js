import twilio from 'twilio'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { guests, eventId, eventName, eventDate, appUrl } = req.body
  if (!guests?.length || !eventId || !eventName || !eventDate) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  const from   = process.env.TWILIO_PHONE_NUMBER

  const shortDate = new Date(eventDate + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  })

  const results = await Promise.allSettled(
    guests.map(({ name, phone, token }) => {
      const firstName = (name || 'Friend').split(' ')[0]
      const link      = `${appUrl}/event/${eventId}?token=${token}`
      const body      = `${firstName}, you're invited to ${eventName} on ${shortDate}. Details + RSVP: ${link}`
      return client.messages.create({ body, from, to: phone })
    })
  )

  const sent   = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').map(r => r.reason?.message)

  return res.status(200).json({ sent, failed })
}

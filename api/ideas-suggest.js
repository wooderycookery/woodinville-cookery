import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { impulse } = req.body
  if (!impulse?.trim()) return res.status(400).json({ error: 'impulse is required' })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: `You help members of the Woodinville Cookery Society shape vague gathering impulses into two or three short, specific idea descriptions. Write in the voice of M.F.K. Fisher: warm, unhurried, precise, slightly literary. No exclamation marks. No bullet points or markdown. No marketing language. Each idea should be one or two sentences — a scene, not a slogan. Separate ideas with a blank line.`,
    messages: [{ role: 'user', content: impulse.trim() }],
  })

  const text = message.content[0]?.text || ''
  const suggestions = text.split(/\n\n+/).map(s => s.trim()).filter(Boolean)

  return res.status(200).json({ suggestions })
}

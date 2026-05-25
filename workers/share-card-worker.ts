type SharedRow = {
  id: string
  preview_path: string
}

type Env = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  PUBLIC_APP_URL: string
}

const DEFAULT_DESTINATION = 'https://macakuaya.github.io/DungeonThing/'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function previewPageHtml(params: {
  title: string
  description: string
  imageUrl?: string
  destinationUrl: string
}) {
  const title = escapeHtml(params.title)
  const description = escapeHtml(params.description)
  const destinationUrl = escapeHtml(params.destinationUrl)
  const imageUrl = params.imageUrl ? escapeHtml(params.imageUrl) : ''
  const imageMeta = params.imageUrl
    ? `
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:secure_url" content="${imageUrl}" />
    <meta property="og:image:type" content="image/png" />
    <meta name="twitter:image" content="${imageUrl}" />
  `
    : ''
  const imageBlock = params.imageUrl
    ? `<img src="${imageUrl}" alt="Dungeon preview" style="display:block;width:100%;max-width:720px;border-radius:12px;border:1px solid #2e303a;" />`
    : ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${destinationUrl}" />
    ${imageMeta}
    <meta name="twitter:card" content="${params.imageUrl ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
  </head>
  <body style="margin:0;background:#0f1014;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
    <main style="max-width:760px;margin:40px auto;padding:16px;">
      <h1 style="margin:0 0 8px 0;font-size:22px;">${title}</h1>
      <p style="margin:0 0 16px 0;color:#9ca3af;">${description}</p>
      ${imageBlock}
      <p style="margin:16px 0 0 0;">
        <a href="${destinationUrl}" style="display:inline-block;background:#1f2028;color:#e5e7eb;padding:10px 14px;border-radius:8px;text-decoration:none;border:1px solid #4b5563;">Open in DungeonThing</a>
      </p>
    </main>
  </body>
</html>`
}

async function fetchSharedRow(env: Env, shareId: string): Promise<SharedRow | null> {
  const restUrl = `${env.SUPABASE_URL}/rest/v1/shared_maps?id=eq.${encodeURIComponent(shareId)}&select=id,preview_path&limit=1`
  const response = await fetch(restUrl, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
  if (!response.ok) return null
  const rows = (await response.json()) as SharedRow[]
  return rows[0] ?? null
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const shareId = pathParts.length >= 2 && pathParts[0] === 's' ? pathParts[1] : null
    const destinationBase = env.PUBLIC_APP_URL || DEFAULT_DESTINATION

    if (!shareId || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      const html = previewPageHtml({
        title: 'DungeonThing Share',
        description: 'Open a shared dungeon map.',
        destinationUrl: destinationBase,
      })
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const row = await fetchSharedRow(env, shareId)
    if (!row) {
      const html = previewPageHtml({
        title: 'DungeonThing Share',
        description: 'This shared map was not found.',
        destinationUrl: destinationBase,
      })
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const imageUrl = `${env.SUPABASE_URL}/storage/v1/object/public/share-previews/${row.preview_path}`
    const destinationUrl = `${destinationBase}?share=${encodeURIComponent(shareId)}`
    const html = previewPageHtml({
      title: 'DungeonThing Map Share',
      description: 'Open this shared dungeon map in DungeonThing.',
      imageUrl,
      destinationUrl,
    })

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  },
}

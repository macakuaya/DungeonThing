import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const publicAppUrl = Deno.env.get('PUBLIC_APP_URL') ?? ''

const supabase = createClient(supabaseUrl, serviceRole)

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function pageTemplate(params: {
  title: string
  description: string
  imageUrl?: string
  destinationUrl: string
}) {
  const escapedTitle = escapeHtml(params.title)
  const escapedDescription = escapeHtml(params.description)
  const escapedDestination = escapeHtml(params.destinationUrl)
  const escapedImage = params.imageUrl ? escapeHtml(params.imageUrl) : ''
  const imageMeta = params.imageUrl
    ? `
    <meta property="og:image" content="${escapedImage}" />
    <meta property="og:image:secure_url" content="${escapedImage}" />
    <meta property="og:image:type" content="image/png" />
    <meta name="twitter:image" content="${escapedImage}" />
  `
    : ''

  const previewImage = params.imageUrl
    ? `<img src="${escapedImage}" alt="Dungeon preview" style="display:block;width:100%;max-width:720px;border-radius:12px;border:1px solid #2e303a;" />`
    : ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <meta name="description" content="${escapedDescription}" />
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDescription}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapedDestination}" />
    ${imageMeta}
    <meta name="twitter:card" content="${params.imageUrl ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:title" content="${escapedTitle}" />
    <meta name="twitter:description" content="${escapedDescription}" />
  </head>
  <body style="margin:0;background:#0f1014;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
    <main style="max-width:760px;margin:40px auto;padding:16px;">
      <h1 style="margin:0 0 8px 0;font-size:22px;">DungeonThing Map Share</h1>
      <p style="margin:0 0 16px 0;color:#9ca3af;">${escapedDescription}</p>
      ${previewImage}
      <p style="margin:16px 0 0 0;">
        <a href="${escapedDestination}" style="display:inline-block;background:#1f2028;color:#e5e7eb;padding:10px 14px;border-radius:8px;text-decoration:none;border:1px solid #4b5563;">Open in DungeonThing</a>
      </p>
    </main>
  </body>
</html>`
}

Deno.serve(async (request) => {
  const url = new URL(request.url)
  const pathId = url.pathname.split('/').filter(Boolean).pop()
  const id = pathId && pathId !== 'share-card' ? pathId : url.searchParams.get('id')
  const fallbackDestination = publicAppUrl || 'https://macakuaya.github.io/DungeonThing/'

  if (!id || !supabaseUrl || !serviceRole) {
    const html = pageTemplate({
      title: 'DungeonThing Share',
      description: 'Open a shared DungeonThing map.',
      destinationUrl: fallbackDestination,
    })
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const { data, error } = await supabase
    .from('shared_maps')
    .select('id, preview_path')
    .eq('id', id)
    .single()

  if (error || !data) {
    const html = pageTemplate({
      title: 'DungeonThing Share',
      description: 'This shared map was not found.',
      destinationUrl: fallbackDestination,
    })
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const imageUrl = `${supabaseUrl}/storage/v1/object/public/share-previews/${data.preview_path}`
  const destinationUrl = `${fallbackDestination}?share=${encodeURIComponent(id)}`

  const html = pageTemplate({
    title: 'DungeonThing Map Share',
    description: 'Open this shared dungeon map in DungeonThing.',
    imageUrl,
    destinationUrl,
  })

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
})

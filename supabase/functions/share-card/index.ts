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
    <meta name="twitter:image" content="${escapedImage}" />
  `
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
    <meta http-equiv="refresh" content="0;url=${escapedDestination}" />
    <script>
      window.location.replace(${JSON.stringify(params.destinationUrl)})
    </script>
  </head>
  <body style="font-family: system-ui, sans-serif; padding: 16px;">
    <p>Opening shared dungeon...</p>
    <p><a href="${escapedDestination}">Continue</a></p>
  </body>
</html>`
}

Deno.serve(async (request) => {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const fallbackDestination = publicAppUrl || 'https://macakuaya.github.io/DungeonThing/'

  if (!id || !supabaseUrl || !serviceRole) {
    const html = pageTemplate({
      title: 'DungeonThing Share',
      description: 'Open a shared DungeonThing map.',
      destinationUrl: fallbackDestination,
    })
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
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
      headers: { 'content-type': 'text/html; charset=utf-8' },
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
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
})

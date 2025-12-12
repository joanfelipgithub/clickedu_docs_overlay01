// logging-service.js
// Deploy this as a Cloudflare Worker (free tier available)
// Alternative: Use AWS Lambda, Vercel Edge Functions, or Netlify Functions

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

// Configuration
const CONFIG = {
  // Change this to a secure random string
  API_KEY: 'your-secret-api-key-change-this',
  
  // Maximum events to store (Cloudflare KV has limits on free tier)
  MAX_EVENTS: 10000,
  
  // Rate limiting: max events per IP per minute
  RATE_LIMIT: 100,
  
  // Allowed origins (your GitHub Pages domain)
  ALLOWED_ORIGINS: [
    'https://joanfelipgithub.github.io',
    'https://insscf.clickedu.eu'
  ]
}

async function handleRequest(request) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Will be restricted below
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  }

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Only allow POST
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: corsHeaders 
    })
  }

  try {
    // Verify origin
    const origin = request.headers.get('Origin')
    if (!CONFIG.ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Unauthorized origin', { 
        status: 403,
        headers: corsHeaders 
      })
    }

    // Verify API key
    const apiKey = request.headers.get('X-API-Key')
    if (apiKey !== CONFIG.API_KEY) {
      return new Response('Invalid API key', { 
        status: 401,
        headers: corsHeaders 
      })
    }

    // Parse event data
    const event = await request.json()
    
    // Rate limiting check
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown'
    const rateLimitKey = `ratelimit:${clientIP}:${Math.floor(Date.now() / 60000)}`
    
    // Get current count (if using Cloudflare KV)
    // const count = await LOGS.get(rateLimitKey) || 0
    // if (count > CONFIG.RATE_LIMIT) {
    //   return new Response('Rate limit exceeded', { 
    //     status: 429,
    //     headers: corsHeaders 
    //   })
    // }
    
    // Enrich event with server-side data
    const enrichedEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      clientIP: clientIP,
      userAgent: request.headers.get('User-Agent'),
      referer: request.headers.get('Referer'),
      country: request.headers.get('CF-IPCountry'),
      eventId: generateEventId()
    }

    // Validate event structure
    if (!validateEvent(enrichedEvent)) {
      return new Response('Invalid event structure', { 
        status: 400,
        headers: corsHeaders 
      })
    }

    // Check for suspicious patterns
    const securityCheck = checkSecurityPatterns(enrichedEvent)
    if (securityCheck.isSuspicious) {
      enrichedEvent.securityFlags = securityCheck.flags
      enrichedEvent.severity = 'HIGH'
      
      // Send alert (implement your alerting logic)
      await sendAlert(enrichedEvent)
    }

    // Store event
    await storeEvent(enrichedEvent)

    // Log to console for real-time monitoring
    console.log('[SECURITY EVENT]', JSON.stringify(enrichedEvent))

    return new Response(JSON.stringify({ 
      success: true, 
      eventId: enrichedEvent.eventId 
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    console.error('[ERROR]', error)
    return new Response('Internal server error', { 
      status: 500,
      headers: corsHeaders 
    })
  }
}

function validateEvent(event) {
  // Required fields
  const required = ['eventType', 'timestamp']
  for (const field of required) {
    if (!event[field]) return false
  }
  
  // Event type whitelist
  const validTypes = [
    'overlay_opened',
    'overlay_closed',
    'document_clicked',
    'security_warning',
    'security_block',
    'sheet_edit_accessed',
    'error'
  ]
  
  if (!validTypes.includes(event.eventType)) return false
  
  return true
}

function checkSecurityPatterns(event) {
  const flags = []
  let isSuspicious = false

  // Pattern 1: Too many overlay opens
  if (event.eventType === 'overlay_opened' && event.metadata?.openCount > 50) {
    flags.push('excessive_overlay_opens')
    isSuspicious = true
  }

  // Pattern 2: Blocked domain access attempts
  if (event.eventType === 'security_block' && event.metadata?.reason === 'Domini no autoritzat') {
    flags.push('blocked_domain_access')
    isSuspicious = true
  }

  // Pattern 3: Rapid-fire document clicks (potential bot)
  if (event.eventType === 'document_clicked' && event.metadata?.timeSinceLastClick < 100) {
    flags.push('rapid_clicking')
    isSuspicious = true
  }

  // Pattern 4: Sheet edit access from unexpected IP
  if (event.eventType === 'sheet_edit_accessed') {
    flags.push('sheet_edit_attempt')
    isSuspicious = true // Always flag for review
  }

  // Pattern 5: Error patterns that might indicate attack
  if (event.eventType === 'error' && event.metadata?.errorMessage?.includes('CORS')) {
    flags.push('cors_error')
  }

  return { isSuspicious, flags }
}

async function storeEvent(event) {
  // Option 1: Store in Cloudflare KV (simple key-value store)
  // await LOGS.put(event.eventId, JSON.stringify(event), {
  //   expirationTtl: 2592000 // 30 days
  // })

  // Option 2: Send to external logging service
  // Examples: Logtail, Sentry, DataDog, LogDNA
  
  // Example: Send to Logtail (formerly Timber)
  // await fetch('https://in.logtail.com/', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': 'Bearer YOUR_LOGTAIL_TOKEN',
  //     'Content-Type': 'application/json'
  //   },
  //   body: JSON.stringify(event)
  // })

  // Option 3: Send to Google Sheets (ironic but works!)
  // await appendToSheet(event)
  
  // For now, just log it (Cloudflare Workers logs are accessible)
  console.log('[STORED]', event.eventId)
}

async function sendAlert(event) {
  // Option 1: Send email via SendGrid, Mailgun, etc.
  // await fetch('https://api.sendgrid.com/v3/mail/send', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': 'Bearer YOUR_SENDGRID_API_KEY',
  //     'Content-Type': 'application/json'
  //   },
  //   body: JSON.stringify({
  //     personalizations: [{
  //       to: [{ email: 'admin@example.com' }]
  //     }],
  //     from: { email: 'security@example.com' },
  //     subject: '🚨 Security Alert: Suspicious Activity Detected',
  //     content: [{
  //       type: 'text/plain',
  //       value: `Event: ${event.eventType}\nFlags: ${event.securityFlags.join(', ')}\nDetails: ${JSON.stringify(event, null, 2)}`
  //     }]
  //   })
  // })

  // Option 2: Send to Slack
  // await fetch('YOUR_SLACK_WEBHOOK_URL', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     text: `🚨 *Security Alert*\nEvent: ${event.eventType}\nFlags: ${event.securityFlags.join(', ')}\nIP: ${event.clientIP}\nCountry: ${event.country}`
  //   })
  // })

  console.log('[ALERT SENT]', event.securityFlags)
}

function generateEventId() {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Export for use with Cloudflare Workers
export default {
  fetch: handleRequest
}

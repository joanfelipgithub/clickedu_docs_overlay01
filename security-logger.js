// security-logger.js
// Add this to the top of bookmarklet.js, after SECURITY_CONFIG

// ============================================================================
// SERVER-SIDE LOGGING CONFIGURATION
// ============================================================================

const LOGGING_CONFIG = {
  enabled: true, // Set to false to disable logging
  endpoint: 'https://your-worker.your-subdomain.workers.dev/log', // Your Cloudflare Worker URL
  apiKey: 'your-secret-api-key-change-this', // Must match server
  batchSize: 10, // Send logs in batches
  flushInterval: 30000, // Flush every 30 seconds
  maxRetries: 3
};

// Event queue for batching
let eventQueue = [];
let flushTimer = null;

// Session tracking
const sessionId = generateSessionId();
let eventCounter = 0;
let sessionStartTime = Date.now();

/**
 * Main logging function - sends events to server
 */
async function logSecurityEventToServer(eventType, metadata = {}) {
  if (!LOGGING_CONFIG.enabled) return;

  const event = {
    eventType: eventType,
    sessionId: sessionId,
    eventNumber: ++eventCounter,
    sessionDuration: Date.now() - sessionStartTime,
    url: location.href,
    metadata: {
      ...metadata,
      userAgent: navigator.userAgent,
      language: navigator.language,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  };

  // Add to queue
  eventQueue.push(event);

  // If queue is full, flush immediately
  if (eventQueue.length >= LOGGING_CONFIG.batchSize) {
    await flushEvents();
  } else {
    // Otherwise, schedule a flush
    scheduleFlush();
  }
}

/**
 * Send queued events to server
 */
async function flushEvents() {
  if (eventQueue.length === 0) return;

  const eventsToSend = [...eventQueue];
  eventQueue = [];

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  try {
    const response = await fetch(LOGGING_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': LOGGING_CONFIG.apiKey
      },
      body: JSON.stringify({
        events: eventsToSend,
        batchId: generateBatchId()
      })
    });

    if (!response.ok) {
      console.warn('[LOGGING] Failed to send events:', response.status);
      // Re-queue events for retry (with limit)
      if (eventsToSend.length < 100) {
        eventQueue.unshift(...eventsToSend);
      }
    } else {
      console.log('[LOGGING] Successfully sent', eventsToSend.length, 'events');
    }
  } catch (error) {
    console.error('[LOGGING] Error sending events:', error);
    // Re-queue on network error
    if (eventsToSend.length < 100) {
      eventQueue.unshift(...eventsToSend);
    }
  }
}

/**
 * Schedule event flush
 */
function scheduleFlush() {
  if (flushTimer) return; // Already scheduled
  
  flushTimer = setTimeout(() => {
    flushEvents();
  }, LOGGING_CONFIG.flushInterval);
}

/**
 * Flush on page unload
 */
window.addEventListener('beforeunload', () => {
  if (eventQueue.length > 0) {
    // Use sendBeacon for reliable unload sending
    const blob = new Blob([JSON.stringify({
      events: eventQueue,
      batchId: generateBatchId()
    })], { type: 'application/json' });
    
    navigator.sendBeacon(LOGGING_CONFIG.endpoint, blob);
  }
});

/**
 * Helper functions
 */
function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateBatchId() {
  return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// ENHANCED SECURITY LOGGING WITH SERVER INTEGRATION
// ============================================================================

// Replace the existing logSecurity function with this enhanced version
function logSecurity(level, message, metadata = {}) {
  if (!SECURITY_CONFIG.enableSecurityLogging) return;
  
  const prefix = '🔒 [SECURITY]';
  
  // Console logging (local)
  switch(level) {
    case 'warn': console.warn(prefix, message); break;
    case 'error': console.error(prefix, message); break;
    default: console.log(prefix, message);
  }
  
  // Server logging (remote)
  const eventType = getEventTypeFromMessage(level, message);
  logSecurityEventToServer(eventType, {
    level: level,
    message: message,
    ...metadata
  });
}

function getEventTypeFromMessage(level, message) {
  // Map log messages to event types
  if (message.includes('Blocked')) return 'security_block';
  if (message.includes('opened Google Sheets')) return 'sheet_edit_accessed';
  if (message.includes('User opened:')) return 'document_clicked';
  if (message.includes('Bookmarklet initialized')) return 'overlay_opened';
  if (message.includes('Failed to load')) return 'error';
  return 'security_event';
}

// ============================================================================
// ADD LOGGING TO KEY EVENTS
// ============================================================================

// Modify the openOverlay function to include logging
const originalOpenOverlay = openOverlay;
function openOverlay() {
  logSecurityEventToServer('overlay_opened', {
    timestamp: new Date().toISOString(),
    openCount: (parseInt(localStorage.getItem('overlayOpenCount') || '0') + 1)
  });
  localStorage.setItem('overlayOpenCount', parseInt(localStorage.getItem('overlayOpenCount') || '0') + 1);
  originalOpenOverlay();
}

// Modify the closeOverlay function
const originalCloseOverlay = closeOverlay;
function closeOverlay() {
  const openDuration = Date.now() - (window.overlayOpenTime || Date.now());
  logSecurityEventToServer('overlay_closed', {
    duration: openDuration
  });
  originalCloseOverlay();
}

// Track when overlay is opened
window.addEventListener('load', () => {
  window.overlayOpenTime = Date.now();
});

// Log document clicks
const originalBuildUI = buildUI;
function buildUI(groups, overlay) {
  // Call original
  originalBuildUI(groups, overlay);
  
  // Add logging to all buttons
  overlay.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = btn.getAttribute('data-url');
      const isExternal = btn.style.background.includes('ff9800');
      
      logSecurityEventToServer('document_clicked', {
        url: url,
        label: btn.textContent.replace('🌐 ', ''),
        isExternal: isExternal,
        timeSinceLastClick: Date.now() - (window.lastClickTime || 0)
      });
      
      window.lastClickTime = Date.now();
    });
  });
}

// Log security blocks
const originalIsURLSafe = isURLSafe;
function isURLSafe(urlString) {
  const result = originalIsURLSafe(urlString);
  
  if (!result.safe) {
    logSecurityEventToServer('security_block', {
      url: urlString,
      reason: result.reason,
      timestamp: new Date().toISOString()
    });
  }
  
  return result;
}

// Log errors
window.addEventListener('error', (event) => {
  logSecurityEventToServer('error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
});

// Log unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  logSecurityEventToServer('error', {
    type: 'unhandled_rejection',
    reason: event.reason?.toString()
  });
});

console.log('[LOGGING] Security logging initialized with session:', sessionId);

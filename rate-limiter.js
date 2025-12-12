// rate-limiter.js
// Add this to bookmarklet.js for client-side rate limiting

// ============================================================================
// RATE LIMITING CONFIGURATION
// ============================================================================

const RATE_LIMIT_CONFIG = {
  // Maximum overlay opens per time window
  maxOverlayOpens: 20,
  overlayWindow: 60000, // 1 minute
  
  // Maximum document clicks per time window
  maxDocumentClicks: 50,
  documentWindow: 60000, // 1 minute
  
  // Maximum failed attempts before lockout
  maxFailedAttempts: 5,
  lockoutDuration: 300000, // 5 minutes
  
  // Storage key prefix
  storagePrefix: 'ratelimit_'
};

/**
 * Rate limiter class
 */
class RateLimiter {
  constructor(action, maxAttempts, windowMs) {
    this.action = action;
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.storageKey = `${RATE_LIMIT_CONFIG.storagePrefix}${action}`;
  }
  
  /**
   * Check if action is allowed
   */
  isAllowed() {
    const now = Date.now();
    const attempts = this.getAttempts();
    
    // Clean old attempts outside the window
    const validAttempts = attempts.filter(timestamp => 
      now - timestamp < this.windowMs
    );
    
    // Check if limit exceeded
    if (validAttempts.length >= this.maxAttempts) {
      const oldestAttempt = Math.min(...validAttempts);
      const timeToWait = this.windowMs - (now - oldestAttempt);
      
      logSecurity('warn', `Rate limit exceeded for ${this.action}`, {
        attempts: validAttempts.length,
        maxAttempts: this.maxAttempts,
        timeToWait: Math.ceil(timeToWait / 1000)
      });
      
      return {
        allowed: false,
        timeToWait: Math.ceil(timeToWait / 1000)
      };
    }
    
    // Record this attempt
    validAttempts.push(now);
    this.saveAttempts(validAttempts);
    
    return {
      allowed: true,
      remainingAttempts: this.maxAttempts - validAttempts.length
    };
  }
  
  /**
   * Get attempts from storage
   */
  getAttempts() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }
  
  /**
   * Save attempts to storage
   */
  saveAttempts(attempts) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(attempts));
    } catch (error) {
      console.warn('Failed to save rate limit data:', error);
    }
  }
  
  /**
   * Reset attempts
   */
  reset() {
    localStorage.removeItem(this.storageKey);
  }
}

/**
 * Lockout manager for repeated violations
 */
class LockoutManager {
  constructor() {
    this.storageKey = `${RATE_LIMIT_CONFIG.storagePrefix}lockout`;
  }
  
  /**
   * Check if currently locked out
   */
  isLockedOut() {
    const lockout = this.getLockout();
    
    if (!lockout) return false;
    
    const now = Date.now();
    if (now < lockout.until) {
      const timeRemaining = Math.ceil((lockout.until - now) / 1000);
      
      return {
        locked: true,
        timeRemaining: timeRemaining,
        reason: lockout.reason
      };
    }
    
    // Lockout expired, clear it
    this.clearLockout();
    return { locked: false };
  }
  
  /**
   * Record a violation
   */
  recordViolation(reason) {
    const violations = this.getViolations();
    violations.push({
      timestamp: Date.now(),
      reason: reason
    });
    
    // Keep only recent violations (last 5 minutes)
    const recentViolations = violations.filter(v => 
      Date.now() - v.timestamp < 300000
    );
    
    this.saveViolations(recentViolations);
    
    // Check if should lock out
    if (recentViolations.length >= RATE_LIMIT_CONFIG.maxFailedAttempts) {
      this.lockout(reason);
      return true;
    }
    
    return false;
  }
  
  /**
   * Lock out the user
   */
  lockout(reason) {
    const lockout = {
      until: Date.now() + RATE_LIMIT_CONFIG.lockoutDuration,
      reason: reason,
      timestamp: Date.now()
    };
    
    localStorage.setItem(this.storageKey, JSON.stringify(lockout));
    
    logSecurity('error', 'User locked out due to repeated violations', {
      reason: reason,
      duration: RATE_LIMIT_CONFIG.lockoutDuration / 1000
    });
  }
  
  /**
   * Clear lockout
   */
  clearLockout() {
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(`${this.storageKey}_violations`);
  }
  
  /**
   * Get current lockout
   */
  getLockout() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }
  
  /**
   * Get violations
   */
  getViolations() {
    try {
      const stored = localStorage.getItem(`${this.storageKey}_violations`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }
  
  /**
   * Save violations
   */
  saveViolations(violations) {
    try {
      localStorage.setItem(`${this.storageKey}_violations`, JSON.stringify(violations));
    } catch (error) {
      console.warn('Failed to save violations:', error);
    }
  }
}

// Create rate limiters
const overlayLimiter = new RateLimiter(
  'overlay_open', 
  RATE_LIMIT_CONFIG.maxOverlayOpens,
  RATE_LIMIT_CONFIG.overlayWindow
);

const documentLimiter = new RateLimiter(
  'document_click',
  RATE_LIMIT_CONFIG.maxDocumentClicks,
  RATE_LIMIT_CONFIG.documentWindow
);

const lockoutManager = new LockoutManager();

// ============================================================================
// INTEGRATE WITH EXISTING FUNCTIONS
// ============================================================================

/**
 * Wrap openOverlay with rate limiting
 */
const originalOpenOverlay = openOverlay;
function openOverlay() {
  // Check lockout first
  const lockout = lockoutManager.isLockedOut();
  if (lockout.locked) {
    alert(
      `🚫 ACCÉS BLOCAT\n\n` +
      `El teu accés ha estat temporalment blocat degut a:\n${lockout.reason}\n\n` +
      `Temps restant: ${lockout.timeRemaining} segons\n\n` +
      `Si creus que això és un error, contacta amb l'administrador.`
    );
    return;
  }
  
  // Check rate limit
  const rateCheck = overlayLimiter.isAllowed();
  if (!rateCheck.allowed) {
    const shouldLockout = lockoutManager.recordViolation('Rate limit exceeded for overlay opens');
    
    if (shouldLockout) {
      alert(
        `🚫 MASSA INTENTS\n\n` +
        `Has superat el límit d'intents permesos.\n` +
        `El teu accés ha estat blocat durant 5 minuts.\n\n` +
        `Si necessites ajuda, contacta amb l'administrador.`
      );
    } else {
      alert(
        `⏱️ LÍMIT DE VELOCITAT\n\n` +
        `Has obert l'overlay massa vegades.\n` +
        `Espera ${rateCheck.timeToWait} segons abans de tornar-ho a intentar.\n\n` +
        `Límit: ${RATE_LIMIT_CONFIG.maxOverlayOpens} vegades per minut`
      );
    }
    
    return;
  }
  
  // Log remaining attempts (for debugging)
  if (rateCheck.remainingAttempts <= 5) {
    console.warn(`⚠️ Overlay opens remaining: ${rateCheck.remainingAttempts}`);
  }
  
  // Proceed with opening
  originalOpenOverlay();
}

/**
 * Add rate limiting to document clicks
 */
function addRateLimitToDocumentClicks() {
  // This will be called when building UI
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-doc-url]');
    if (!btn) return;
    
    // Check rate limit
    const rateCheck = documentLimiter.isAllowed();
    if (!rateCheck.allowed) {
      e.stopImmediatePropagation();
      e.preventDefault();
      
      const shouldLockout = lockoutManager.recordViolation('Rate limit exceeded for document clicks');
      
      if (shouldLockout) {
        alert(
          `🚫 MASSA CLICS\n\n` +
          `Has fet clic en documents massa ràpidament.\n` +
          `El teu accés ha estat blocat durant 5 minuts.`
        );
        closeOverlay();
      } else {
        alert(
          `⏱️ LÍMIT DE CLICS\n\n` +
          `Has fet clic en documents massa vegades.\n` +
          `Espera ${rateCheck.timeToWait} segons.\n\n` +
          `Límit: ${RATE_LIMIT_CONFIG.maxDocumentClicks} clics per minut`
        );
      }
      
      return;
    }
    
    // Log warning if close to limit
    if (rateCheck.remainingAttempts <= 10) {
      console.warn(`⚠️ Document clicks remaining: ${rateCheck.remainingAttempts}`);
    }
  }, true); // Use capture phase to intercept before other handlers
}

// Initialize rate limiting on load
window.addEventListener('load', () => {
  addRateLimitToDocumentClicks();
  
  // Check if locked out on page load
  const lockout = lockoutManager.isLockedOut();
  if (lockout.locked) {
    console.warn(`🚫 User is locked out for ${lockout.timeRemaining} more seconds`);
  }
});

/**
 * Admin function to reset rate limits (add to Ctrl+Shift+R for example)
 */
function resetRateLimits() {
  if (confirm('Estàs segur que vols resetejar els límits de velocitat?')) {
    overlayLimiter.reset();
    documentLimiter.reset();
    lockoutManager.clearLockout();
    alert('✅ Límits de velocitat resetejats');
    logSecurity('info', 'Rate limits reset by user');
  }
}

// Add reset shortcut for admins
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    resetRateLimits();
  }
});

/**
 * Display rate limit status in console
 */
function showRateLimitStatus() {
  console.log('📊 RATE LIMIT STATUS');
  console.log('='.repeat(50));
  
  const overlayAttempts = overlayLimiter.getAttempts();
  const documentAttempts = documentLimiter.getAttempts();
  const lockout = lockoutManager.isLockedOut();
  
  console.log(`Overlay Opens: ${overlayAttempts.length}/${RATE_LIMIT_CONFIG.maxOverlayOpens}`);
  console.log(`Document Clicks: ${documentAttempts.length}/${RATE_LIMIT_CONFIG.maxDocumentClicks}`);
  
  if (lockout.locked) {
    console.log(`🚫 LOCKED OUT: ${lockout.timeRemaining}s remaining`);
    console.log(`   Reason: ${lockout.reason}`);
  } else {
    console.log(`✅ Not locked out`);
  }
  
  console.log('='.repeat(50));
}

// Auto-show status every 30 seconds (for debugging)
if (SECURITY_CONFIG.enableSecurityLogging) {
  setInterval(showRateLimitStatus, 30000);
}

console.log('[RATE LIMITING] Initialized with limits:', {
  overlayOpens: `${RATE_LIMIT_CONFIG.maxOverlayOpens}/min`,
  documentClicks: `${RATE_LIMIT_CONFIG.maxDocumentClicks}/min`,
  lockoutDuration: `${RATE_LIMIT_CONFIG.lockoutDuration / 1000}s`
});

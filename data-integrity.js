// data-integrity.js
// Add this to bookmarklet.js for data integrity verification

// ============================================================================
// DATA INTEGRITY CONFIGURATION
// ============================================================================

const INTEGRITY_CONFIG = {
  // Enable/disable integrity checks
  enabled: true,
  
  // Expected hash of the CSV data (update this when Sheet changes)
  // Generate with: node generate-csv-hash.js
  expectedHash: null, // Set to null to disable, or 'sha256-abc123...' to enable
  
  // Hash algorithm
  algorithm: 'SHA-256',
  
  // Allow bypass for admins (with warning)
  allowBypass: true,
  
  // Store hash history for rollback
  storeHashHistory: true
};

/**
 * Generate SHA-256 hash of data
 */
async function generateHash(data) {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest(INTEGRITY_CONFIG.algorithm, dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Verify data integrity
 */
async function verifyDataIntegrity(data) {
  if (!INTEGRITY_CONFIG.enabled || !INTEGRITY_CONFIG.expectedHash) {
    // Integrity checking disabled
    return {
      verified: true,
      skipped: true,
      message: 'Integrity checking disabled'
    };
  }
  
  try {
    const actualHash = await generateHash(data);
    const expectedHash = INTEGRITY_CONFIG.expectedHash.replace('sha256-', '');
    
    if (actualHash === expectedHash) {
      logSecurity('info', 'Data integrity verified', {
        hash: actualHash.substring(0, 16) + '...'
      });
      
      return {
        verified: true,
        hash: actualHash,
        message: 'Data integrity verified successfully'
      };
    } else {
      logSecurity('error', 'Data integrity check FAILED', {
        expected: expectedHash.substring(0, 16) + '...',
        actual: actualHash.substring(0, 16) + '...'
      });
      
      return {
        verified: false,
        hash: actualHash,
        expectedHash: expectedHash,
        message: 'Data has been modified or corrupted'
      };
    }
  } catch (error) {
    console.error('Integrity check error:', error);
    return {
      verified: false,
      error: error.message,
      message: 'Failed to perform integrity check'
    };
  }
}

/**
 * Store hash in history
 */
function storeHashInHistory(hash, timestamp = Date.now()) {
  if (!INTEGRITY_CONFIG.storeHashHistory) return;
  
  try {
    const historyKey = 'integrity_hash_history';
    const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
    
    history.push({
      hash: hash,
      timestamp: timestamp,
      date: new Date(timestamp).toISOString()
    });
    
    // Keep only last 50 hashes
    if (history.length > 50) {
      history.shift();
    }
    
    localStorage.setItem(historyKey, JSON.stringify(history));
  } catch (error) {
    console.warn('Failed to store hash history:', error);
  }
}

/**
 * Get hash history
 */
function getHashHistory() {
  try {
    const historyKey = 'integrity_hash_history';
    return JSON.parse(localStorage.getItem(historyKey) || '[]');
  } catch {
    return [];
  }
}

/**
 * Show integrity error dialog
 */
function showIntegrityError(verificationResult) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'rgba(0,0,0,0.95)',
      zIndex: 99999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    });
    
    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
      background: '#fff',
      borderRadius: '12px',
      padding: '30px',
      maxWidth: '600px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
      border: '3px solid #dc3545'
    });
    
    dialog.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 64px; margin-bottom: 20px;">🚨</div>
        <h2 style="color: #dc3545; margin: 0 0 20px 0;">ALERTA DE SEGURETAT</h2>
        <p style="font-size: 18px; line-height: 1.6; margin-bottom: 20px;">
          Les dades del Google Sheet han estat <strong>modificades</strong> 
          des de l'última versió verificada.
        </p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: left;">
          <strong>Possibles causes:</strong>
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li>Un administrador ha actualitzat el contingut (normal)</li>
            <li>Les dades han estat alterades maliciosament (perillós)</li>
            <li>Error de xarxa o memòria cau (temporal)</li>
          </ul>
        </div>
        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
          <strong>⚠️ Recomanació:</strong><br>
          Contacta amb l'administrador abans de continuar.
        </div>
        <div style="display: flex; gap: 10px; justify-content: center;">
          <button id="integrity-cancel" style="
            padding: 12px 24px;
            font-size: 16px;
            font-weight: bold;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            background: #6c757d;
            color: white;
          ">
            🚫 Cancel·lar
          </button>
          ${INTEGRITY_CONFIG.allowBypass ? `
            <button id="integrity-continue" style="
              padding: 12px 24px;
              font-size: 16px;
              font-weight: bold;
              border: none;
              border-radius: 8px;
              cursor: pointer;
              background: #ffc107;
              color: #000;
            ">
              ⚠️ Continuar igualment
            </button>
          ` : ''}
        </div>
        ${INTEGRITY_CONFIG.allowBypass ? `
          <p style="font-size: 12px; color: #666; margin-top: 15px;">
            Si continues, assumeixes els riscos de seguretat associats.
          </p>
        ` : ''}
      </div>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // Event handlers
    const cancelBtn = dialog.querySelector('#integrity-cancel');
    const continueBtn = dialog.querySelector('#integrity-continue');
    
    cancelBtn.onclick = () => {
      overlay.remove();
      resolve(false);
    };
    
    if (continueBtn) {
      continueBtn.onclick = () => {
        if (confirm('⚠️ ÚLTIMA ADVERTÈNCIA\n\nEstàs segur que vols continuar malgrat el risc de seguretat?')) {
          overlay.remove();
          logSecurity('warn', 'User bypassed integrity check');
          resolve(true);
        }
      };
    }
  });
}

/**
 * Modified loadDocs with integrity checking
 */
async function loadDocsWithIntegrityCheck(overlay, loadingMsg) {
  const SHEET_URL = "https://docs.google.com/spreadsheets/d/1iAF3p81G8DdByShDyfz4ShoweV80QWuoQ7wWSzZUORQ/export?format=csv&gid=0";
  
  try {
    logSecurity('info', 'Fetching documents from Google Sheets...');
    
    // Fetch CSV
    const csv = await loadCSVviaXHR(SHEET_URL);
    
    // Check integrity
    loadingMsg.textContent = "🔒 Verificant integritat de les dades...";
    const integrityCheck = await verifyDataIntegrity(csv);
    
    if (!integrityCheck.verified && !integrityCheck.skipped) {
      // Integrity check failed
      const shouldContinue = await showIntegrityError(integrityCheck);
      
      if (!shouldContinue) {
        throw new Error('User cancelled due to integrity check failure');
      }
      
      // User chose to continue despite failure
      logSecurity('warn', 'Continuing with unverified data', {
        actualHash: integrityCheck.hash?.substring(0, 16)
      });
    }
    
    // Store hash in history
    if (integrityCheck.hash) {
      storeHashInHistory(integrityCheck.hash);
    }
    
    // Check if we actually got CSV data
    if (!csv || csv.trim().length === 0) {
      throw new Error("El Google Sheet està buit o no és accessible");
    }
    
    // Parse and validate CSV
    loadingMsg.textContent = "🔍 Processant documents...";
    const docs = parseCSV(csv);
    const validatedDocs = validateAndFilterDocs(docs);
    
    loadingMsg.remove();
    
    if (!Object.keys(validatedDocs.valid).length) { 
      showError("⚠️ No s'han trobat documents vàlids al Google Sheet", overlay); 
      return; 
    }
    
    // Show security summary if items were blocked
    if (validatedDocs.blocked.length > 0) {
      showSecurityWarning(overlay, validatedDocs.blocked);
    }
    
    // Show integrity status badge
    if (integrityCheck.verified && !integrityCheck.skipped) {
      showIntegrityBadge(overlay, 'verified');
    } else if (!integrityCheck.verified && !integrityCheck.skipped) {
      showIntegrityBadge(overlay, 'bypassed');
    }
    
    buildUI(validatedDocs.valid, overlay);
    
    logSecurity('info', `Loaded ${countDocs(validatedDocs.valid)} valid documents`);
    
  } catch (err) {
    loadingMsg.remove();
    
    // ... (existing error handling)
  }
}

/**
 * Show integrity status badge
 */
function showIntegrityBadge(overlay, status) {
  const badge = document.createElement('div');
  
  if (status === 'verified') {
    Object.assign(badge.style, {
      position: 'fixed',
      top: '70px',
      right: '10px',
      background: '#28a745',
      color: 'white',
      padding: '8px 15px',
      borderRadius: '20px',
      fontSize: '13px',
      fontWeight: 'bold',
      zIndex: 10000,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    });
    badge.innerHTML = '✅ Dades Verificades';
  } else if (status === 'bypassed') {
    Object.assign(badge.style, {
      position: 'fixed',
      top: '70px',
      right: '10px',
      background: '#ffc107',
      color: '#000',
      padding: '8px 15px',
      borderRadius: '20px',
      fontSize: '13px',
      fontWeight: 'bold',
      zIndex: 10000,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    });
    badge.innerHTML = '⚠️ Verificació Bypassed';
  }
  
  overlay.appendChild(badge);
}

/**
 * Generate CSV hash script (for admins to run locally)
 */
function generateCSVHashScript() {
  return `
// generate-csv-hash.js
// Run this script after updating the Google Sheet
// Usage: node generate-csv-hash.js

const crypto = require('crypto');
const https = require('https');

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1iAF3p81G8DdByShDyfz4ShoweV80QWuoQ7wWSzZUORQ/export?format=csv&gid=0';

https.get(SHEET_URL, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    
    console.log('='.repeat(80));
    console.log('CSV INTEGRITY HASH GENERATED');
    console.log('='.repeat(80));
    console.log('');
    console.log('Hash:', hash);
    console.log('');
    console.log('UPDATE THIS IN bookmarklet.js:');
    console.log('');
    console.log(\`  expectedHash: 'sha256-\${hash}',\`);
    console.log('');
    console.log('='.repeat(80));
    
    // Save to file
    const fs = require('fs');
    fs.writeFileSync('csv-hash.txt', \`sha256-\${hash}\`);
    console.log('✅ Hash saved to csv-hash.txt');
  });
}).on('error', (err) => {
  console.error('Error fetching CSV:', err);
});
  `.trim();
}

// Log script to console for admin reference
if (SECURITY_CONFIG.enableSecurityLogging) {
  console.log('[INTEGRITY] To generate hash after Sheet update, use:');
  console.log(generateCSVHashScript());
}

console.log('[INTEGRITY] Data integrity checking initialized:', {
  enabled: INTEGRITY_CONFIG.enabled,
  hasExpectedHash: !!INTEGRITY_CONFIG.expectedHash,
  allowBypass: INTEGRITY_CONFIG.allowBypass
});

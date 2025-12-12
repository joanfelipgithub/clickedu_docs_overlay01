// google-sheets-oauth.js
// Add this to bookmarklet.js to use Google Sheets API with OAuth

// ============================================================================
// GOOGLE SHEETS API CONFIGURATION
// ============================================================================

const GOOGLE_API_CONFIG = {
  // Get these from: https://console.cloud.google.com/
  clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  apiKey: 'YOUR_API_KEY',
  
  // Google Sheets API endpoint
  spreadsheetId: '1iAF3p81G8DdByShDyfz4ShoweV80QWuoQ7wWSzZUORQ',
  sheetName: 'Sheet1', // Or your sheet tab name
  
  // Scopes required
  scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  
  // Discovery docs
  discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4']
};

/**
 * Load Google API client library
 */
function loadGoogleAPI() {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.gapi) {
      resolve(window.gapi);
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      window.gapi.load('client:auth2', () => {
        initializeGoogleAPI()
          .then(() => resolve(window.gapi))
          .catch(reject);
      });
    };
    script.onerror = () => reject(new Error('Failed to load Google API'));
    document.head.appendChild(script);
  });
}

/**
 * Initialize Google API client
 */
async function initializeGoogleAPI() {
  return window.gapi.client.init({
    apiKey: GOOGLE_API_CONFIG.apiKey,
    clientId: GOOGLE_API_CONFIG.clientId,
    discoveryDocs: GOOGLE_API_CONFIG.discoveryDocs,
    scope: GOOGLE_API_CONFIG.scopes
  });
}

/**
 * Check if user is signed in
 */
function isSignedIn() {
  return window.gapi?.auth2?.getAuthInstance()?.isSignedIn?.get() || false;
}

/**
 * Sign in user with Google OAuth popup
 */
async function signInToGoogle() {
  try {
    const authInstance = window.gapi.auth2.getAuthInstance();
    await authInstance.signIn({
      prompt: 'select_account' // Force account selection
    });
    
    const user = authInstance.currentUser.get();
    const profile = user.getBasicProfile();
    
    logSecurity('info', 'User authenticated', {
      email: profile.getEmail(),
      name: profile.getName()
    });
    
    return true;
  } catch (error) {
    console.error('Sign-in error:', error);
    throw new Error('Authentication failed: ' + error.error);
  }
}

/**
 * Fetch data from Google Sheets using API
 */
async function fetchFromGoogleSheetsAPI() {
  try {
    // Load Google API if not already loaded
    await loadGoogleAPI();
    
    // Check if signed in, if not, prompt sign-in
    if (!isSignedIn()) {
      const continueWithoutAuth = confirm(
        '🔐 Aquest bookmarklet requereix autenticació amb Google.\n\n' +
        'Això garanteix que només usuaris autoritzats poden accedir als documents.\n\n' +
        'Vols continuar i iniciar sessió amb Google?'
      );
      
      if (!continueWithoutAuth) {
        throw new Error('User cancelled authentication');
      }
      
      await signInToGoogle();
    }
    
    // Fetch sheet data
    const response = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_API_CONFIG.spreadsheetId,
      range: `${GOOGLE_API_CONFIG.sheetName}!A:C`, // Columns A, B, C
    });
    
    const rows = response.result.values;
    
    if (!rows || rows.length === 0) {
      throw new Error('No data found in sheet');
    }
    
    // Convert to our expected format
    const groups = {};
    
    // Skip header row
    for (let i = 1; i < rows.length; i++) {
      const [group, label, url] = rows[i];
      
      if (!group || !label || !url) continue;
      
      if (!groups[group]) {
        groups[group] = [];
      }
      
      groups[group].push({
        label: sanitizeCSVValue(label),
        url: sanitizeCSVValue(url)
      });
    }
    
    logSecurity('info', `Loaded ${Object.keys(groups).length} groups from Google Sheets API`);
    
    return groups;
    
  } catch (error) {
    console.error('Google Sheets API error:', error);
    throw error;
  }
}

/**
 * Sign out from Google
 */
async function signOutFromGoogle() {
  const authInstance = window.gapi.auth2.getAuthInstance();
  await authInstance.signOut();
  logSecurity('info', 'User signed out');
}

// ============================================================================
// REPLACE THE loadDocs FUNCTION WITH THIS VERSION
// ============================================================================

async function loadDocs(overlay, loadingMsg) {
  try {
    logSecurity('info', 'Fetching documents from Google Sheets API (authenticated)...');
    
    // Show authentication prompt
    loadingMsg.textContent = "🔐 Autenticant amb Google...";
    
    // Fetch using authenticated API
    const docs = await fetchFromGoogleSheetsAPI();
    
    // Update loading message
    loadingMsg.textContent = "🔒 Validant documents...";
    
    // Validate and filter
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
    
    // Add sign-out button
    addSignOutButton(overlay);
    
    buildUI(validatedDocs.valid, overlay);
    
    logSecurity('info', `Loaded ${countDocs(validatedDocs.valid)} valid documents`);
    
  } catch (error) {
    loadingMsg.remove();
    
    // Handle specific error cases
    let errorMessage = error.message;
    let errorDetails = '';
    
    if (error.message.includes('Authentication failed')) {
      errorMessage = 'No s\'ha pogut autenticar amb Google';
      errorDetails = 'Assegura\'t que tens permisos per accedir al Google Sheet.';
    } else if (error.message.includes('User cancelled')) {
      errorMessage = 'Autenticació cancel·lada';
      errorDetails = 'Has de permetre l\'accés amb Google per utilitzar aquesta funcionalitat.';
    } else if (error.message.includes('No data found')) {
      errorMessage = 'El Google Sheet està buit';
      errorDetails = 'Contacta amb l\'administrador.';
    }
    
    const errorBox = document.createElement("div");
    Object.assign(errorBox.style, {
      background: "rgba(255,107,107,0.2)",
      border: "2px solid #ff6b6b",
      borderRadius: "12px",
      padding: "20px",
      maxWidth: "600px",
      color: "#fff"
    });
    
    errorBox.innerHTML = `
      <div style="font-size: 20px; font-weight: bold; margin-bottom: 15px;">
        ❌ ${errorMessage}
      </div>
      <div style="margin-bottom: 15px;">
        ${errorDetails}
      </div>
      <div style="font-size: 14px; line-height: 1.6;">
        <strong>Detall tècnic:</strong><br>
        ${error.message}
      </div>
      <button onclick="location.reload()" style="
        margin-top: 15px;
        padding: 10px 20px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      ">
        🔄 Tornar a intentar
      </button>
    `;
    
    overlay.appendChild(errorBox);
    console.error("Full error details:", error);
    logSecurity('error', `Failed to load documents: ${error.message}`);
  }
}

/**
 * Add sign-out button to overlay
 */
function addSignOutButton(overlay) {
  const signOutBtn = document.createElement("button");
  signOutBtn.innerHTML = "🚪 Tancar sessió de Google";
  Object.assign(signOutBtn.style, {
    position: "fixed",
    top: "10px",
    left: "10px",
    padding: "8px 15px",
    fontSize: "13px",
    cursor: "pointer",
    borderRadius: "6px",
    border: "none",
    background: "rgba(255,255,255,0.2)",
    color: "#fff",
    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
    transition: "background 0.2s",
    zIndex: 10000
  });
  
  signOutBtn.onmouseover = () => signOutBtn.style.background = "rgba(255,255,255,0.3)";
  signOutBtn.onmouseout = () => signOutBtn.style.background = "rgba(255,255,255,0.2)";
  
  signOutBtn.onclick = async () => {
    if (confirm('Vols tancar la sessió de Google?')) {
      await signOutFromGoogle();
      closeOverlay();
      alert('Sessió tancada correctament.');
    }
  };
  
  overlay.appendChild(signOutBtn);
}

// ============================================================================
// FALLBACK: Use public CSV if API fails
// ============================================================================

async function loadDocsWithFallback(overlay, loadingMsg) {
  try {
    // Try Google API first
    await loadDocs(overlay, loadingMsg);
  } catch (error) {
    console.warn('Google API failed, falling back to public CSV:', error);
    
    // Fall back to original CSV method
    loadingMsg.textContent = "⚠️ Usant mètode alternatiu...";
    
    const SHEET_URL = "https://docs.google.com/spreadsheets/d/1iAF3p81G8DdByShDyfz4ShoweV80QWuoQ7wWSzZUORQ/export?format=csv&gid=0";
    const csv = await loadCSVviaXHR(SHEET_URL);
    const docs = parseCSV(csv);
    const validatedDocs = validateAndFilterDocs(docs);
    
    loadingMsg.remove();
    
    if (!Object.keys(validatedDocs.valid).length) { 
      showError("⚠️ No s'han trobat documents vàlids", overlay); 
      return; 
    }
    
    if (validatedDocs.blocked.length > 0) {
      showSecurityWarning(overlay, validatedDocs.blocked);
    }
    
    buildUI(validatedDocs.valid, overlay);
    
    // Show warning that public method is less secure
    showWarning(overlay, 
      '⚠️ AVÍS: Utilitzant mètode públic menys segur. ' +
      'Contacta amb l\'administrador per configurar l\'autenticació.'
    );
  }
}

function showWarning(overlay, message) {
  const warning = document.createElement("div");
  Object.assign(warning.style, {
    background: "rgba(255, 193, 7, 0.2)",
    border: "2px solid #ffc107",
    borderRadius: "8px",
    padding: "15px",
    margin: "20px 0",
    maxWidth: "1200px",
    width: "100%",
    color: "#fff"
  });
  warning.textContent = message;
  overlay.appendChild(warning);
}

// ============================================================================
// SETUP INSTRUCTIONS FOR GOOGLE CLOUD CONSOLE
// ============================================================================

/*
SETUP INSTRUCTIONS:

1. Go to https://console.cloud.google.com/

2. Create a new project (or select existing)

3. Enable Google Sheets API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: "Web application"
   - Name: "ClickEdu Docs Overlay"
   - Authorized JavaScript origins:
     - https://joanfelipgithub.github.io
     - https://insscf.clickedu.eu
   - Authorized redirect URIs:
     - https://joanfelipgithub.github.io/clickedu_docs_overlay/
   - Click "Create"
   - Copy the "Client ID"

5. Create API Key:
   - Click "Create Credentials" > "API key"
   - Click "Restrict Key"
   - API restrictions: "Restrict key" > Select "Google Sheets API"
   - Website restrictions: Add your domains
   - Copy the API key

6. Update GOOGLE_API_CONFIG in this file:
   - clientId: Paste your Client ID
   - apiKey: Paste your API key

7. Change Google Sheet sharing:
   - Keep it "Restricted" (not public)
   - Share with specific Google accounts that should have access
   - Or use domain-wide sharing (e.g., all @yourdomain.com)

8. Test:
   - User must sign in with Google account
   - Only users with access to Sheet can see data
   - Full audit trail in Google Workspace Admin

BENEFITS:
- ✅ Only authenticated users can access
- ✅ Full audit trail (who accessed when)
- ✅ Granular permissions (can restrict by email/domain)
- ✅ Can revoke access anytime
- ✅ No public URL exposure
*/

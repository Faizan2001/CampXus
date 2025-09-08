// Privacy and GDPR compliance manager
export class PrivacyManager {
  constructor() {
    this.consentKey = "meetchuthere_privacy_consent";
    this.consentVersion = "1.0";
    this.init();
  }

  init() {
    this.checkConsentStatus();
    this.setupConsentBanner();
  }

  checkConsentStatus() {
    const consent = localStorage.getItem(this.consentKey);
    if (!consent) {
      this.showConsentBanner();
    } else {
      const consentData = JSON.parse(consent);
      if (consentData.version !== this.consentVersion) {
        this.showConsentBanner();
      }
    }
  }

  showConsentBanner() {
    const banner = document.createElement("div");
    banner.className = "privacy-consent-banner";
    banner.innerHTML = `
      <div class="privacy-consent-content">
        <p>We use cookies and collect data to provide you with the best experience. 
           By using MeetchuThere, you agree to our 
           <a href="/pages/privacy.html" target="_blank">Privacy Policy</a>.</p>
        <div class="privacy-consent-actions">
          <button class="btn btn-secondary" onclick="privacyManager.acceptEssential()">
            Essential Only
          </button>
          <button class="btn btn-primary" onclick="privacyManager.acceptAll()">
            Accept All
          </button>
        </div>
      </div>
    `;

    // Add banner styles
    banner.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #1a365d;
      color: white;
      padding: 1rem;
      z-index: 10000;
      box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
    `;

    document.body.appendChild(banner);
  }

  acceptEssential() {
    this.saveConsent({
      essential: true,
      analytics: false,
      marketing: false,
    });
    this.hideConsentBanner();
  }

  acceptAll() {
    this.saveConsent({
      essential: true,
      analytics: true,
      marketing: true,
    });
    this.hideConsentBanner();
  }

  saveConsent(preferences) {
    const consentData = {
      version: this.consentVersion,
      timestamp: new Date().toISOString(),
      preferences: preferences,
    };
    localStorage.setItem(this.consentKey, JSON.stringify(consentData));

    // Log consent for audit trail
    console.log("Privacy: Consent updated", consentData);
  }

  hideConsentBanner() {
    const banner = document.querySelector(".privacy-consent-banner");
    if (banner) {
      banner.remove();
    }
  }

  hasConsent(type) {
    const consent = localStorage.getItem(this.consentKey);
    if (!consent) return false;

    const consentData = JSON.parse(consent);
    return consentData.preferences[type] || false;
  }

  // GDPR right to be forgotten
  deleteAllUserData() {
    return new Promise((resolve, reject) => {
      try {
        // Clear local storage
        localStorage.clear();
        sessionStorage.clear();

        // Clear Firebase auth (user must delete account through Firebase)
        // Database deletion handled by Cloud Functions

        console.log("Privacy: Local user data deleted");
        resolve();
      } catch (error) {
        console.error("Privacy: Error deleting user data", error);
        reject(error);
      }
    });
  }
}

// Initialize privacy manager
export const privacyManager = new PrivacyManager();
// Removed global window.privacyManager exposure (import where required)

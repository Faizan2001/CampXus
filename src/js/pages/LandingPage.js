/**
 * Landing Page Controller
 * 
 * Handles the landing page functionality for MeetchuThere - the welcome page 
 * that users see when they're not logged in. Features animated text and 
 * call-to-action interactions.
 * 
 * @fileoverview Landing page with animated tagline and authentication integration
 */

// Import necessary services and utilities
import { authManager } from "../services/auth/AuthService.js";
import { logManager } from "../utils/debug/LogManager.js";

/**
 * Landing Page Class
 * Manages landing page interactions and animations
 */
class LandingPage {
  constructor() {
    this.joinButton = null;
    this.animationInterval = null;
    
    logManager.ui.init("LandingPage: Initializing landing page controller");
    
    // Initialize the landing page when DOM is ready
    this.init();
  }

  /**
   * Initialize landing page functionality
   */
  init() {
    // Set up join button click handler
    this.setupJoinButton();
    
    // Start text animation
    this.startTextAnimation();
    
    // Add any additional landing page interactions
    this.setupInteractions();
    
    logManager.ui.init("LandingPage: Initialization complete");
  }

  /**
   * Set up the join button functionality
   */
  setupJoinButton() {
    this.joinButton = document.getElementById("joinButton");
    
    if (this.joinButton) {
      this.joinButton.addEventListener("click", this.handleJoinClick.bind(this));
      logManager.ui.init("LandingPage: Join button event listener attached");
    } else {
      logManager.ui.error("LandingPage: Join button not found in DOM");
    }
  }

  /**
   * Handle join button click - trigger authentication
   */
  async handleJoinClick(event) {
    event.preventDefault();
    
    try {
      // Add loading state to button
      const originalText = this.joinButton.innerHTML;
      this.joinButton.innerHTML = `
        <span class="cta-text">Opening...</span>
        <span class="cta-icon">
          <svg class="animate-spin" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </span>
      `;
      this.joinButton.disabled = true;

      logManager.ui.click("LandingPage: Join button clicked - opening authentication");
      
      // Trigger authentication modal
      if (authManager && authManager.showAuthModal) {
        authManager.showAuthModal();
        logManager.auth.login("LandingPage: Authentication modal opened successfully");
      } else {
        logManager.auth.error("LandingPage: authManager or showAuthModal method not available");
        logManager.auth.error("LandingPage: No authentication method available");
        alert("Authentication system temporarily unavailable. Please refresh and try again.");
      }
    } catch (error) {
      logManager.ui.error("❌ LandingPage: Error handling join button click:", error);

      // Show user-friendly error
      if (window.dataManager && window.dataManager.showNotification) {
        window.dataManager.showNotification(
          "Unable to open sign-in. Please refresh the page and try again.",
          "error"
        );
      }
    } finally {
      // Restore button state after a short delay
      setTimeout(() => {
        if (this.joinButton) {
          this.joinButton.innerHTML = `
            <span class="cta-text">Join MeetchuThere</span>
            <span class="cta-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </span>
          `;
          this.joinButton.disabled = false;
        }
      }, 1000);
    }
  }

  /**
   * Start the animated text rotation
   */
  startTextAnimation() {
    const animatedText1 = document.getElementById("animatedText1");
    const animatedText2 = document.getElementById("animatedText2");
    
    if (!animatedText1 || !animatedText2) {
      logManager.ui.warn("⚠️ LandingPage: Animated text elements not found");
      return;
    }

    // Set initial states
    animatedText1.style.opacity = "1";
    animatedText1.style.transform = "translateY(0)";

    logManager.ui.init("🎬 LandingPage: Text animation started");
  }

  /**
   * Set up additional page interactions
   */
  setupInteractions() {
    // Add smooth scrolling to features section if needed
    this.setupSmoothScrolling();
    
    // Add parallax or other visual enhancements
    this.setupVisualEnhancements();
  }

  /**
   * Set up smooth scrolling for internal links
   */
  setupSmoothScrolling() {
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        
        const targetId = link.getAttribute("href").substring(1);
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }
      });
    });
  }

  /**
   * Set up visual enhancements like parallax effects
   */
  setupVisualEnhancements() {
    // Add scroll-based animations if needed
    if (window.IntersectionObserver) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add("animate-in");
            }
          });
        },
        { 
          threshold: 0.1,
          rootMargin: "0px 0px -50px 0px"
        }
      );

      // Observe feature cards for animation
      const featureCards = document.querySelectorAll(".feature-card");
      featureCards.forEach(card => {
        observer.observe(card);
      });
    }
  }

  /**
   * Clean up landing page when navigating away
   */
  cleanup() {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
    
    // Remove event listeners
    if (this.joinButton) {
      this.joinButton.removeEventListener("click", this.handleJoinClick);
    }

    logManager.ui.init("🧹 LandingPage: Cleanup completed");
  }
}

// Initialize landing page when the module loads
let landingPageInstance = null;

// Listen for the spa:page:load event to initialize
document.addEventListener("spa:page:load", (event) => {
  if (event.detail.route === "landing") {
    logManager.ui.init("📍 LandingPage: SPA page load event received for landing page");

    // Clean up previous instance if it exists
    if (landingPageInstance) {
      landingPageInstance.cleanup();
    }
    
    // Create new instance
    landingPageInstance = new LandingPage();
  }
});

// Listen for page unload to cleanup
document.addEventListener("spa:page:unload", (event) => {
  if (event.detail.route === "landing" && landingPageInstance) {
    logManager.ui.init("🧹 LandingPage: SPA page unload event received, cleaning up");
    landingPageInstance.cleanup();
    landingPageInstance = null;
  }
});

// Export for potential external usage
export default LandingPage;
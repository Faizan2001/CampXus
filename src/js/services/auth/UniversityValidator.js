// Simple university email validation for MeetchuThere
const SUPPORTED_UNIVERSITIES = {
  iub: {
    name: "Independent University, Bangladesh",
    domains: ["iub.edu.bd"],
    displayName: "IUB",
  },
  // Easy to add more universities later!
  // nsu: {
  //   name: "North South University",
  //   domains: ["northsouth.edu"],
  //   displayName: "NSU"
  // }
};

/**
 * Check if an email belongs to a supported university
 * @param {string} email - The email to validate
 * @returns {object|null} University info if valid, null if not
 */
function validateUniversityEmail(email) {
  // Basic email format check
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return null;
  }

  // Extract domain from email (everything after @)
  const domain = email.toLowerCase().split("@")[1];
  if (!domain) {
    return null;
  }

  // Check if this domain belongs to any of our supported universities
  for (const [universityId, university] of Object.entries(
    SUPPORTED_UNIVERSITIES
  )) {
    if (university.domains.includes(domain)) {
      return {
        universityId,
        name: university.name,
        displayName: university.displayName,
        domain,
        isValid: true,
      };
    }
  }

  // Not a supported university domain
  return null;
}

/**
 * Get a friendly error message for invalid emails
 * @param {string} email - The email that failed validation
 * @returns {string} A helpful error message
 */
function getFriendlyEmailError(email) {
  if (!email) {
    return "Please enter your university email address 📧";
  }

  if (!email.includes("@")) {
    return "That doesn't look like an email address. Did you forget the @ symbol? 🤔";
  }

  const domain = email.split("@")[1];
  if (!domain) {
    return "Your email looks incomplete. Please finish typing it! ✍️";
  }

  // Check for common typos
  if (domain.includes("iub.edu") && !domain.includes("iub.edu.bd")) {
    return "Almost there! Did you mean @iub.edu.bd? 🎯";
  }

  return `We don't support ${domain} yet. Currently supporting IUB students! 🏫`;
}

/**
 * Get list of all supported universities
 * @returns {array} List of supported universities
 */
function getSupportedUniversities() {
  return Object.entries(SUPPORTED_UNIVERSITIES).map(([id, uni]) => ({
    id,
    name: uni.name,
    displayName: uni.displayName,
    domains: uni.domains,
  }));
}

// Export functions for use in other files
export {
  validateUniversityEmail,
  getFriendlyEmailError,
  getSupportedUniversities,
};

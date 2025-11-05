/**
 * =============================================================================
 *                           SOCIAL LINKS SERVICE
 *                    Profile Social Links Management
 * =============================================================================
 *
 * Manages social media links for user profiles following the PRD specifications:
 * - Supported types: Instagram, Facebook, LinkedIn, GitHub, X (Twitter), Custom
 * - URL validation per platform
 * - Optional field (only saved when provided)
 * - Up to 6 links total
 *
 * =============================================================================
 */

// Maximum number of social links a user can add
export const MAX_SOCIAL_LINKS = 6;

// Supported social link types with icons and validation patterns
export const SOCIAL_LINK_TYPES = [
  {
    type: 'instagram',
    label: 'Instagram',
    icon: 'fab fa-instagram',
    placeholder: 'instagram.com/username or @username',
    pattern: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)\/?$|^@?([a-zA-Z0-9._]+)$/,
    normalize: (input) => {
      // Handle @username, username, or full URL
      const match = input.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)\/?$|^@?([a-zA-Z0-9._]+)$/);
      if (!match) return null;
      const username = match[1] || match[2];
      return `https://instagram.com/${username}`;
    }
  },
  {
    type: 'facebook',
    label: 'Facebook',
    icon: 'fab fa-facebook',
    placeholder: 'facebook.com/username',
    pattern: /^(?:https?:\/\/)?(?:www\.)?facebook\.com\/([a-zA-Z0-9.]+)\/?$/,
    normalize: (input) => {
      const match = input.match(/^(?:https?:\/\/)?(?:www\.)?facebook\.com\/([a-zA-Z0-9.]+)\/?$/);
      if (!match) return null;
      return `https://facebook.com/${match[1]}`;
    }
  },
  {
    type: 'linkedin',
    label: 'LinkedIn',
    icon: 'fab fa-linkedin',
    placeholder: 'linkedin.com/in/username',
    pattern: /^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9-]+)\/?$/,
    normalize: (input) => {
      const match = input.match(/^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9-]+)\/?$/);
      if (!match) return null;
      return `https://linkedin.com/in/${match[1]}`;
    }
  },
  {
    type: 'github',
    label: 'GitHub',
    icon: 'fab fa-github',
    placeholder: 'github.com/username',
    pattern: /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9-]+)\/?$/,
    normalize: (input) => {
      const match = input.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9-]+)\/?$/);
      if (!match) return null;
      return `https://github.com/${match[1]}`;
    }
  },
  {
    type: 'x',
    label: 'X (Twitter)',
    icon: 'fab fa-x-twitter',
    placeholder: 'x.com/username or @username',
    pattern: /^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)\/?$|^@?([a-zA-Z0-9_]+)$/,
    normalize: (input) => {
      const match = input.match(/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)\/?$|^@?([a-zA-Z0-9_]+)$/);
      if (!match) return null;
      const username = match[1] || match[2];
      return `https://x.com/${username}`;
    }
  },
  {
    type: 'custom',
    label: 'Custom Link',
    icon: 'fas fa-link',
    placeholder: 'https://example.com',
    pattern: /^https?:\/\/.+\..+$/,
    normalize: (input) => {
      // Ensure URL has protocol
      if (!/^https?:\/\//i.test(input)) {
        input = 'https://' + input;
      }
      try {
        const url = new URL(input);
        return url.href;
      } catch {
        return null;
      }
    }
  }
];

/**
 * Get social link type configuration by type string
 * @param {string} type - Type identifier (e.g., 'instagram', 'github')
 * @returns {Object|null} Type configuration or null if not found
 */
export function getSocialLinkType(type) {
  return SOCIAL_LINK_TYPES.find(t => t.type === type) || null;
}

/**
 * Validate and normalize a social link URL
 * @param {string} type - Link type (instagram, facebook, etc.)
 * @param {string} input - User input (URL or username)
 * @returns {Object} {valid: boolean, url: string|null, reason: string}
 */
export function validateSocialLink(type, input) {
  if (!input || typeof input !== 'string') {
    return { valid: false, url: null, reason: 'Input required' };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, url: null, reason: 'Input required' };
  }

  const typeConfig = getSocialLinkType(type);
  if (!typeConfig) {
    return { valid: false, url: null, reason: 'Invalid link type' };
  }

  // Test against pattern
  if (!typeConfig.pattern.test(trimmed)) {
    return { valid: false, url: null, reason: `Invalid ${typeConfig.label} format` };
  }

  // Normalize URL
  const normalizedUrl = typeConfig.normalize(trimmed);
  if (!normalizedUrl) {
    return { valid: false, url: null, reason: 'Could not normalize URL' };
  }

  return { valid: true, url: normalizedUrl, reason: '' };
}

/**
 * Check if a link already exists in the links array
 * @param {Array} links - Existing links array
 * @param {string} url - URL to check
 * @returns {boolean} True if link already exists
 */
export function isDuplicateLink(links, url) {
  if (!Array.isArray(links)) return false;
  return links.some(link => link.url === url);
}

/**
 * Prepare social links array for Firestore save
 * Filters out empty entries and validates format
 * @param {Array} links - Array of link objects {type, url}
 * @returns {Array} Clean array ready for Firestore
 */
export function prepareSocialLinksForSave(links) {
  if (!Array.isArray(links) || links.length === 0) {
    return [];
  }

  return links
    .filter(link => {
      // Must have both type and url
      if (!link || !link.type || !link.url) return false;
      
      // Validate type exists
      if (!getSocialLinkType(link.type)) return false;
      
      // URL must be non-empty string
      if (typeof link.url !== 'string' || !link.url.trim()) return false;
      
      return true;
    })
    .slice(0, MAX_SOCIAL_LINKS); // Enforce max limit
}

/**
 * Get display name for a social link (extracts username when possible)
 * @param {Object} link - Link object {type, url}
 * @returns {string} Display name or shortened URL
 */
export function getSocialLinkDisplayName(link) {
  if (!link || !link.url) return '';
  
  try {
    const url = new URL(link.url);
    const pathname = url.pathname;
    
    // Extract username from common patterns
    const parts = pathname.split('/').filter(p => p);
    if (parts.length > 0) {
      // For most social media: /{username}
      return '@' + parts[0];
    }
    
    // Fallback: show domain
    return url.hostname.replace('www.', '');
  } catch {
    // If URL parsing fails, return as-is
    return link.url;
  }
}

/**
 * Get Font Awesome icon class for a social link type
 * @param {string} type - Link type
 * @returns {string} Font Awesome icon class
 */
export function getSocialLinkIcon(type) {
  const typeConfig = getSocialLinkType(type);
  return typeConfig ? typeConfig.icon : 'fas fa-link';
}

/**
 * Get color class for a social link type (for styling)
 * @param {string} type - Link type
 * @returns {string} Color class name
 */
export function getSocialLinkColor(type) {
  const colors = {
    instagram: 'social-instagram',
    facebook: 'social-facebook',
    linkedin: 'social-linkedin',
    github: 'social-github',
    x: 'social-x',
    custom: 'social-custom'
  };
  return colors[type] || 'social-custom';
}

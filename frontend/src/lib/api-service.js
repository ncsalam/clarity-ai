import { doesSessionExist } from "./supertokens-config.js";
import { API_ENDPOINTS } from "./constants.js";

/**
 * Enhanced API service with automatic SuperTokens authentication
 * Handles session validation, token injection, and authentication errors
 */
class ApiService {
  constructor() {
    this.baseUrls = {
      core: API_ENDPOINTS.CORE_API,
      ai: import.meta.env.VITE_AI_API_URL || "http://localhost:5001",
    };
    // Request deduplication cache
    this.pendingRequests = new Map();
  }

  /**
   * Validates session before making API requests
   * @returns {Promise<boolean>} Session validity status
   */
  async validateSession() {
    try {
      return await doesSessionExist();
    } catch (error) {
      console.error("Session validation error:", error);
      return false;
    }
  }

  /**
   * Gets authentication headers with SuperTokens session token
   * @returns {Promise<Object>} Headers object with authentication
   */
  async getAuthHeaders() {
    try {
      const sessionExists = await this.validateSession();
      if (!sessionExists) {
        throw new Error("No valid session found");
      }

      // SuperTokens automatically handles session tokens in headers via its fetch wrapper
      // We only need to include Content-Type
      return {
        "Content-Type": "application/json",
      };
    } catch (error) {
      console.error("Error getting auth headers:", error);
      throw new Error("Authentication failed");
    }
  }

  /**
   * Makes authenticated API request with automatic session handling
   * @param {string} service - Service name ('core' or 'ai')
   * @param {string} endpoint - API endpoint path
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} API response data
   */
  async makeAuthenticatedRequest(service, endpoint, options = {}) {
    // Create a unique key for request deduplication (only for GET requests)
    const method = options.method || "GET";
    const requestKey = `${service}:${endpoint}:${method}`;

    // For GET requests, check if there's already a pending request
    if (method === "GET" && this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey);
    }

    // Create the request promise
    const requestPromise = (async () => {
      try {
        // Validate session before making request
        const sessionValid = await this.validateSession();
        if (!sessionValid) {
          // Redirect to login if session is invalid
          window.location.href = "/login";
          throw new Error("Session expired. Please log in again.");
        }

        // Get authentication headers
        const authHeaders = await this.getAuthHeaders();

        // Prepare request URL and options
        const baseUrl = this.baseUrls[service];
        if (!baseUrl) {
          throw new Error(`Unknown service: ${service}`);
        }

        const url = `${baseUrl}${endpoint}`;

        // Handle FormData - don't set Content-Type header for FormData
        const isFormData = options.body instanceof FormData;
        const headers = isFormData
          ? { ...options.headers }
          : { ...authHeaders, ...options.headers };

        const requestOptions = {
          ...options,
          headers,
          credentials: "include", // Include cookies for cross-origin requests
        };

        // Make the request - SuperTokens session cookies will be automatically included
        const response = await fetch(url, requestOptions);

        // Handle authentication errors
        if (response.status === 401) {
          console.warn("Authentication failed, redirecting to login");
          window.location.href = "/login";
          throw new Error("Authentication failed. Please log in again.");
        }

        // Handle other HTTP errors
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message ||
              `HTTP ${response.status}: ${response.statusText}`
          );
        }

        // Return response data
        return await response.json();
      } catch (error) {
        console.error(`API request error (${service}${endpoint}):`, error);

        // Re-throw authentication errors to trigger redirects
        if (
          error.message.includes("Authentication failed") ||
          error.message.includes("Session expired")
        ) {
          throw error;
        }

        // Handle network and other errors
        throw new Error(error.message || "API request failed");
      } finally {
        // Clean up pending request cache
        if (method === "GET") {
          this.pendingRequests.delete(requestKey);
        }
      }
    })();

    // Store the promise for GET requests to deduplicate
    if (method === "GET") {
      this.pendingRequests.set(requestKey, requestPromise);
    }

    return requestPromise;
  }

  /**
   * Makes authenticated request to Core API
   * @param {string} endpoint - API endpoint path
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} API response data
   */
  async coreApi(endpoint, options = {}) {
    return this.makeAuthenticatedRequest("core", endpoint, options);
  }

  /**
   * Makes authenticated request to AI API
   * @param {string} endpoint - API endpoint path
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} API response data
   */
  async aiApi(endpoint, options = {}) {
    return this.makeAuthenticatedRequest("ai", endpoint, options);
  }

  /**
   * Makes unauthenticated request (for public endpoints)
   * @param {string} service - Service name ('core' or 'ai')
   * @param {string} endpoint - API endpoint path
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} API response data
   */
  async makePublicRequest(service, endpoint, options = {}) {
    try {
      const baseUrl = this.baseUrls[service];
      if (!baseUrl) {
        throw new Error(`Unknown service: ${service}`);
      }

      const url = `${baseUrl}${endpoint}`;
      const requestOptions = {
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        ...options,
      };

      const response = await fetch(url, requestOptions);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error(`Public API request error (${service}${endpoint}):`, error);
      throw new Error(error.message || "API request failed");
    }
  }

  /**
   * Health check for backend services
   * @param {string} service - Service name ('core' or 'ai')
   * @returns {Promise<Object>} Health status
   */
  async healthCheck(service) {
    try {
      const endpoint = "/health";
      const response = await this.makePublicRequest(service, endpoint, {
        method: "GET",
      });

      return {
        service,
        status: "healthy",
        timestamp: new Date().toISOString(),
        ...response,
      };
    } catch (error) {
      console.error(`Health check failed for ${service}:`, error);
      return {
        service,
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  /**
   * Batch health check for all services
   * @returns {Promise<Object>} Health status for all services
   */
  async healthCheckAll() {
    try {
      const services = Object.keys(this.baseUrls);
      const healthChecks = await Promise.allSettled(
        services.map((service) => this.healthCheck(service))
      );

      const results = {};
      healthChecks.forEach((result, index) => {
        const service = services[index];
        if (result.status === "fulfilled") {
          results[service] = result.value;
        } else {
          results[service] = {
            service,
            status: "error",
            timestamp: new Date().toISOString(),
            error: result.reason?.message || "Health check failed",
          };
        }
      });

      return results;
    } catch (error) {
      console.error("Batch health check error:", error);
      throw new Error("Failed to perform health checks");
    }
  }

  /**
   * Retry mechanism for failed requests
   * @param {Function} requestFn - Request function to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} delay - Delay between retries in ms
   * @returns {Promise<Object>} API response data
   */
  async retryRequest(requestFn, maxRetries = 3, delay = 1000) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;

        // Don't retry authentication errors
        if (
          error.message.includes("Authentication failed") ||
          error.message.includes("Session expired")
        ) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }

        console.warn(
          `Request attempt ${attempt} failed, retrying in ${delay}ms:`,
          error.message
        );
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Exponential backoff
        delay *= 2;
      }
    }

    throw lastError;
  }
}

// Create and export singleton instance
const apiService = new ApiService();
export default apiService;

/**
 * Profile Management API Methods
 */

/**
 * Get user profile data
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User profile data
 */
apiService.getProfile = async function (userId) {
  try {
    if (!userId) {
      throw new Error("User ID is required");
    }

    // Use the authenticated profile endpoint for current user
    const response = await this.coreApi("/api/profile", {
      method: "GET",
    });

    // Backend returns profile data directly (not nested under 'profile' key)
    return response;
  } catch (error) {
    console.error("Error fetching user profile:", error);

    // Handle specific error cases
    if (error.message.includes("404")) {
      throw new Error("User profile not found");
    } else if (error.message.includes("Authentication failed")) {
      throw error; // Re-throw auth errors to trigger redirects
    }

    throw new Error("Failed to fetch user profile");
  }
};

/**
 * Update user profile data
 * @param {string} userId - User ID
 * @param {Object} profileData - Profile data to update
 * @returns {Promise<Object>} Updated profile data
 */
apiService.updateProfile = async function (userId, profileData) {
  try {
    if (!profileData) {
      throw new Error("Profile data is required");
    }

    if (!userId) {
      throw new Error("User ID is required");
    }

    // Validate required profile fields
    const requiredFields = ["first_name", "last_name", "company", "job_title"];
    const metadata = profileData.metadata || profileData;

    for (const field of requiredFields) {
      let value;
      if (field === "company" || field === "job_title") {
        value = metadata.user_profile?.[field] || profileData[field];
      } else {
        value = metadata[field] || profileData[field];
      }

      if (!value || value.trim() === "") {
        throw new Error(`${field.replace("_", " ")} is required`);
      }
    }

    // Check if profile exists first
    let profileExists = false;
    try {
      await this.coreApi("/api/profile", { method: "GET" });
      profileExists = true;
    } catch {
      profileExists = false;
    }

    if (profileExists) {
      // Update existing profile
      const updatedProfile = await this.coreApi("/api/profile", {
        method: "PUT",
        body: JSON.stringify(profileData),
      });
      return updatedProfile;
    } else {
      // Create new profile
      const email = profileData.email || metadata.email;
      if (!email) {
        throw new Error("Email is required to create profile");
      }

      const createPayload = {
        user_id: userId,
        email: email,
        first_name: metadata.first_name || profileData.first_name,
        last_name: metadata.last_name || profileData.last_name,
        company: metadata.user_profile?.company || profileData.company,
        job_title: metadata.user_profile?.job_title || profileData.job_title,
      };

      const createResponse = await this.makePublicRequest(
        "core",
        "/api/auth/profile",
        {
          method: "POST",
          body: JSON.stringify(createPayload),
        }
      );

      // Return the created profile in the expected format
      const createdProfile = createResponse.profile;
      return {
        user_id: createdProfile.user_id,
        email: createdProfile.email,
        metadata: {
          first_name: createdProfile.first_name,
          last_name: createdProfile.last_name,
          user_profile: {
            company: createdProfile.company,
            job_title: createdProfile.job_title,
          },
          user_token: {
            remaining_tokens: createdProfile.remaining_tokens || 5,
          },
        },
      };
    }
  } catch (error) {
    console.error("Error updating/creating user profile:", error);

    // Handle specific error cases
    if (error.message.includes("required")) {
      throw error; // Re-throw validation errors
    } else if (error.message.includes("Authentication failed")) {
      throw error; // Re-throw auth errors to trigger redirects
    } else if (error.message.includes("400")) {
      throw new Error("Invalid profile data provided");
    } else if (error.message.includes("409")) {
      throw new Error("Profile already exists");
    }

    throw new Error("Failed to update user profile");
  }
};

/**
 * Get user profile completion status
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Profile completion status
 */
apiService.getProfileCompletionStatus = async function (userId) {
  try {
    if (!userId) {
      throw new Error("User ID is required");
    }

    const profile = await this.getProfile(userId);

    // Check if profile is complete
    const metadata = profile.metadata || {};
    const userProfile = metadata.user_profile || {};

    const isComplete = !!(
      metadata.first_name &&
      metadata.last_name &&
      userProfile.company &&
      userProfile.job_title
    );

    const missingFields = [];
    if (!metadata.first_name) missingFields.push("first_name");
    if (!metadata.last_name) missingFields.push("last_name");
    if (!userProfile.company) missingFields.push("company");
    if (!userProfile.job_title) missingFields.push("job_title");

    return {
      isComplete,
      missingFields,
      profile,
    };
  } catch (error) {
    console.error("Error checking profile completion status:", error);
    throw new Error("Failed to check profile completion status");
  }
};

/**
 * Health check with authentication-specific error handling
 * @param {string} service - Service name ('core' or 'ai')
 * @returns {Promise<Object>} Health status with auth info
 */
apiService.authenticatedHealthCheck = async function (service) {
  try {
    // First check if session is valid
    const sessionValid = await this.validateSession();

    const baseHealthCheck = await this.healthCheck(service);

    return {
      ...baseHealthCheck,
      authentication: {
        sessionValid,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error(`Authenticated health check failed for ${service}:`, error);
    return {
      service,
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error.message,
      authentication: {
        sessionValid: false,
        error: "Authentication check failed",
      },
    };
  }
};

/**
 * Batch authenticated health check for all services
 * @returns {Promise<Object>} Health status for all services with auth info
 */
apiService.authenticatedHealthCheckAll = async function () {
  try {
    const services = Object.keys(this.baseUrls);
    const healthChecks = await Promise.allSettled(
      services.map((service) => this.authenticatedHealthCheck(service))
    );

    const results = {};
    healthChecks.forEach((result, index) => {
      const service = services[index];
      if (result.status === "fulfilled") {
        results[service] = result.value;
      } else {
        results[service] = {
          service,
          status: "error",
          timestamp: new Date().toISOString(),
          error: result.reason?.message || "Health check failed",
          authentication: {
            sessionValid: false,
            error: "Health check failed",
          },
        };
      }
    });

    return results;
  } catch (error) {
    console.error("Batch authenticated health check error:", error);
    throw new Error("Failed to perform authenticated health checks");
  }
};

/**
 * Generic authenticated API call with error handling
 * @param {string} service - Service name ('core' or 'ai')
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Request options
 * @returns {Promise<Object>} API response
 */
apiService.authenticatedCall = async function (
  service,
  endpoint,
  options = {}
) {
  try {
    return await this.makeAuthenticatedRequest(service, endpoint, options);
  } catch (error) {
    // Enhanced error handling for authentication-specific errors
    if (
      error.message.includes("Authentication failed") ||
      error.message.includes("Session expired")
    ) {
      console.error("Authentication error in API call:", error);
      throw error; // Re-throw to trigger redirects
    }

    // Handle other API errors
    console.error(`API call error (${service}${endpoint}):`, error);
    throw new Error(error.message || "API call failed");
  }
};

// ==================================================================
// --- NEW Requirement Management API Methods ---
// ==================================================================

/**
 * Get requirements for a specific document
 * @param {string} documentId - The ID of the document
 * @returns {Promise<Array>} Array of requirement objects
 */
apiService.getDocumentRequirements = async function (documentId) {
  if (!documentId) {
    throw new Error("Document ID is required");
  }
  // Points to the /api/documents/<id>/requirements route
  const response = await this.coreApi(`/api/documents/${documentId}/requirements`);
  // Return the nested array as the component expects, or empty array
  return response.requirements || [];
};

/**
 * Delete a single requirement by its ID
 * @param {number} reqId - The ID of the requirement to delete
 * @returns {Promise<Object>} Confirmation message
 */
apiService.deleteRequirement = async function (reqId) {
  if (!reqId) {
    throw new Error("Requirement ID is required");
  }
  // Points to the /api/requirements/<id> DELETE route
  return await this.coreApi(`/api/requirements/${reqId}`, { 
    method: 'DELETE' 
  });
};

/**
 * Update a single requirement by its ID
 * @param {number} reqId - The ID of the requirement to update
 * @param {Object} data - The data to update (e.g., { title, description })
 * @returns {Promise<Object>} The updated requirement object
 */
apiService.updateRequirement = async function (reqId, data) {
  if (!reqId) {
    throw new Error("Requirement ID is required");
  }
  if (!data) {
    throw new Error("Update data is required");
  }
  // Points to the /api/requirements/<id> PUT route
  return await this.coreApi(`/api/requirements/${reqId}`, { 
    method: 'PUT',
    body: JSON.stringify(data)
  });
};


/**
 * Ambiguity Detection API Methods
 */

/**
 * Analyze text for ambiguous terms
 * @param {string} text - Text to analyze
 * @param {number} requirementId - Optional requirement ID
 * @returns {Promise<Object>} Analysis results
 */
apiService.analyzeText = async function (text, requirementId = null) {
  try {
    if (!text || text.trim() === "") {
      throw new Error("Text is required for analysis");
    }

    const payload = { text };
    if (requirementId) {
      payload.requirement_id = requirementId;
    }

    const response = await this.coreApi("/api/ambiguity/analyze", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return response;
  } catch (error) {
    console.error("Error analyzing text:", error);
    throw new Error(error.message || "Failed to analyze text");
  }
};

/**
 * Analyze a specific requirement for ambiguous terms
 * @param {number} requirementId - Requirement ID
 * @returns {Promise<Object>} Analysis results
 */
apiService.analyzeRequirement = async function (requirementId) {
  try {
    if (!requirementId) {
      throw new Error("Requirement ID is required");
    }

    const response = await this.coreApi(
      `/api/ambiguity/analyze/requirement/${requirementId}`,
      {
        method: "POST",
      }
    );

    return response;
  } catch (error) {
    console.error("Error analyzing requirement:", error);
    throw new Error(error.message || "Failed to analyze requirement");
  }
};

/**
 * Get analysis results by analysis ID
 * @param {number} analysisId - Analysis ID
 * @returns {Promise<Object>} Analysis results
 */
apiService.getAnalysis = async function (analysisId) {
  try {
    if (!analysisId) {
      throw new Error("Analysis ID is required");
    }

    const response = await this.coreApi(
      `/api/ambiguity/analysis/${analysisId}`,
      {
        method: "GET",
      }
    );

    return response;
  } catch (error) {
    console.error("Error fetching analysis:", error);
    throw new Error(error.message || "Failed to fetch analysis");
  }
};

/**
 * Batch analyze multiple requirements
 * @param {Array<number>} requirementIds - Array of requirement IDs
 * @returns {Promise<Array>} Array of analysis results
 */
apiService.batchAnalyzeRequirements = async function (requirementIds) {
  try {
    if (!requirementIds || requirementIds.length === 0) {
      throw new Error("Requirement IDs are required");
    }

    const response = await this.coreApi("/api/ambiguity/analyze/batch", {
      method: "POST",
      body: JSON.stringify({ requirement_ids: requirementIds }),
    });

    return response;
  } catch (error) {
    console.error("Error batch analyzing requirements:", error);
    throw new Error(error.message || "Failed to batch analyze requirements");
  }
};
/**
 * Generate edge cases for a specific requirement
 * @param {number} requirementId - Requirement ID
 * @param {number} maxCases - Optional limit on number of edge cases
 * @returns {Promise<Object>} Edge case results
 */
// NEW EDGE CASE METHOD
apiService.generateEdgeCases = async function (requirementId, maxCases = 10) {
  try {
    if (!requirementId) {
      throw new Error("Requirement ID is required");
    }

    const payload = {
      max_cases: maxCases
    };

    // Uses your new backend route:
    // POST /api/requirements/<id>/edge-cases
    const response = await this.coreApi(
      `/api/requirements/${requirementId}/edge-cases`,
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    );

    // Expected shape:
    // { requirement_id: 123, edge_cases: ["...", "..."] }
    return response;
  } catch (error) {
    console.error("Error generating edge cases:", error);
    throw new Error(error.message || "Failed to generate edge cases");
  }
};


/**
 * Submit clarification for an ambiguous term
 * @param {number} analysisId - Analysis ID
 * @param {number} termId - Term ID
 * @param {string} clarifiedText - Clarified text
 * @param {string} action - Action to take ('replace' or 'append')
 * @returns {Promise<Object>} Updated requirement
 */
apiService.submitClarification = async function (
  analysisId,
  termId,
  clarifiedText,
  action = "replace"
) {
  try {
    if (!analysisId || !termId) {
      throw new Error("Analysis ID and Term ID are required");
    }

    if (!clarifiedText || clarifiedText.trim() === "") {
      throw new Error("Clarified text is required");
    }

    if (!["replace", "append"].includes(action)) {
      throw new Error("Action must be 'replace' or 'append'");
    }

    const response = await this.coreApi("/api/ambiguity/clarify", {
      method: "POST",
      body: JSON.stringify({
        analysis_id: analysisId,
        term_id: termId,
        clarified_text: clarifiedText,
        action: action,
      }),
    });

    return response;
  } catch (error) {
    console.error("Error submitting clarification:", error);
    throw new Error(error.message || "Failed to submit clarification");
  }
};

/**
 * Get AI-generated suggestions for an ambiguous term
 * @param {number} termId - Term ID
 * @returns {Promise<Object>} Suggestions and prompt
 */
apiService.getSuggestions = async function (termId) {
  try {
    if (!termId) {
      throw new Error("Term ID is required");
    }

    const response = await this.coreApi(
      `/api/ambiguity/suggestions/${termId}`,
      {
        method: "GET",
      }
    );

    return response;
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    throw new Error(error.message || "Failed to fetch suggestions");
  }
};

/**
 * Get ambiguity report for a requirement
 * @param {number} requirementId - Requirement ID
 * @returns {Promise<Object>} Report data
 */
apiService.getReport = async function (requirementId) {
  try {
    if (!requirementId) {
      throw new Error("Requirement ID is required");
    }

    const response = await this.coreApi(
      `/api/ambiguity/report/${requirementId}`,
      {
        method: "GET",
      }
    );

    return response;
  } catch (error) {
    console.error("Error fetching report:", error);
    throw new Error(error.message || "Failed to fetch report");
  }
};

/**
 * Get project-wide ambiguity report
 * @returns {Promise<Object>} Project report data
 */
apiService.getProjectReport = async function () {
  try {
    const response = await this.coreApi("/api/ambiguity/report/project", {
      method: "GET",
    });

    return response;
  } catch (error) {
    console.error("Error fetching project report:", error);
    throw new Error(error.message || "Failed to fetch project report");
  }
};

/**
 * Export ambiguity report
 * @param {Array<number>} requirementIds - Array of requirement IDs
 * @param {string} format - Export format ('txt' or 'md')
 * @returns {Promise<Blob>} Report file blob
 */
apiService.exportReport = async function (requirementIds, format = "md") {
  try {
    if (!requirementIds || requirementIds.length === 0) {
      throw new Error("Requirement IDs are required");
    }

    if (!["txt", "md"].includes(format)) {
      throw new Error("Format must be 'txt' or 'md'");
    }

    // Validate session before making request
    const sessionValid = await this.validateSession();
    if (!sessionValid) {
      window.location.href = "/login";
      throw new Error("Session expired. Please log in again.");
    }

    const baseUrl = this.baseUrls.core;
    const url = `${baseUrl}/api/ambiguity/report/export`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        requirement_ids: requirementIds,
        format: format,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Return blob for file download
    return await response.blob();
  } catch (error) {
    console.error("Error exporting report:", error);
    throw new Error(error.message || "Failed to export report");
  }
};

/**
 * Get ambiguity lexicon (global + user-specific)
 * @returns {Promise<Object>} Lexicon data
 */
apiService.getLexicon = async function () {
  try {
    const response = await this.coreApi("/api/ambiguity/lexicon", {
      method: "GET",
    });

    return response;
  } catch (error) {
    console.error("Error fetching lexicon:", error);
    throw new Error(error.message || "Failed to fetch lexicon");
  }
};

/**
 * Add term to user's custom lexicon
 * @param {string} term - Term to add
 * @param {string} type - Type ('include' or 'exclude')
 * @returns {Promise<Object>} Updated lexicon
 */
apiService.addLexiconTerm = async function (term, type = "include") {
  try {
    if (!term || term.trim() === "") {
      throw new Error("Term is required");
    }

    if (!["include", "exclude"].includes(type)) {
      throw new Error("Type must be 'include' or 'exclude'");
    }

    const response = await this.coreApi("/api/ambiguity/lexicon/add", {
      method: "POST",
      body: JSON.stringify({ term: term.trim(), type: type }),
    });

    return response;
  } catch (error) {
    console.error("Error adding lexicon term:", error);
    throw new Error(error.message || "Failed to add lexicon term");
  }
};

/**
 * Remove term from user's custom lexicon
 * @param {string} term - Term to remove
 * @returns {Promise<Object>} Updated lexicon
 */
apiService.removeLexiconTerm = async function (term) {
  try {
    if (!term || term.trim() === "") {
      throw new Error("Term is required");
    }

    const response = await this.coreApi(
      `/api/ambiguity/lexicon/${encodeURIComponent(term)}`,
      {
        method: "DELETE",
      }
    );

    return response;
  } catch (error) {
    console.error("Error removing lexicon term:", error);
    throw new Error(error.message || "Failed to remove lexicon term");
  }
};

// ==================================================================
// --- Contradiction Analysis API Methods (CLEANED UP) ---
// ==================================================================
apiService.runContradictionAnalysis = async function (documentId, contextData = {}) {
    const url = `/api/documents/${documentId}/analyze/contradictions`; 
    
    // The coreApi method already handles try/catch and auth
    return await this.coreApi(url, {
        method:"POST",
        body: JSON.stringify(contextData) // Pass contextData as body
    });
}

/**
 * Executes a GET request to retrieve the latest contradiction analysis report 
 * for a specific document.
 * @param {number} documentId The ID of the document.
 * @returns {Promise<object>} The latest ContradictionAnalysis report, or a message if none found.
 */
apiService.getLatestContradictionReport = async function (documentId) {
    const url = `/api/documents/${documentId}/analyze/contradictions/latest`; 
    
    // The coreApi method already handles try/catch and auth
    return await this.coreApi(url, {method: "GET"});
}


// --- ADD THIS NEW FUNCTION ---

/**
 * Executes a POST request to trigger a project-wide contradiction analysis
 * on ALL documents owned by the user.
 * @returns {Promise<object>} The newly generated aggregated ContradictionAnalysis report.
 */
apiService.runProjectContradictionAnalysis = async function () {
    const url = '/api/project/analyze/contradictions';
    
    return await this.coreApi(url, {
        method: "POST",
        body: JSON.stringify({}) // Send empty body, auth is handled by session
    });
}

// Export individual methods for convenience
export const {
  coreApi,
  aiApi,
  makeAuthenticatedRequest,
  makePublicRequest,
  healthCheck,
  healthCheckAll,
  validateSession,
  retryRequest,
  getProfile,
  updateProfile,
  getProfileCompletionStatus,
  authenticatedHealthCheck,
  authenticatedHealthCheckAll,
  authenticatedCall,

  getDocumentRequirements, 
  deleteRequirement,     
  updateRequirement,     

  analyzeText,
  analyzeRequirement,
  getAnalysis,
  batchAnalyzeRequirements,
  submitClarification,
  getSuggestions,
  getReport,
  getProjectReport,
  exportReport,
  getLexicon,
  addLexiconTerm,
  removeLexiconTerm,

  runContradictionAnalysis,
  getLatestContradictionReport,
  runProjectContradictionAnalysis,
  generateEdgeCases
} = apiService;

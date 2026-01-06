import logger from "../../../utils/logger.js";

export interface RateLimitInfo {
  isRateLimit: boolean;
  retryAfter?: number; // seconds
  errorMessage?: string;
}

/**
 * Parse MCP response to detect rate limit errors
 * MCP responses don't expose HTTP status codes directly,
 * so we need to check response content and error flags
 */
export function detectRateLimitError(
  response: any,
  error?: Error
): RateLimitInfo {
  // Check if the error object itself indicates a rate limit
  if (error) {
    const errorMsg = error.message || "";

    // Check for 429 or rate limit in error message
    if (
      errorMsg.includes("429") ||
      errorMsg.toLowerCase().includes("rate limit") ||
      errorMsg.toLowerCase().includes("too many requests")
    ) {
      logger.debug(
        { errorMessage: errorMsg },
        "Detected rate limit from error message"
      );

      // Try to extract retry-after from error message
      const retryAfter = extractRetryAfter(errorMsg);

      return {
        isRateLimit: true,
        retryAfter,
        errorMessage: errorMsg,
      };
    }
  }

  // Check MCP response format for error indicators
  if (response?.isError === true) {
    const textContent = response?.content?.[0]?.text || "";

    if (
      textContent.includes("429") ||
      textContent.toLowerCase().includes("rate limit") ||
      textContent.toLowerCase().includes("too many requests")
    ) {
      logger.debug(
        { responseText: textContent.substring(0, 200) },
        "Detected rate limit from MCP response content"
      );

      const retryAfter = extractRetryAfter(textContent);

      return {
        isRateLimit: true,
        retryAfter,
        errorMessage: textContent,
      };
    }
  }

  // Check response content even without isError flag
  // Some MCP servers may return errors without setting isError
  if (response?.content && Array.isArray(response.content)) {
    for (const item of response.content) {
      if (item.type === "text" && typeof item.text === "string") {
        const text = item.text;

        if (
          text.includes("429") ||
          text.toLowerCase().includes("rate limit") ||
          text.toLowerCase().includes("too many requests")
        ) {
          logger.debug(
            { responseText: text.substring(0, 200) },
            "Detected rate limit from response text content"
          );

          const retryAfter = extractRetryAfter(text);

          return {
            isRateLimit: true,
            retryAfter,
            errorMessage: text,
          };
        }
      }
    }
  }

  return { isRateLimit: false };
}

/**
 * Extract retry-after value from error message or response text
 * Looks for patterns like:
 * - "retry-after: 60"
 * - "retry after 60 seconds"
 * - "wait 60 seconds"
 * - "Retry-After: 60"
 */
function extractRetryAfter(text: string): number | undefined {
  // Pattern 1: "retry-after: 60" or "Retry-After: 60"
  const pattern1 = /retry.?after[:\s]+(\d+)/i;
  const match1 = text.match(pattern1);
  if (match1) {
    return parseInt(match1[1], 10);
  }

  // Pattern 2: "wait 60 seconds" or "wait for 60 seconds"
  const pattern2 = /wait\s+(?:for\s+)?(\d+)\s+seconds?/i;
  const match2 = text.match(pattern2);
  if (match2) {
    return parseInt(match2[1], 10);
  }

  // Pattern 3: "in 60 seconds"
  const pattern3 = /in\s+(\d+)\s+seconds?/i;
  const match3 = text.match(pattern3);
  if (match3) {
    return parseInt(match3[1], 10);
  }

  // Pattern 4: "after 60 seconds"
  const pattern4 = /after\s+(\d+)\s+seconds?/i;
  const match4 = text.match(pattern4);
  if (match4) {
    return parseInt(match4[1], 10);
  }

  return undefined;
}

/**
 * Check if MCP response indicates an error (not necessarily rate limit)
 */
export function isMCPError(response: any): boolean {
  if (response?.isError === true) {
    return true;
  }

  // Check for error-like content
  if (response?.content && Array.isArray(response.content)) {
    for (const item of response.content) {
      if (item.type === "text" && typeof item.text === "string") {
        const text = item.text.toLowerCase();
        if (
          text.startsWith("error") ||
          text.startsWith("failed") ||
          text.includes("mcp error")
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

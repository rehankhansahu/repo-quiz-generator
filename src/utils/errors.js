// Typed application errors with user-friendly bilingual messages (English & Hinglish).

export const ERROR_CODES = {
  INVALID_URL: 'INVALID_URL',
  REPO_NOT_FOUND: 'REPO_NOT_FOUND',
  PRIVATE_OR_UNAUTHORIZED: 'PRIVATE_OR_UNAUTHORIZED',
  GITHUB_RATE_LIMIT: 'GITHUB_RATE_LIMIT',
  EMPTY_REPO: 'EMPTY_REPO',
  INVALID_GEMINI_KEY: 'INVALID_GEMINI_KEY',
  GEMINI_RATE_LIMIT: 'GEMINI_RATE_LIMIT',
  GEMINI_MODEL_ERROR: 'GEMINI_MODEL_ERROR',
  MALFORMED_OUTPUT: 'MALFORMED_OUTPUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  ABORTED: 'ABORTED',
  UNKNOWN: 'UNKNOWN',
};

export class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code || ERROR_CODES.UNKNOWN;
    this.details = details;
  }
}

export function getFriendlyErrorMessage(error, lang = 'en') {
  const isHinglish = lang === 'hinglish';
  if (!error) {
    return isHinglish
      ? 'Kuch unexpected error aa gaya. Dobara try karein.'
      : 'An unexpected error occurred. Please try again.';
  }

  if (error.name === 'AbortError' || error.code === ERROR_CODES.ABORTED) {
    return isHinglish
      ? 'Operation cancel kar di gayi.'
      : 'Operation was cancelled.';
  }

  const code = error.code || ERROR_CODES.UNKNOWN;
  const details = error.details || {};

  switch (code) {
    case ERROR_CODES.INVALID_URL:
      return isHinglish
        ? 'Valid GitHub repository URL enter karein (jaise https://github.com/owner/repo).'
        : 'Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo).';

    case ERROR_CODES.REPO_NOT_FOUND:
      return isHinglish
        ? `Repository ya branch nahi mili (${details.target || 'check URL'}). Agar ye private repo hai to Settings me GitHub token add karein.`
        : `Repository or branch not found (${details.target || 'check URL'}). If this is a private repository, add a GitHub token in Settings.`;

    case ERROR_CODES.PRIVATE_OR_UNAUTHORIZED:
      return isHinglish
        ? 'Access denied: Ye repository private ho sakti hai ya aapka GitHub token invalid/expired hai. Settings me valid token dalein.'
        : 'Access denied: This repository may be private, or your GitHub token is invalid or missing permissions. Update your token in Settings.';

    case ERROR_CODES.GITHUB_RATE_LIMIT: {
      const resetNote = details.resetAt
        ? isHinglish
          ? ` Limit ${details.resetAt} par reset hogi.`
          : ` Limit resets around ${details.resetAt}.`
        : '';
      return isHinglish
        ? `GitHub API rate limit exceed ho gayi.${resetNote} Higher limit (5,000/hr) ke liye Settings me GitHub token add karein.`
        : `GitHub API rate limit exceeded.${resetNote} Add an optional GitHub token in Settings to increase the limit to 5,000 requests/hour.`;
    }

    case ERROR_CODES.EMPTY_REPO:
      return isHinglish
        ? 'Is repository me koi readable source, config, test, ya doc file nahi mili.'
        : 'No readable source code, config, test, or documentation files were found in this repository.';

    case ERROR_CODES.INVALID_GEMINI_KEY:
      return isHinglish
        ? 'Google Gemini API key invalid ya unauthorized hai. Settings me ja kar apni key check ya update karein.'
        : 'Your Google Gemini API key appears invalid or unauthorized. Please check or update your key in Settings.';

    case ERROR_CODES.GEMINI_RATE_LIMIT:
      return isHinglish
        ? 'Gemini API quota ya rate limit hit ho gayi hai. Thodi der baad dobara try karein ya doosra model/key use karein.'
        : 'Google Gemini API rate limit or quota exceeded. Please wait a moment and try again, or switch models in Settings.';

    case ERROR_CODES.GEMINI_MODEL_ERROR:
      return isHinglish
        ? `Gemini model error: ${error.message || 'Model unavailable'}. Settings me model preference Auto par set kr ke try karein.`
        : `Gemini model error: ${error.message || 'Selected model is unavailable'}. Try switching the model to Auto in Settings.`;

    case ERROR_CODES.MALFORMED_OUTPUT:
      return isHinglish
        ? 'Gemini se valid structured quiz output nahi mil saka. Dobara Generate par click karein.'
        : 'Gemini returned malformed or ungrounded quiz data after retries. Please try generating again.';

    case ERROR_CODES.NETWORK_ERROR:
      return isHinglish
        ? 'Network connection failed. Apna internet check karein ya browser ad-blocker/firewall settings dekhein.'
        : 'Network error while contacting GitHub or Gemini. Please check your internet connection and try again.';

    default:
      return error.message || (isHinglish ? 'Unexpected error aa gaya.' : 'An unexpected error occurred.');
  }
}

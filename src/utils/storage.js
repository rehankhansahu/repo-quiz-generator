// Persistent localStorage helpers for API credentials, theme, language, and model choice.
// Keys remain strictly in the user's browser localStorage and are never sent anywhere
// except the official Google Gemini and GitHub APIs.

export const STORAGE_KEYS = {
  GEMINI_KEY: 'rqg_gemini_api_key',
  GITHUB_TOKEN: 'rqg_github_token',
  THEME: 'rqg_theme',
  LANGUAGE: 'rqg_language',
  GEMINI_MODEL: 'rqg_gemini_model',
  ASKED_HISTORY: 'rqg_asked_history',
};

function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    if (value === null || value === undefined || value === '') {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, String(value));
    }
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key) {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function getStoredGeminiKey() {
  return (safeGet(STORAGE_KEYS.GEMINI_KEY) || '').trim();
}

export function saveGeminiKey(apiKey) {
  return safeSet(STORAGE_KEYS.GEMINI_KEY, apiKey.trim());
}

export function removeGeminiKey() {
  return safeRemove(STORAGE_KEYS.GEMINI_KEY);
}

export function getStoredGithubToken() {
  return (safeGet(STORAGE_KEYS.GITHUB_TOKEN) || '').trim();
}

export function saveGithubToken(token) {
  return safeSet(STORAGE_KEYS.GITHUB_TOKEN, token.trim());
}

export function removeGithubToken() {
  return safeRemove(STORAGE_KEYS.GITHUB_TOKEN);
}

export function getSystemTheme() {
  try {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
  } catch {
    // Default to light if matchMedia is unavailable
  }
  return 'light';
}

export function getStoredTheme() {
  const saved = safeGet(STORAGE_KEYS.THEME);
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }
  return null;
}

export function getInitialTheme() {
  return getStoredTheme() || getSystemTheme();
}

export function saveTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    return safeSet(STORAGE_KEYS.THEME, theme);
  }
  return false;
}

export function getStoredLanguage() {
  const saved = safeGet(STORAGE_KEYS.LANGUAGE);
  if (saved === 'en' || saved === 'hinglish') {
    return saved;
  }
  return 'en';
}

export function saveLanguage(lang) {
  if (lang === 'en' || lang === 'hinglish') {
    return safeSet(STORAGE_KEYS.LANGUAGE, lang);
  }
  return false;
}

export function getStoredGeminiModel() {
  return (safeGet(STORAGE_KEYS.GEMINI_MODEL) || '').trim();
}

export function saveGeminiModel(model) {
  return safeSet(STORAGE_KEYS.GEMINI_MODEL, model.trim());
}

export function getRepoQuestionHistory(repoFullName) {
  const key = (repoFullName || '').trim().toLowerCase();
  if (!key) return [];
  try {
    const raw = safeGet(STORAGE_KEYS.ASKED_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.[key]) ? parsed[key] : [];
  } catch {
    return [];
  }
}

export function appendRepoQuestionHistory(repoFullName, questions) {
  const key = (repoFullName || '').trim().toLowerCase();
  if (!key || !Array.isArray(questions) || questions.length === 0) return false;
  try {
    const raw = safeGet(STORAGE_KEYS.ASKED_HISTORY);
    const map = raw ? JSON.parse(raw) : {};
    const existing = Array.isArray(map[key]) ? map[key] : [];
    const additions = questions.map((q) => ({
      question: q.question,
      sourceFile: q.sourceFile,
    }));
    map[key] = [...existing, ...additions].slice(-40);

    // Keep history bounded across at most 10 repositories
    const keys = Object.keys(map);
    if (keys.length > 10) {
      delete map[keys[0]];
    }
    return safeSet(STORAGE_KEYS.ASKED_HISTORY, JSON.stringify(map));
  } catch {
    return false;
  }
}

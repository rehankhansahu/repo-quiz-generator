import { AppError, ERROR_CODES } from '../utils/errors.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Preferred fast text/coding models in priority order when Auto is selected.
// We always verify active models dynamically via GET /v1beta/models so deprecated IDs are avoided.
const PREFERRED_MODEL_ORDER = [
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-4-hydrogen',
  'gemini-4-neon',
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-4-argon',
  'gemini-4-carbon',
];

const EXCLUDED_MODEL_KEYWORDS = [
  'embedding',
  'aqa',
  'imagen',
  'veo',
  'tts',
  'live',
  'transcribe',
  'image',
  'audio',
  'robotics',
  'nano-banana',
];

const modelCache = new Map();

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AppError(ERROR_CODES.ABORTED, 'Aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new AppError(ERROR_CODES.ABORTED, 'Aborted'));
      },
      { once: true }
    );
  });
}

function rankModelId(modelId) {
  const lower = modelId.toLowerCase();
  const idx = PREFERRED_MODEL_ORDER.findIndex((p) => lower === p || lower.startsWith(p));
  if (idx !== -1) return idx;
  if (lower.includes('flash')) return 100;
  if (lower.includes('hydrogen') || lower.includes('neon')) return 110;
  if (lower.includes('pro')) return 130;
  return 200;
}

/**
 * Fetches active Gemini models supporting `generateContent` using the user's API key.
 */
export async function listAvailableGeminiModels(apiKey, { signal, forceRefresh = false } = {}) {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    throw new AppError(ERROR_CODES.INVALID_GEMINI_KEY, 'Gemini API key is missing.');
  }

  if (!forceRefresh && modelCache.has(cleanKey)) {
    return modelCache.get(cleanKey);
  }

  let res;
  try {
    res = await fetch(`${GEMINI_API_BASE}/models`, {
      method: 'GET',
      headers: {
        'x-goog-api-key': cleanKey,
      },
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new AppError(ERROR_CODES.ABORTED, 'Aborted');
    }
    throw new AppError(ERROR_CODES.NETWORK_ERROR, err?.message || 'Failed to reach Gemini API.');
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    if (res.status === 400 || res.status === 401 || res.status === 403 || bodyText.includes('API_KEY_INVALID')) {
      throw new AppError(ERROR_CODES.INVALID_GEMINI_KEY, 'Invalid Gemini API key.');
    }
    if (res.status === 429) {
      throw new AppError(ERROR_CODES.GEMINI_RATE_LIMIT, 'Gemini API rate limit exceeded.');
    }
    throw new AppError(ERROR_CODES.GEMINI_MODEL_ERROR, `Gemini API error (${res.status}).`);
  }

  const data = await res.json();
  const rawModels = Array.isArray(data?.models) ? data.models : [];

  const usable = rawModels
    .filter((m) => {
      const id = (m.name || '').replace(/^models\//, '');
      const lower = id.toLowerCase();
      const methods = m.supportedGenerationMethods || [];
      if (!methods.includes('generateContent')) return false;
      if (!lower.startsWith('gemini')) return false;
      return !EXCLUDED_MODEL_KEYWORDS.some((kw) => lower.includes(kw));
    })
    .map((m) => {
      const id = (m.name || '').replace(/^models\//, '');
      return {
        id,
        displayName: m.displayName || id,
        inputTokenLimit: m.inputTokenLimit || 1_000_000,
        outputTokenLimit: m.outputTokenLimit || 8192,
      };
    })
    .sort((a, b) => rankModelId(a.id) - rankModelId(b.id));

  if (usable.length === 0) {
    throw new AppError(ERROR_CODES.GEMINI_MODEL_ERROR, 'No compatible Gemini text models found for this API key.');
  }

  modelCache.set(cleanKey, usable);
  return usable;
}

/**
 * Resolves the active model list and chosen default/preferred model.
 */
export async function resolveGeminiModels(apiKey, preferredModelId = '', options = {}) {
  const models = await listAvailableGeminiModels(apiKey, options);
  const preferred = (preferredModelId || '').trim();
  const matched = preferred ? models.find((m) => m.id === preferred) : null;
  const primary = matched || models[0];
  const fallbacks = models.filter((m) => m.id !== primary.id).slice(0, 2);
  return {
    primary,
    fallbacks,
    all: models,
  };
}

/**
 * Strips accidental markdown code fences if a response wraps JSON.
 */
export function extractJsonText(rawText) {
  const trimmed = (rawText || '').trim();
  if (!trimmed) return '';
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  return trimmed;
}

function buildThinkingConfig(modelId, fastMode = false) {
  const lower = (modelId || '').toLowerCase();
  if (/^gemini-(3|4)/.test(lower)) {
    return { thinkingLevel: fastMode ? 'MINIMAL' : 'LOW' };
  }
  if (/^gemini-2\.5/.test(lower)) {
    return { thinkingBudget: 0 };
  }
  return null;
}

/**
 * Calls Gemini `generateContent` with structured JSON output (`responseMimeType` + `responseSchema`),
 * low-latency thinking configuration, retries on transient errors/rate limits, and model fallback.
 */
export async function generateStructuredJson({
  apiKey,
  modelId,
  fallbackModels = [],
  systemInstruction,
  prompt,
  responseSchema,
  temperature = 0.3,
  fastMode = false,
  signal,
}) {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    throw new AppError(ERROR_CODES.INVALID_GEMINI_KEY, 'Gemini API key is required.');
  }

  const candidateModels = [modelId, ...fallbackModels.map((m) => (typeof m === 'string' ? m : m.id))].filter(Boolean);

  for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
    const activeModel = candidateModels[mIdx];
    const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(activeModel)}:generateContent`;
    let thinkingCfg = buildThinkingConfig(activeModel, fastMode);

    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal?.aborted) {
        throw new AppError(ERROR_CODES.ABORTED, 'Aborted');
      }

      const generationConfig = {
        temperature,
        responseMimeType: 'application/json',
        responseSchema,
      };
      if (thinkingCfg) {
        generationConfig.thinkingConfig = thinkingCfg;
      }

      const payload = {
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig,
      };

      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': cleanKey,
          },
          body: JSON.stringify(payload),
          signal,
        });
      } catch (err) {
        if (err?.name === 'AbortError') {
          throw new AppError(ERROR_CODES.ABORTED, 'Aborted');
        }
        if (attempt < maxAttempts - 1) {
          await sleep(500 * Math.pow(2, attempt), signal);
          continue;
        }
        throw new AppError(ERROR_CODES.NETWORK_ERROR, err?.message || 'Network failure contacting Gemini API.');
      }

      if (res.ok) {
        const json = await res.json();
        const candidate = json?.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const rawText = parts.map((p) => p.text || '').join('').trim();

        if (!rawText) {
          throw new AppError(ERROR_CODES.MALFORMED_OUTPUT, 'Gemini returned an empty response.');
        }

        const cleaned = extractJsonText(rawText);
        try {
          return JSON.parse(cleaned);
        } catch {
          throw new AppError(ERROR_CODES.MALFORMED_OUTPUT, 'Gemini output was not valid JSON.');
        }
      }

      const errorBody = await res.json().catch(() => ({}));
      const apiMsg = errorBody?.error?.message || `HTTP ${res.status}`;
      const apiStatus = errorBody?.error?.status || '';

      // If this model variant does not support thinkingConfig/MINIMAL/LOW, retry immediately without it
      if (res.status === 400 && thinkingCfg && /thinking/i.test(apiMsg)) {
        thinkingCfg = null;
        continue;
      }

      if (
        res.status === 401 ||
        res.status === 403 ||
        apiMsg.includes('API key not valid') ||
        apiStatus === 'UNAUTHENTICATED'
      ) {
        throw new AppError(ERROR_CODES.INVALID_GEMINI_KEY, apiMsg);
      }

      // If this model ID is unsupported/not found, switch to next fallback model
      if (res.status === 404 && mIdx < candidateModels.length - 1) {
        break;
      }

      if ((res.status === 429 || res.status === 500 || res.status === 503) && attempt < maxAttempts - 1) {
        await sleep(900 * Math.pow(2, attempt) + Math.random() * 300, signal);
        continue;
      }

      if (res.status === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
        throw new AppError(ERROR_CODES.GEMINI_RATE_LIMIT, apiMsg);
      }

      throw new AppError(ERROR_CODES.GEMINI_MODEL_ERROR, apiMsg);
    }
  }

  throw new AppError(ERROR_CODES.GEMINI_MODEL_ERROR, 'No Gemini model succeeded.');
}

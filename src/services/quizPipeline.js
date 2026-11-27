import { AppError, ERROR_CODES } from '../utils/errors.js';
import { generateStructuredJson, resolveGeminiModels } from './geminiApi.js';

const CHUNK_CHAR_LIMIT = 150_000;
const REDUCE_RAW_BUDGET = 180_000;
const MAX_SINGLE_FILE_PROMPT_CHARS = 18_000;
const MAX_GENERATION_ATTEMPTS = 3;

const NON_ROMAN_SCRIPT_RE = /[\u0900-\u097F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

const FILLER_OPTION_PATTERNS = [
  /^all of the above\.?$/i,
  /^none of the above\.?$/i,
  /^both [a-d] and [a-d]\.?$/i,
  /^all of these\.?$/i,
  /^none of these\.?$/i,
  /^all options( are correct)?\.?$/i,
  /^upar ke sabhi/i,
  /^sabhi options sahi/i,
  /^inme se koi nahi/i,
];

export const QUIZ_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          difficulty: {
            type: 'STRING',
            enum: ['Easy', 'Medium', 'Hard'],
          },
          question: { type: 'STRING' },
          options: {
            type: 'OBJECT',
            properties: {
              A: { type: 'STRING' },
              B: { type: 'STRING' },
              C: { type: 'STRING' },
              D: { type: 'STRING' },
            },
            required: ['A', 'B', 'C', 'D'],
          },
          correctAnswer: {
            type: 'STRING',
            enum: ['A', 'B', 'C', 'D'],
          },
          explanation: { type: 'STRING' },
          sourceFile: { type: 'STRING' },
        },
        required: ['id', 'difficulty', 'question', 'options', 'correctAnswer', 'explanation', 'sourceFile'],
      },
    },
  },
  required: ['questions'],
};

const CHUNK_SUMMARY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    moduleOverview: { type: 'STRING' },
    files: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          path: { type: 'STRING' },
          purpose: { type: 'STRING' },
          keySymbols: { type: 'ARRAY', items: { type: 'STRING' } },
          configOrDeps: { type: 'STRING' },
          logicAndEdgeCases: { type: 'STRING' },
        },
        required: ['path', 'purpose', 'keySymbols', 'logicAndEdgeCases'],
      },
    },
    crossFileFlows: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['moduleOverview', 'files', 'crossFileFlows'],
};

function formatSingleFileContent(content, totalFilesCount) {
  if (totalFilesCount <= 12 || content.length <= MAX_SINGLE_FILE_PROMPT_CHARS) {
    return content;
  }
  const head = content.slice(0, 11_000);
  const tail = content.slice(-4_000);
  return `${head}\n\n/* ... truncated middle of large file for speed ... */\n\n${tail}`;
}

function formatFilesPayload(files) {
  const count = files.length;
  return files
    .map(
      (f) =>
        `=== FILE: ${f.path} (${f.category}, ${f.language}) ===\n${formatSingleFileContent(f.content, count)}\n=== END FILE ===`
    )
    .join('\n\n');
}

/**
 * Splits repository files into logical module chunks under `CHUNK_CHAR_LIMIT`.
 */
export function buildModuleChunks(files, maxCharsPerChunk = CHUNK_CHAR_LIMIT) {
  const byModule = new Map();
  for (const file of files) {
    const key = file.moduleKey || 'root';
    if (!byModule.has(key)) byModule.set(key, []);
    byModule.get(key).push(file);
  }

  const chunks = [];
  let currentFiles = [];
  let currentChars = 0;
  let currentModules = new Set();

  const flush = () => {
    if (currentFiles.length > 0) {
      chunks.push({
        id: chunks.length + 1,
        modules: Array.from(currentModules),
        files: currentFiles,
        chars: currentChars,
      });
      currentFiles = [];
      currentChars = 0;
      currentModules = new Set();
    }
  };

  for (const [modKey, modFiles] of byModule.entries()) {
    for (const file of modFiles) {
      const fileSize = file.content.length + 120;
      if (currentFiles.length > 0 && currentChars + fileSize > maxCharsPerChunk) {
        flush();
      }
      currentFiles.push(file);
      currentChars += fileSize;
      currentModules.add(modKey);
    }
    // Keep distinct large modules cleanly separated when current chunk already has substantial size
    if (currentChars > maxCharsPerChunk * 0.65) {
      flush();
    }
  }
  flush();
  return chunks;
}

/**
 * Computes module/category distribution plan so questions span the entire codebase
 * instead of clustering on one file or the README.
 */
export function buildCoveragePlan(projectMap, counts) {
  const total = counts.Easy + counts.Medium + counts.Hard;
  const nonReadmeFiles = projectMap.files.filter(
    (f) => !/^readme/i.test(f.path.split('/').pop() || '')
  );

  const modules = projectMap.modules.filter((m) =>
    m.files.some((p) => !/^readme/i.test(p.split('/').pop() || ''))
  );
  const activeModules = modules.length > 0 ? modules : projectMap.modules;

  // Round-robin pick module targets so every major part of the project is represented
  const assignments = [];
  for (let i = 0; i < total; i++) {
    const mod = activeModules[i % activeModules.length];
    assignments.push(mod.name);
  }

  const targetCountsByModule = {};
  for (const name of assignments) {
    targetCountsByModule[name] = (targetCountsByModule[name] || 0) + 1;
  }

  return {
    nonReadmeCount: nonReadmeFiles.length,
    moduleTargets: Object.entries(targetCountsByModule).map(([module, count]) => ({
      module,
      count,
    })),
  };
}

function normalizePathRef(sourceFile, validPathMap) {
  if (!sourceFile || typeof sourceFile !== 'string') return null;
  let candidate = sourceFile.trim().replace(/^`+|`+$/g, '');
  if (validPathMap.has(candidate.toLowerCase())) {
    return candidate;
  }

  // Handle formats like "src/auth.js (verifyToken)" or "src/auth.js:verifyToken" or "src/auth.js#L12"
  const splitMatch = candidate.match(/^([^\s(:`#]+\.[A-Za-z0-9_]+|Dockerfile|Makefile|Jenkinsfile|Procfile)(.*)$/i);
  if (splitMatch) {
    const pathPart = splitMatch[1].replace(/^\.\//, '');
    if (validPathMap.has(pathPart.toLowerCase())) {
      return `${validPathMap.get(pathPart.toLowerCase())}${splitMatch[2] || ''}`;
    }
  }

  // Fallback substring lookup against real repo paths sorted longest-first
  const lower = candidate.toLowerCase();
  const pathsSorted = Array.from(validPathMap.values()).sort((a, b) => b.length - a.length);
  for (const realPath of pathsSorted) {
    if (lower.includes(realPath.toLowerCase())) {
      return candidate;
    }
  }

  return null;
}

function extractBaseFilePath(sourceFile, validPathMap) {
  const lower = (sourceFile || '').toLowerCase();
  const pathsSorted = Array.from(validPathMap.values()).sort((a, b) => b.length - a.length);
  for (const realPath of pathsSorted) {
    if (lower.startsWith(realPath.toLowerCase()) || lower.includes(realPath.toLowerCase())) {
      return realPath;
    }
  }
  return '';
}

function tokenizeForSimilarity(text) {
  return new Set(
    (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function isNearDuplicate(candidateText, existingTexts) {
  const a = tokenizeForSimilarity(candidateText);
  if (a.size === 0) return false;
  for (const existing of existingTexts) {
    const b = tokenizeForSimilarity(existing);
    if (b.size === 0) continue;
    let intersection = 0;
    for (const token of a) {
      if (b.has(token)) intersection++;
    }
    const union = a.size + b.size - intersection;
    if (union > 0 && intersection / union >= 0.65) {
      return true;
    }
  }
  return false;
}

/**
 * Validates raw questions from Gemini against strict quality, grounding, language,
 * uniqueness, and per-difficulty count constraints.
 */
export function validateQuizQuestions({
  rawQuestions,
  remainingCounts,
  validFiles,
  language,
  acceptedQuestions = [],
  allowSameFile = false,
}) {
  const validPathMap = new Map(validFiles.map((f) => [f.path.toLowerCase(), f.path]));
  const nonReadmeFilesCount = validFiles.filter(
    (f) => !/^readme/i.test(f.path.split('/').pop() || '')
  ).length;

  const need = { ...remainingCounts };
  const accepted = [];
  const rejectedReasons = [];

  const existingQuestionTexts = acceptedQuestions.map((q) => q.question);
  const usedBaseFiles = new Set(
    acceptedQuestions.map((q) => extractBaseFilePath(q.sourceFile, validPathMap)).filter(Boolean)
  );
  let readmeCount = acceptedQuestions.filter((q) =>
    /(^|\/)readme/i.test(extractBaseFilePath(q.sourceFile, validPathMap))
  ).length;

  for (const item of Array.isArray(rawQuestions) ? rawQuestions : []) {
    if (!item || typeof item !== 'object') {
      rejectedReasons.push('invalid_item');
      continue;
    }

    const diff = item.difficulty;
    if (!['Easy', 'Medium', 'Hard'].includes(diff) || (need[diff] || 0) <= 0) {
      rejectedReasons.push('unexpected_difficulty_or_quota_full');
      continue;
    }

    const qText = (item.question || '').trim();
    const explanation = (item.explanation || '').trim();
    const correctAnswer = (item.correctAnswer || '').trim().toUpperCase();
    const opts = item.options;

    if (!qText || !explanation || !['A', 'B', 'C', 'D'].includes(correctAnswer) || !opts) {
      rejectedReasons.push('missing_required_fields');
      continue;
    }

    const optionValues = ['A', 'B', 'C', 'D'].map((k) => (opts[k] || '').trim());
    if (optionValues.some((v) => !v)) {
      rejectedReasons.push('empty_option');
      continue;
    }

    const distinctOpts = new Set(optionValues.map((v) => v.toLowerCase()));
    if (distinctOpts.size < 4) {
      rejectedReasons.push('duplicate_options');
      continue;
    }

    if (optionValues.some((v) => FILLER_OPTION_PATTERNS.some((re) => re.test(v)))) {
      rejectedReasons.push('filler_option');
      continue;
    }

    // Enforce Roman script only for Hinglish
    if (language === 'hinglish') {
      const combined = [qText, explanation, ...optionValues].join(' ');
      if (NON_ROMAN_SCRIPT_RE.test(combined)) {
        rejectedReasons.push('non_roman_script_in_hinglish');
        continue;
      }
    }

    // Verify sourceFile grounds to a real file in the repository
    const normalizedSource = normalizePathRef(item.sourceFile, validPathMap);
    if (!normalizedSource) {
      rejectedReasons.push(`ungrounded_source_file:${item.sourceFile}`);
      continue;
    }

    const baseFile = extractBaseFilePath(normalizedSource, validPathMap);
    const isReadme = /(^|\/)readme/i.test(baseFile);
    if (isReadme && nonReadmeFilesCount >= 2 && readmeCount >= 1) {
      rejectedReasons.push('excess_readme_question');
      continue;
    }

    if (!allowSameFile && nonReadmeFilesCount > acceptedQuestions.length + accepted.length + 1 && usedBaseFiles.has(baseFile)) {
      rejectedReasons.push('clustered_same_file');
      continue;
    }

    if (isNearDuplicate(qText, [...existingQuestionTexts, ...accepted.map((a) => a.question)])) {
      rejectedReasons.push('duplicate_question');
      continue;
    }

    accepted.push({
      id: item.id || `q${acceptedQuestions.length + accepted.length + 1}`,
      difficulty: diff,
      question: qText,
      options: {
        A: optionValues[0],
        B: optionValues[1],
        C: optionValues[2],
        D: optionValues[3],
      },
      correctAnswer,
      explanation,
      sourceFile: normalizedSource,
    });

    need[diff] -= 1;
    if (baseFile) usedBaseFiles.add(baseFile);
    if (isReadme) readmeCount += 1;
  }

  return {
    accepted,
    remainingCounts: need,
    rejectedReasons,
  };
}

function buildLanguageInstruction(language) {
  if (language === 'hinglish') {
    return [
      'LANGUAGE: Hinglish (casual Roman-script Hindi/Urdu mixed with English, the way a developer naturally chats).',
      'Examples of natural Hinglish tone: "Is function me kon sa parameter required hai?", "Ye code run krne par kya output aaye ga?", "Is module ka main kaam kya hai?".',
      'STRICT SCRIPT RULE: Use ONLY Roman script (A-Z, a-z). NEVER use Devanagari (Hindi script) or Arabic/Urdu script.',
      'KEEP ORIGINAL IDENTIFIERS: Keep all technical terms, file paths, function names, class names, variable names, CLI commands, and config keys in their exact original English code form.',
      'Apply Hinglish to question text, all 4 options (A-D), and the explanation.',
    ].join('\n');
  }

  return [
    'LANGUAGE: Clear, precise technical English for question text, all 4 options (A-D), and explanation.',
    'Keep all file paths, function names, class names, variable names, and config keys in their exact original code form.',
  ].join('\n');
}

function buildSystemInstruction(language) {
  return [
    'You are a senior software engineer designing an accurate, code-grounded multiple-choice quiz strictly from the provided GitHub repository contents.',
    'GROUNDING RULES:',
    '1. Every single question, option, correctAnswer, and explanation MUST come strictly from the repository source code, configs, tests, scripts, manifests, or docs provided.',
    '2. NEVER invent files, functions, classes, endpoints, configs, or behaviors that do not exist in the provided repository.',
    '3. NEVER generate questions from general programming knowledge or from the README alone. Spread questions across real source code, configs, manifests, tests, and modules.',
    '4. Avoid clustering multiple questions on a single file unless the repository only has a few files.',
    '5. Every question MUST include a valid `sourceFile` from the repository (plus function/class name when relevant, e.g. `src/api/client.js (fetchWithRetry)`).',
    '6. Provide 4 distinct, plausible options (A-D) with exactly one unambiguously correct answer. NEVER use "All of the above", "None of the above", or "Both A and B".',
    'DIFFICULTY DEFINITIONS:',
    '- Easy: Direct facts observable in the code (what a file/function does, a config value, a dependency purpose, an exported route/command).',
    '- Medium: Understanding logic, control flow between modules, validation rules, error handling, or why an implementation is structured a certain way.',
    '- Hard: Multi-file reasoning, subtle edge cases, predicting exact output or state transitions, architecture and interaction across components.',
    buildLanguageInstruction(language),
  ].join('\n\n');
}

function selectRepresentativeRawFiles(files, charBudget) {
  const scored = [...files].sort((a, b) => {
    const score = (f) => {
      const name = (f.path.split('/').pop() || '').toLowerCase();
      if (/^readme/i.test(name)) return 10;
      if (f.category === 'source') return 90;
      if (f.category === 'manifest') return 85;
      if (f.category === 'config') return 75;
      if (f.category === 'test') return 70;
      return 40;
    };
    return score(b) - score(a);
  });

  // Round-robin across modules so representative raw snippets come from every directory
  const byMod = new Map();
  for (const f of scored) {
    const key = f.moduleKey || 'root';
    if (!byMod.has(key)) byMod.set(key, []);
    byMod.get(key).push(f);
  }

  const chosen = [];
  let usedChars = 0;
  const modLists = Array.from(byMod.values());
  let round = 0;

  while (usedChars < charBudget) {
    let added = false;
    for (const list of modLists) {
      if (round < list.length) {
        const f = list[round];
        const needed = f.content.length + 120;
        if (usedChars + needed <= charBudget) {
          chosen.push(f);
          usedChars += needed;
        }
        added = true;
      }
    }
    if (!added) break;
    round++;
  }

  return chosen;
}

/**
 * Orchestrates full repository quiz generation:
 * - Decides Direct Full Context vs Map-Reduce chunk summarization
 * - Enforces whole-project module coverage
 * - Validates structured JSON, grounding, Hinglish script, uniqueness, and exact difficulty counts
 */
export async function generateRepoQuiz({
  apiKey,
  preferredModel = '',
  projectMap,
  counts,
  language = 'en',
  onStageChange,
  signal,
}) {
  const { primary, fallbacks } = await resolveGeminiModels(apiKey, preferredModel, { signal });
  const inputLimit = primary.inputTokenLimit || 1_000_000;
  // ~3.4 chars/token; keep single-pass direct context snappy while staying comfortably inside window
  const directCharBudget = Math.min(Math.floor(inputLimit * 0.45 * 3.4), 450_000);

  const useMapReduce = projectMap.totalChars > directCharBudget;
  const strategy = useMapReduce ? 'map-reduce' : 'direct';
  onStageChange?.({ stage: 'strategy', strategy, modelId: primary.id });

  let contextPayload = '';

  if (!useMapReduce) {
    contextPayload = [
      '=== PROJECT MAP ===',
      projectMap.summaryText,
      '',
      '=== FULL REPOSITORY FILES ===',
      formatFilesPayload(projectMap.files),
    ].join('\n');
  } else {
    const chunks = buildModuleChunks(projectMap.files, CHUNK_CHAR_LIMIT);
    onStageChange?.({
      stage: 'summarizing',
      chunksDone: 0,
      chunksTotal: chunks.length,
    });

    const chunkSummaries = new Array(chunks.length);
    let nextChunkIdx = 0;
    let completedChunks = 0;

    const mapWorker = async () => {
      while (true) {
        if (signal?.aborted) throw new AppError(ERROR_CODES.ABORTED, 'Aborted');
        const idx = nextChunkIdx++;
        if (idx >= chunks.length) return;
        const chunk = chunks[idx];

        const mapPrompt = [
          `Repository: ${projectMap.repoInfo.fullName} (branch: ${projectMap.repoInfo.branch})`,
          `Modules in this chunk: ${chunk.modules.join(', ')}`,
          '',
          'Analyze EVERY file below thoroughly. Extract exact file paths, symbol names (functions/classes/exports), configuration keys, dependencies, control flows, edge cases, and cross-file interactions strictly observed in this chunk.',
          'Do not guess or invent anything outside these files.',
          '',
          formatFilesPayload(chunk.files),
        ].join('\n');

        const summary = await generateStructuredJson({
          apiKey,
          modelId: primary.id,
          fallbackModels: fallbacks,
          systemInstruction:
            'You are a senior code analyst producing faithful, factual module summaries from source code for downstream quiz generation.',
          prompt: mapPrompt,
          responseSchema: CHUNK_SUMMARY_SCHEMA,
          temperature: 0.2,
          fastMode: true,
          signal,
        });

        chunkSummaries[idx] = {
          chunkId: chunk.id,
          modules: chunk.modules,
          summary,
        };
        completedChunks += 1;
        onStageChange?.({
          stage: 'summarizing',
          chunksDone: completedChunks,
          chunksTotal: chunks.length,
        });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(4, Math.max(1, chunks.length)) }, () => mapWorker())
    );

    const rawRepresentative = selectRepresentativeRawFiles(projectMap.files, REDUCE_RAW_BUDGET);

    contextPayload = [
      '=== PROJECT MAP ===',
      projectMap.summaryText,
      '',
      '=== FULL REPOSITORY CHUNK SUMMARIES (ALL MODULES) ===',
      JSON.stringify(chunkSummaries, null, 2),
      '',
      '=== REPRESENTATIVE RAW SOURCE FILES ACROSS MODULES ===',
      formatFilesPayload(rawRepresentative),
    ].join('\n');
  }

  const coveragePlan = buildCoveragePlan(projectMap, counts);
  const systemInstruction = buildSystemInstruction(language);

  let remaining = {
    Easy: counts.Easy || 0,
    Medium: counts.Medium || 0,
    Hard: counts.Hard || 0,
  };
  const accepted = [];

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const totalRemaining = remaining.Easy + remaining.Medium + remaining.Hard;
    if (totalRemaining === 0) break;

    onStageChange?.({
      stage: attempt === 1 ? 'generating' : 'validating',
      attempt,
    });

    const alreadyCoveredFiles = accepted.map((q) => q.sourceFile);
    const alreadyQuestions = accepted.map((q) => `- [${q.difficulty}] ${q.question} (${q.sourceFile})`);

    const distributionText = coveragePlan.moduleTargets
      .map((m) => `${m.module}: ~${m.count} question(s)`)
      .join(', ');

    const userPrompt = [
      `Generate EXACTLY ${totalRemaining} multiple-choice questions for repository "${projectMap.repoInfo.fullName}".`,
      `REQUIRED EXACT DIFFICULTY COUNTS FOR THIS RESPONSE:`,
      `- Easy: ${remaining.Easy}`,
      `- Medium: ${remaining.Medium}`,
      `- Hard: ${remaining.Hard}`,
      `Total questions in JSON array MUST equal ${totalRemaining}.`,
      '',
      `PROJECT-WIDE COVERAGE TARGETS (spread across modules, code, configs, tests, architecture): ${distributionText}.`,
      coveragePlan.nonReadmeCount >= 2
        ? 'IMPORTANT: Base questions on source code, configs, tests, and manifests — NEVER rely only on README.md.'
        : '',
      alreadyCoveredFiles.length > 0
        ? `AVOID REPEATING THESE ALREADY-COVERED FILES/QUESTIONS:\n${alreadyQuestions.join('\n')}`
        : '',
      '',
      'REPOSITORY DATA:',
      contextPayload,
    ]
      .filter(Boolean)
      .join('\n');

    const parsed = await generateStructuredJson({
      apiKey,
      modelId: primary.id,
      fallbackModels: fallbacks,
      systemInstruction,
      prompt: userPrompt,
      responseSchema: QUIZ_RESPONSE_SCHEMA,
      temperature: attempt === 1 ? 0.3 : 0.45,
      signal,
    });

    onStageChange?.({ stage: 'validating', attempt });

    const validation = validateQuizQuestions({
      rawQuestions: parsed?.questions,
      remainingCounts: remaining,
      validFiles: projectMap.files,
      language,
      acceptedQuestions: accepted,
      allowSameFile: attempt === MAX_GENERATION_ATTEMPTS,
    });

    accepted.push(...validation.accepted);
    remaining = validation.remainingCounts;
  }

  const totalWanted = (counts.Easy || 0) + (counts.Medium || 0) + (counts.Hard || 0);
  if (accepted.length < totalWanted) {
    throw new AppError(
      ERROR_CODES.MALFORMED_OUTPUT,
      `Generated ${accepted.length} valid grounded questions out of ${totalWanted} requested.`
    );
  }

  // Order cleanly: Easy -> Medium -> Hard, with sequential IDs
  const diffOrder = { Easy: 0, Medium: 1, Hard: 2 };
  accepted.sort((a, b) => diffOrder[a.difficulty] - diffOrder[b.difficulty]);
  const finalized = accepted.map((q, i) => ({
    ...q,
    id: `q${i + 1}`,
  }));

  return {
    questions: finalized,
    strategy,
    modelId: primary.id,
  };
}

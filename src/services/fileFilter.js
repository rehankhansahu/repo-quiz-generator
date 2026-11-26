// Intelligent repository file filtering and prioritization.
// Ensures source code, configs, tests, scripts, docs, and manifests are included,
// while excluding build artifacts, dependencies, lockfiles, binaries, and oversized generated files.

export const MAX_FILE_BYTES = 120 * 1024; // 120 KB per file
export const MAX_FETCH_FILES = 200; // Safe upper bound across the entire repository

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.astro',
  '.output',
  '.vercel',
  '.netlify',
  'vendor',
  'venv',
  '.venv',
  'env',
  '.env',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.tox',
  'coverage',
  '.nyc_output',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.gradle',
  '.idea',
  '.vscode',
  'pods',
  'deriveddata',
  'obj',
  'bower_components',
  'jspm_packages',
  '.yarn',
  '.pnpm-store',
  '.terraform',
]);

const EXCLUDED_EXACT_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'bun.lock',
  'npm-shrinkwrap.json',
  'poetry.lock',
  'pipfile.lock',
  'cargo.lock',
  'gemfile.lock',
  'composer.lock',
  'uv.lock',
  'pdm.lock',
  'flake.lock',
  'mix.lock',
  'pubspec.lock',
  'podfile.lock',
  'go.sum',
  '.ds_store',
  'thumbs.db',
  'desktop.ini',
  'license',
  'license.md',
  'license.txt',
  'copying',
]);

const EXCLUDED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.ico', '.icns', '.svg', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.wav', '.ogg', '.flac', '.aac', '.avi', '.mov', '.mkv', '.webm',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar',
  '.jar', '.war', '.ear', '.apk', '.ipa', '.exe', '.dll', '.so', '.dylib', '.a', '.o', '.obj', '.lib',
  '.class', '.pyc', '.pyo', '.wasm', '.bin', '.dat', '.db', '.sqlite', '.sqlite3', '.mdb',
  '.parquet', '.feather', '.pickle', '.pkl', '.pt', '.pth', '.onnx', '.safetensors', '.h5', '.pb',
  '.lock', '.snap', '.map',
]);

const EXTENSION_LANGUAGE_MAP = {
  '.js': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.jsx': 'React JSX',
  '.ts': 'TypeScript',
  '.mts': 'TypeScript',
  '.cts': 'TypeScript',
  '.tsx': 'React TSX',
  '.py': 'Python',
  '.pyi': 'Python',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.go': 'Go',
  '.rs': 'Rust',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.c': 'C',
  '.h': 'C/C++ Header',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.cxx': 'C++',
  '.hpp': 'C++ Header',
  '.cs': 'C#',
  '.swift': 'Swift',
  '.dart': 'Dart',
  '.scala': 'Scala',
  '.ex': 'Elixir',
  '.exs': 'Elixir',
  '.erl': 'Erlang',
  '.hs': 'Haskell',
  '.lua': 'Lua',
  '.r': 'R',
  '.sql': 'SQL',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.zsh': 'Shell',
  '.ps1': 'PowerShell',
  '.bat': 'Batch',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.astro': 'Astro',
  '.html': 'HTML',
  '.htm': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sass': 'Sass',
  '.less': 'Less',
  '.json': 'JSON',
  '.jsonc': 'JSONC',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.toml': 'TOML',
  '.ini': 'INI',
  '.cfg': 'Config',
  '.conf': 'Config',
  '.xml': 'XML',
  '.graphql': 'GraphQL',
  '.gql': 'GraphQL',
  '.proto': 'Protobuf',
  '.tf': 'Terraform',
  '.hcl': 'HCL',
  '.md': 'Markdown',
  '.mdx': 'MDX',
  '.rst': 'reStructuredText',
  '.txt': 'Text',
  '.prisma': 'Prisma',
  '.sol': 'Solidity',
};

const SPECIAL_MANIFEST_NAMES = new Set([
  'package.json',
  'tsconfig.json',
  'jsconfig.json',
  'pyproject.toml',
  'requirements.txt',
  'setup.py',
  'setup.cfg',
  'pipfile',
  'cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'gemfile',
  'composer.json',
  'pubspec.yaml',
  'mix.exs',
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  'makefile',
  'cmakelists.txt',
  'procfile',
  'rakefile',
  'justfile',
  '.env.example',
  '.env.sample',
  '.gitignore',
  '.eslintrc.json',
  '.prettierrc',
  '.prettierrc.json',
]);

function getExtension(fileName) {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot >= 0 ? lower.slice(dot) : '';
}

function isGeneratedOrMinified(fileName) {
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith('.min.js') ||
    lower.endsWith('.min.mjs') ||
    lower.endsWith('.min.css') ||
    lower.endsWith('.bundle.js') ||
    lower.endsWith('.chunk.js') ||
    lower.endsWith('.generated.ts') ||
    lower.endsWith('.generated.js') ||
    lower.endsWith('.g.dart') ||
    lower.endsWith('.freezed.dart') ||
    lower.endsWith('.pb.go') ||
    lower.endsWith('_pb2.py') ||
    lower.endsWith('_pb2_grpc.py')
  );
}

export function classifyFileCategory(path) {
  const lower = path.toLowerCase();
  const fileName = lower.split('/').pop() || lower;
  const ext = getExtension(fileName);

  if (
    SPECIAL_MANIFEST_NAMES.has(fileName) ||
    fileName.startsWith('dockerfile') ||
    fileName.startsWith('requirements') && ext === '.txt'
  ) {
    return 'manifest';
  }

  if (
    lower.includes('/test/') ||
    lower.includes('/tests/') ||
    lower.includes('/__tests__/') ||
    lower.includes('/spec/') ||
    lower.startsWith('test/') ||
    lower.startsWith('tests/') ||
    /\.(test|spec)\.[^.]+$/.test(fileName) ||
    /^test_.*\.py$/.test(fileName) ||
    /_test\.go$/.test(fileName)
  ) {
    return 'test';
  }

  if (
    ext === '.md' ||
    ext === '.mdx' ||
    ext === '.rst' ||
    (ext === '.txt' && !fileName.startsWith('requirements'))
  ) {
    return 'doc';
  }

  if (
    lower.startsWith('.github/') ||
    ['.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.xml', '.tf', '.hcl'].includes(ext) ||
    /^(vite|webpack|rollup|babel|eslint|prettier|tailwind|postcss|jest|vitest|playwright|cypress|next|nuxt|astro|svelte|drizzle)\.config\./.test(fileName) ||
    fileName.startsWith('.')
  ) {
    return 'config';
  }

  return 'source';
}

export function detectLanguage(path) {
  const fileName = (path.split('/').pop() || path).toLowerCase();
  if (fileName.startsWith('dockerfile')) return 'Dockerfile';
  if (fileName === 'makefile' || fileName === 'justfile') return 'Makefile';
  const ext = getExtension(fileName);
  return EXTENSION_LANGUAGE_MAP[ext] || 'Text';
}

/**
 * Evaluates a single tree entry (`{ path, type, size, sha }`).
 * Returns `{ include: true, category, language, priority }` or `{ include: false, reason }`.
 */
export function evaluateTreeEntry(entry) {
  if (!entry || entry.type !== 'blob' || !entry.path) {
    return { include: false, reason: 'not_blob' };
  }

  const parts = entry.path.split('/');
  const fileName = parts[parts.length - 1];
  const lowerName = fileName.toLowerCase();

  // Check directory exclusions (all path segments except the filename)
  for (let i = 0; i < parts.length - 1; i++) {
    if (EXCLUDED_DIRS.has(parts[i].toLowerCase())) {
      return { include: false, reason: 'excluded_dir' };
    }
  }

  if (EXCLUDED_EXACT_FILES.has(lowerName)) {
    return { include: false, reason: 'lock_or_meta' };
  }

  if (isGeneratedOrMinified(lowerName)) {
    return { include: false, reason: 'generated_or_minified' };
  }

  const ext = getExtension(lowerName);
  if (EXCLUDED_EXTENSIONS.has(ext)) {
    return { include: false, reason: 'binary_or_asset' };
  }

  if (typeof entry.size === 'number' && entry.size > MAX_FILE_BYTES) {
    return { include: false, reason: 'too_large' };
  }

  const isKnownText =
    Boolean(EXTENSION_LANGUAGE_MAP[ext]) ||
    SPECIAL_MANIFEST_NAMES.has(lowerName) ||
    lowerName.startsWith('dockerfile') ||
    lowerName.startsWith('readme') ||
    lowerName.startsWith('.env.') ||
    lowerName.startsWith('.eslintrc') ||
    lowerName.startsWith('.prettierrc') ||
    lowerName.startsWith('.babelrc') ||
    lowerName.startsWith('tsconfig');

  if (!isKnownText) {
    return { include: false, reason: 'unsupported_ext' };
  }

  const category = classifyFileCategory(entry.path);
  const language = detectLanguage(entry.path);

  // Priority weight used only if repo exceeds MAX_FETCH_FILES
  let priority = 50;
  if (category === 'manifest') priority = 100;
  else if (category === 'source') priority = 90;
  else if (category === 'config') priority = 80;
  else if (category === 'test') priority = 75;
  else if (category === 'doc') priority = lowerName.startsWith('readme') ? 55 : 65;

  return {
    include: true,
    category,
    language,
    priority,
  };
}

/**
 * Filters full repository tree blobs and selects up to MAX_FETCH_FILES using directory
 * round-robin sampling if the repo is very large so every module/folder gets represented.
 */
export function filterRepositoryTree(treeEntries, maxFiles = MAX_FETCH_FILES) {
  const included = [];
  const excludedStats = {
    excluded_dir: 0,
    lock_or_meta: 0,
    generated_or_minified: 0,
    binary_or_asset: 0,
    too_large: 0,
    unsupported_ext: 0,
    totalSkipped: 0,
  };

  for (const entry of treeEntries || []) {
    if (entry.type !== 'blob') continue;
    const verdict = evaluateTreeEntry(entry);
    if (verdict.include) {
      included.push({
        path: entry.path,
        sha: entry.sha,
        size: entry.size || 0,
        category: verdict.category,
        language: verdict.language,
        priority: verdict.priority,
      });
    } else if (verdict.reason !== 'not_blob') {
      excludedStats[verdict.reason] = (excludedStats[verdict.reason] || 0) + 1;
      excludedStats.totalSkipped += 1;
    }
  }

  if (included.length <= maxFiles) {
    return {
      selectedFiles: included,
      totalCandidateCount: included.length,
      wasCapped: false,
      excludedStats,
    };
  }

  // Round-robin across top-level / second-level directories so no module is starved
  const groups = new Map();
  for (const file of included) {
    const segments = file.path.split('/');
    const groupKey =
      segments.length >= 3
        ? `${segments[0]}/${segments[1]}`
        : segments.length === 2
          ? segments[0]
          : '__root__';
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(file);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => b.priority - a.priority || a.size - b.size);
  }

  const selectedFiles = [];
  const groupLists = Array.from(groups.values());
  let round = 0;

  while (selectedFiles.length < maxFiles) {
    let addedInRound = false;
    for (const list of groupLists) {
      if (round < list.length) {
        selectedFiles.push(list[round]);
        addedInRound = true;
        if (selectedFiles.length >= maxFiles) break;
      }
    }
    if (!addedInRound) break;
    round++;
  }

  return {
    selectedFiles,
    totalCandidateCount: included.length,
    wasCapped: true,
    excludedStats,
  };
}

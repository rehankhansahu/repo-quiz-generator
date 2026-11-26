// Static repository analyzer that constructs a structured Project Map:
// folder tree, languages, entry points, main modules, key functions/classes,
// parsed dependencies, and inter-module import connections.

const ENTRY_POINT_NAMES = new Set([
  'index.js', 'index.jsx', 'index.ts', 'index.tsx', 'index.mjs',
  'main.js', 'main.ts', 'main.py', 'main.go', 'main.rs', 'main.java', 'main.kt', 'main.dart',
  'app.js', 'app.ts', 'app.py', 'server.js', 'server.ts', 'server.py', 'cli.js', 'cli.ts',
  '__main__.py', 'manage.py', 'dockerfile', 'makefile',
]);

function extractSymbolsFromContent(file) {
  const symbols = new Set();
  const content = file.content || '';
  const lang = file.language;

  if (['JavaScript', 'React JSX', 'TypeScript', 'React TSX', 'Vue', 'Svelte', 'Astro'].includes(lang)) {
    const patterns = [
      /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
      /\b(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g,
      /\b(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
      /\bexport\s+(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/g,
      /\b(?:export\s+)?interface\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    ];
    for (const re of patterns) {
      let match;
      while ((match = re.exec(content)) !== null && symbols.size < 18) {
        if (match[1] && match[1].length > 1) symbols.add(match[1]);
      }
    }
  } else if (lang === 'Python') {
    const patterns = [
      /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
      /^class\s+([A-Za-z_][A-Za-z0-9_]*)/gm,
    ];
    for (const re of patterns) {
      let match;
      while ((match = re.exec(content)) !== null && symbols.size < 18) {
        symbols.add(match[1]);
      }
    }
  } else if (lang === 'Go') {
    const patterns = [
      /^func\s+(?:\([^)]+\)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
      /^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:struct|interface)\b/gm,
    ];
    for (const re of patterns) {
      let match;
      while ((match = re.exec(content)) !== null && symbols.size < 18) {
        symbols.add(match[1]);
      }
    }
  } else if (lang === 'Rust') {
    const patterns = [
      /\b(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)/g,
      /\b(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    ];
    for (const re of patterns) {
      let match;
      while ((match = re.exec(content)) !== null && symbols.size < 18) {
        symbols.add(match[1]);
      }
    }
  } else if (['Java', 'Kotlin', 'C#', 'PHP', 'Ruby', 'Dart'].includes(lang)) {
    const patterns = [
      /\b(?:class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
      /\b(?:fun|def|function)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    ];
    for (const re of patterns) {
      let match;
      while ((match = re.exec(content)) !== null && symbols.size < 18) {
        symbols.add(match[1]);
      }
    }
  }

  return Array.from(symbols);
}

function extractRelativeImports(file, allPathsSet, allPathsList) {
  const connections = new Set();
  const content = file.content || '';
  const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';

  const resolveRelative = (spec) => {
    if (!spec || !spec.startsWith('.')) return null;
    const baseParts = dir ? dir.split('/') : [];
    for (const part of spec.split('/')) {
      if (part === '.' || part === '') continue;
      if (part === '..') baseParts.pop();
      else baseParts.push(part);
    }
    const base = baseParts.join('/');
    if (allPathsSet.has(base)) return base;

    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.py', '.css', '.json', '.vue', '.svelte'];
    for (const ext of extensions) {
      if (allPathsSet.has(`${base}${ext}`)) return `${base}${ext}`;
      if (allPathsSet.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
    }
    return null;
  };

  // JS/TS imports & requires
  const jsImportRe = /(?:import\s+[^'"]*?from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
  let match;
  while ((match = jsImportRe.exec(content)) !== null) {
    const resolved = resolveRelative(match[1]);
    if (resolved && resolved !== file.path) connections.add(resolved);
  }

  // Python relative or dotted module imports
  if (file.language === 'Python') {
    const pyImportRe = /^(?:from\s+([A-Za-z0-9_.]+)\s+import|import\s+([A-Za-z0-9_.]+))/gm;
    while ((match = pyImportRe.exec(content)) !== null) {
      const mod = (match[1] || match[2] || '').replace(/\./g, '/');
      if (!mod) continue;
      const candidate = allPathsList.find(
        (p) => p.endsWith(`${mod}.py`) || p.endsWith(`${mod}/__init__.py`)
      );
      if (candidate && candidate !== file.path) connections.add(candidate);
    }
  }

  return Array.from(connections);
}

function parseDependencies(files) {
  const deps = [];

  for (const file of files) {
    const name = file.path.split('/').pop()?.toLowerCase();
    if (name === 'package.json') {
      try {
        const pkg = JSON.parse(file.content);
        const prod = Object.keys(pkg.dependencies || {});
        const dev = Object.keys(pkg.devDependencies || {});
        if (prod.length || dev.length) {
          deps.push({
            manifest: file.path,
            dependencies: prod.slice(0, 30),
            devDependencies: dev.slice(0, 20),
            scripts: Object.keys(pkg.scripts || {}),
            main: pkg.main || pkg.module || '',
          });
        }
      } catch {
        // Ignore malformed package.json
      }
    } else if (name === 'requirements.txt') {
      const reqs = file.content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split(/[=<>!~[\s]/)[0])
        .filter(Boolean);
      if (reqs.length) {
        deps.push({ manifest: file.path, dependencies: reqs.slice(0, 35) });
      }
    } else if (name === 'pyproject.toml' || name === 'cargo.toml') {
      const pkgs = [];
      const lineRe = /^\s*([A-Za-z0-9_.-]+)\s*=/gm;
      let m;
      while ((m = lineRe.exec(file.content)) !== null && pkgs.length < 30) {
        if (!['name', 'version', 'edition', 'description', 'python', 'license'].includes(m[1])) {
          pkgs.push(m[1]);
        }
      }
      if (pkgs.length) {
        deps.push({ manifest: file.path, dependencies: pkgs });
      }
    } else if (name === 'go.mod') {
      const mods = [];
      const reqRe = /^\s*([a-zA-Z0-9.-]+\/[^\s]+)\s+v/gm;
      let m;
      while ((m = reqRe.exec(file.content)) !== null && mods.length < 30) {
        mods.push(m[1]);
      }
      if (mods.length) {
        deps.push({ manifest: file.path, dependencies: mods });
      }
    }
  }

  return deps;
}

function buildFolderTreeString(paths) {
  const root = {};
  for (const p of paths) {
    const parts = p.split('/');
    let curr = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!curr[part]) {
        curr[part] = i === parts.length - 1 ? null : {};
      }
      if (curr[part] !== null) {
        curr = curr[part];
      }
    }
  }

  const lines = [];
  function walk(node, prefix = '') {
    const keys = Object.keys(node).sort((a, b) => {
      const aDir = node[a] !== null;
      const bDir = node[b] !== null;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.localeCompare(b);
    });
    for (const key of keys) {
      if (lines.length >= 260) {
        lines.push(`${prefix}... (tree truncated in summary)`);
        return;
      }
      const isDir = node[key] !== null;
      lines.push(`${prefix}${key}${isDir ? '/' : ''}`);
      if (isDir) {
        walk(node[key], `${prefix}  `);
      }
    }
  }
  walk(root);
  return lines.join('\n');
}

/**
 * Builds a complete Project Map from fetched repository files.
 */
export function buildProjectMap({ repoInfo, files, excludedStats }) {
  const allPathsList = files.map((f) => f.path);
  const allPathsSet = new Set(allPathsList);

  const langCounts = new Map();
  const categoryCounts = { source: 0, config: 0, test: 0, doc: 0, manifest: 0 };
  const moduleGroups = new Map();
  const entryPoints = new Set();
  const connections = [];
  const enrichedFiles = [];

  const dependencies = parseDependencies(files);
  for (const dep of dependencies) {
    if (dep.main) {
      const cleanMain = dep.main.replace(/^\.\//, '');
      if (allPathsSet.has(cleanMain)) entryPoints.add(cleanMain);
    }
  }

  for (const file of files) {
    categoryCounts[file.category] = (categoryCounts[file.category] || 0) + 1;

    const prevLang = langCounts.get(file.language) || { language: file.language, files: 0, bytes: 0 };
    prevLang.files += 1;
    prevLang.bytes += file.content.length;
    langCounts.set(file.language, prevLang);

    const symbols = extractSymbolsFromContent(file);
    const imports = extractRelativeImports(file, allPathsSet, allPathsList);
    for (const target of imports) {
      connections.push({ from: file.path, to: target });
    }

    const lowerFileName = (file.path.split('/').pop() || '').toLowerCase();
    if (ENTRY_POINT_NAMES.has(lowerFileName) && file.path.split('/').length <= 3) {
      entryPoints.add(file.path);
    }

    const segments = file.path.split('/');
    const moduleKey =
      segments.length >= 3
        ? `${segments[0]}/${segments[1]}`
        : segments.length === 2
          ? segments[0]
          : 'root';

    if (!moduleGroups.has(moduleKey)) {
      moduleGroups.set(moduleKey, []);
    }
    const enriched = {
      ...file,
      moduleKey,
      symbols,
      imports,
    };
    moduleGroups.get(moduleKey).push(enriched);
    enrichedFiles.push(enriched);
  }

  const languages = Array.from(langCounts.values()).sort((a, b) => b.bytes - a.bytes);
  const modules = Array.from(moduleGroups.entries()).map(([name, modFiles]) => ({
    name,
    fileCount: modFiles.length,
    categories: Array.from(new Set(modFiles.map((f) => f.category))),
    files: modFiles.map((f) => f.path),
    keySymbols: modFiles
      .flatMap((f) => f.symbols.map((s) => `${f.path}:${s}`))
      .slice(0, 12),
  }));

  const folderTree = buildFolderTreeString(allPathsList);

  const summaryLines = [
    `Repository: ${repoInfo.fullName} (branch: ${repoInfo.branch})`,
    repoInfo.description ? `Description: ${repoInfo.description}` : '',
    `Files Analyzed: ${files.length} (source: ${categoryCounts.source}, config: ${categoryCounts.config}, test: ${categoryCounts.test}, manifest: ${categoryCounts.manifest}, doc: ${categoryCounts.doc})`,
    `Languages: ${languages.slice(0, 8).map((l) => `${l.language} (${l.files})`).join(', ')}`,
    `Entry Points: ${Array.from(entryPoints).join(', ') || 'None explicitly detected'}`,
    '',
    'Folder Structure:',
    folderTree,
    '',
    'Modules & Key Symbols:',
    ...modules.map(
      (m) =>
        `- ${m.name} (${m.fileCount} files): ${m.files.slice(0, 8).join(', ')}${m.files.length > 8 ? ', ...' : ''}${
          m.keySymbols.length ? ` | Symbols: ${m.keySymbols.slice(0, 6).join(', ')}` : ''
        }`
    ),
  ];

  if (dependencies.length) {
    summaryLines.push('', 'Dependencies & Manifests:');
    for (const d of dependencies) {
      const list = [...(d.dependencies || []), ...(d.devDependencies || []).map((x) => `${x} (dev)`)];
      summaryLines.push(`- ${d.manifest}: ${list.slice(0, 25).join(', ')}`);
      if (d.scripts?.length) {
        summaryLines.push(`  scripts: ${d.scripts.join(', ')}`);
      }
    }
  }

  if (connections.length) {
    summaryLines.push('', 'Internal Component Connections (Sample Imports):');
    for (const edge of connections.slice(0, 45)) {
      summaryLines.push(`- ${edge.from} -> ${edge.to}`);
    }
  }

  return {
    repoInfo,
    totalFiles: files.length,
    totalChars: files.reduce((sum, f) => sum + f.content.length, 0),
    excludedStats,
    languages,
    categoryCounts,
    entryPoints: Array.from(entryPoints),
    modules,
    dependencies,
    connections,
    folderTree,
    files: enrichedFiles,
    summaryText: summaryLines.filter((l) => l !== undefined).join('\n'),
  };
}

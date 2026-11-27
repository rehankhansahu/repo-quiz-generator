import { describe, expect, it } from 'vitest';
import { parseGitHubRepoUrl } from '../services/githubUrl.js';
import { evaluateTreeEntry, filterRepositoryTree } from '../services/fileFilter.js';
import { buildProjectMap } from '../services/projectMapper.js';
import { buildModuleChunks, getCodeSnippetQuota, validateQuizQuestions } from '../services/quizPipeline.js';
import {
  appendRepoQuestionHistory,
  getRepoQuestionHistory,
  getStoredGeminiKey,
  removeGeminiKey,
  saveGeminiKey,
  saveLanguage,
  getStoredLanguage,
  saveTheme,
  getStoredTheme,
} from '../utils/storage.js';

describe('parseGitHubRepoUrl', () => {
  it('parses standard GitHub HTTPS URLs, .git suffix, and tree branches', () => {
    expect(parseGitHubRepoUrl('https://github.com/facebook/react')).toMatchObject({
      owner: 'facebook',
      repo: 'react',
      branch: '',
      fullName: 'facebook/react',
    });

    expect(parseGitHubRepoUrl('https://github.com/vitejs/vite.git')).toMatchObject({
      owner: 'vitejs',
      repo: 'vite',
      fullName: 'vitejs/vite',
    });

    expect(parseGitHubRepoUrl('https://github.com/owner/repo/tree/feature/v2')).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      branch: 'feature/v2',
    });

    expect(parseGitHubRepoUrl('owner/repo@dev')).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      branch: 'dev',
    });
  });

  it('rejects non-GitHub or malformed URLs', () => {
    expect(() => parseGitHubRepoUrl('https://gitlab.com/a/b')).toThrow();
    expect(() => parseGitHubRepoUrl('https://github.com/only-owner')).toThrow();
    expect(() => parseGitHubRepoUrl('')).toThrow();
  });
});

describe('fileFilter', () => {
  it('includes source, config, manifest, test, doc files and excludes junk', () => {
    const entries = [
      { path: 'src/index.js', type: 'blob', size: 1200, sha: '1' },
      { path: 'package.json', type: 'blob', size: 500, sha: '2' },
      { path: 'Dockerfile', type: 'blob', size: 400, sha: '3' },
      { path: '.github/workflows/deploy.yml', type: 'blob', size: 600, sha: '4' },
      { path: 'tests/app.test.js', type: 'blob', size: 900, sha: '5' },
      { path: 'README.md', type: 'blob', size: 1500, sha: '6' },
      { path: 'node_modules/lodash/index.js', type: 'blob', size: 800, sha: '7' },
      { path: 'dist/bundle.js', type: 'blob', size: 2000, sha: '8' },
      { path: '.git/HEAD', type: 'blob', size: 20, sha: '9' },
      { path: 'package-lock.json', type: 'blob', size: 50000, sha: '10' },
      { path: 'assets/logo.png', type: 'blob', size: 12000, sha: '11' },
      { path: 'public/app.min.js', type: 'blob', size: 3000, sha: '12' },
      { path: 'src/huge.generated.ts', type: 'blob', size: 1000, sha: '13' },
      { path: 'src/big.json', type: 'blob', size: 250 * 1024, sha: '14' },
    ];

    const result = filterRepositoryTree(entries);
    const paths = result.selectedFiles.map((f) => f.path);

    expect(paths).toEqual([
      'src/index.js',
      'package.json',
      'Dockerfile',
      '.github/workflows/deploy.yml',
      'tests/app.test.js',
      'README.md',
    ]);
    expect(result.excludedStats.totalSkipped).toBe(8);
    expect(evaluateTreeEntry({ path: 'fonts/inter.woff2', type: 'blob', size: 100 }).include).toBe(false);
  });
});

describe('projectMapper', () => {
  it('builds a project map with languages, entry points, symbols, dependencies, and connections', () => {
    const files = [
      {
        path: 'package.json',
        category: 'manifest',
        language: 'JSON',
        content: JSON.stringify({
          name: 'demo-app',
          main: 'src/index.js',
          dependencies: { express: '^4.19.0' },
          scripts: { start: 'node src/index.js' },
        }),
      },
      {
        path: 'src/index.js',
        category: 'source',
        language: 'JavaScript',
        content: `import { verifyAuth } from './auth/guard.js';\nexport function startServer() { return verifyAuth(); }`,
      },
      {
        path: 'src/auth/guard.js',
        category: 'source',
        language: 'JavaScript',
        content: `export function verifyAuth() { return true; }`,
      },
    ];

    const map = buildProjectMap({
      repoInfo: { fullName: 'demo/app', branch: 'main', description: 'Demo' },
      files,
      excludedStats: { totalSkipped: 0 },
    });

    expect(map.entryPoints).toContain('src/index.js');
    expect(map.dependencies[0].dependencies).toContain('express');
    expect(map.connections).toEqual([{ from: 'src/index.js', to: 'src/auth/guard.js' }]);
    expect(map.files[1].symbols).toContain('startServer');
    expect(map.summaryText).toContain('src/index.js -> src/auth/guard.js');
  });
});

describe('quizPipeline validation & chunking', () => {
  const validFiles = [
    { path: 'src/auth.js', moduleKey: 'src', category: 'source', language: 'JavaScript', content: 'export const a = 1;' },
    { path: 'src/api.js', moduleKey: 'src', category: 'source', language: 'JavaScript', content: 'export const b = 2;' },
    { path: 'package.json', moduleKey: 'root', category: 'manifest', language: 'JSON', content: '{}' },
    { path: 'README.md', moduleKey: 'root', category: 'doc', language: 'Markdown', content: '# Demo' },
  ];

  it('rejects ungrounded files, filler options, duplicates, and non-Roman Hinglish script', () => {
    const rawQuestions = [
      {
        id: '1',
        difficulty: 'Easy',
        question: 'Fake file question?',
        options: { A: '1', B: '2', C: '3', D: '4' },
        correctAnswer: 'A',
        explanation: 'Bad source',
        sourceFile: 'src/does-not-exist.js',
      },
      {
        id: '2',
        difficulty: 'Easy',
        question: 'Filler option question?',
        options: { A: 'Opt 1', B: 'Opt 2', C: 'Opt 3', D: 'All of the above' },
        correctAnswer: 'D',
        explanation: 'Has filler',
        sourceFile: 'src/auth.js',
      },
      {
        id: '3',
        difficulty: 'Easy',
        question: 'इस function में कौन सा parameter है?',
        options: { A: 'token', B: 'id', C: 'key', D: 'url' },
        correctAnswer: 'A',
        explanation: 'Devanagari script should be rejected in Hinglish mode',
        sourceFile: 'src/auth.js',
      },
      {
        id: '4',
        difficulty: 'Easy',
        question: 'Is function verifyAuth me kon sa parameter required hai?',
        options: { A: 'token', B: 'userId', C: 'secretKey', D: 'timeout' },
        correctAnswer: 'A',
        explanation: 'verifyAuth function token parameter check krta hai.',
        sourceFile: 'src/auth.js (verifyAuth)',
      },
    ];

    const res = validateQuizQuestions({
      rawQuestions,
      remainingCounts: { Easy: 1, Medium: 0, Hard: 0 },
      validFiles,
      language: 'hinglish',
    });

    expect(res.accepted).toHaveLength(1);
    expect(res.accepted[0].sourceFile).toBe('src/auth.js (verifyAuth)');
    expect(res.remainingCounts).toEqual({ Easy: 0, Medium: 0, Hard: 0 });
  });

  it('splits large file lists into bounded module chunks', () => {
    const bigFiles = Array.from({ length: 6 }, (_, i) => ({
      path: `src/mod${i}/file.js`,
      moduleKey: `src/mod${i}`,
      category: 'source',
      language: 'JavaScript',
      content: 'x'.repeat(400),
    }));
    const chunks = buildModuleChunks(bigFiles, 900);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.reduce((sum, c) => sum + c.files.length, 0)).toBe(6);
  });

  it('caps code snippets to 1 for small quizzes and a few for larger quizzes', () => {
    expect(getCodeSnippetQuota(3)).toBe(1);
    expect(getCodeSnippetQuota(5)).toBe(1);
    expect(getCodeSnippetQuota(12)).toBe(3);
    expect(getCodeSnippetQuota(20)).toBe(4);
  });

  it('filters out repeated previousQuestions and excess code snippets', () => {
    const res = validateQuizQuestions({
      rawQuestions: [
        {
          id: '1',
          difficulty: 'Easy',
          question: 'What does verifyAuth return in src/auth.js?',
          codeSnippet: 'export const a = 1;',
          options: { A: 'true', B: 'false', C: 'null', D: '0' },
          correctAnswer: 'A',
          explanation: 'Returns true.',
          sourceFile: 'src/auth.js',
        },
        {
          id: '2',
          difficulty: 'Medium',
          question: 'How does src/api.js export b?',
          codeSnippet: 'export const b = 2;',
          options: { A: 'named', B: 'default', C: 'cjs', D: 'none' },
          correctAnswer: 'A',
          explanation: 'Named export.',
          sourceFile: 'src/api.js',
        },
      ],
      remainingCounts: { Easy: 1, Medium: 1, Hard: 0 },
      validFiles,
      language: 'en',
      previousQuestions: [{ question: 'What does verifyAuth return in src/auth.js?' }],
      maxCodeSnippets: 1,
    });

    expect(res.accepted).toHaveLength(1);
    expect(res.accepted[0].sourceFile).toBe('src/api.js');
  });
});

describe('storage helpers', () => {
  it('persists and removes Gemini key, theme, language, and repo question history', () => {
    window.localStorage.clear();
    expect(getStoredGeminiKey()).toBe('');
    saveGeminiKey('AIzaTestKey123');
    expect(getStoredGeminiKey()).toBe('AIzaTestKey123');
    removeGeminiKey();
    expect(getStoredGeminiKey()).toBe('');

    saveTheme('dark');
    expect(getStoredTheme()).toBe('dark');
    saveLanguage('hinglish');
    expect(getStoredLanguage()).toBe('hinglish');

    appendRepoQuestionHistory('owner/repo', [{ question: 'Q1?', sourceFile: 'src/a.js' }]);
    expect(getRepoQuestionHistory('owner/repo')).toHaveLength(1);
  });
});

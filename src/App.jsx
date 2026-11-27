import { useEffect, useRef, useState } from 'react';
import { Header } from './components/Header.jsx';
import { Stepper, STEP_ORDER } from './components/Stepper.jsx';
import { SettingsStep } from './components/SettingsStep.jsx';
import { RepoStep } from './components/RepoStep.jsx';
import { ModeStep } from './components/ModeStep.jsx';
import { LanguageStep } from './components/LanguageStep.jsx';
import { GenerateStep } from './components/GenerateStep.jsx';
import { QuizStep } from './components/QuizStep.jsx';
import { ResultsStep } from './components/ResultsStep.jsx';

import {
  appendRepoQuestionHistory,
  getInitialTheme,
  getRepoQuestionHistory,
  getStoredGeminiKey,
  getStoredGeminiModel,
  getStoredLanguage,
  removeGeminiKey,
  saveGeminiKey,
  saveGeminiModel,
  saveLanguage,
  saveTheme,
} from './utils/storage.js';
import { getFriendlyErrorMessage, AppError, ERROR_CODES } from './utils/errors.js';
import { t } from './utils/i18n.js';
import { parseGitHubRepoUrl } from './services/githubUrl.js';
import { filterRepositoryTree } from './services/fileFilter.js';
import { fetchRepoMetadata, fetchRepoTree, fetchRepositoryFiles } from './services/githubApi.js';
import { buildProjectMap } from './services/projectMapper.js';
import { generateRepoQuiz } from './services/quizPipeline.js';

export function App() {
  // Persistent user settings loaded from localStorage on startup
  const [geminiKey, setGeminiKey] = useState(() => getStoredGeminiKey());
  const [selectedModel, setSelectedModel] = useState(() => getStoredGeminiModel());
  const [theme, setTheme] = useState(() => getInitialTheme());
  const [language, setLanguage] = useState(() => getStoredLanguage());

  // Automatically skip Settings on return visits when a Gemini key is already saved
  const [currentStep, setCurrentStep] = useState(() =>
    getStoredGeminiKey() ? 'repo' : 'settings'
  );

  // Quiz configuration state
  const [repoUrl, setRepoUrl] = useState('');
  const [mode, setMode] = useState('quick');
  const [customTotal, setCustomTotal] = useState(5);
  const [customCounts, setCustomCounts] = useState({ Easy: 2, Medium: 2, Hard: 1 });

  // Pipeline state
  const [isRunning, setIsRunning] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [projectMap, setProjectMap] = useState(null);
  const [progress, setProgress] = useState({
    stage: 'idle',
    filesFetched: 0,
    filesTotal: 0,
    currentPath: '',
    chunksDone: 0,
    chunksTotal: 0,
  });

  // Active Quiz state
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState('');
  const [submittedAnswers, setSubmittedAnswers] = useState({});

  const abortRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    saveTheme(next);
  };

  const handleSelectLanguage = (nextLang) => {
    setLanguage(nextLang);
    saveLanguage(nextLang);
  };

  const handleSaveGeminiKey = (key) => {
    saveGeminiKey(key);
    setGeminiKey(key);
  };

  const handleRemoveGeminiKey = () => {
    removeGeminiKey();
    setGeminiKey('');
  };

  const handleSelectModel = (modelId) => {
    saveGeminiModel(modelId);
    setSelectedModel(modelId);
  };

  const getDesiredCounts = () => {
    if (mode === 'quick') {
      return { Easy: 1, Medium: 1, Hard: 1 };
    }
    return {
      Easy: Number(customCounts.Easy) || 0,
      Medium: Number(customCounts.Medium) || 0,
      Hard: Number(customCounts.Hard) || 0,
    };
  };

  const startGeneration = async () => {
    if (!geminiKey) {
      setCurrentStep('settings');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setCurrentStep('generate');
    setIsRunning(true);
    setGenerationError('');
    setProjectMap(null);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedOption('');
    setSubmittedAnswers({});
    setProgress({
      stage: 'tree',
      filesFetched: 0,
      filesTotal: 0,
      currentPath: '',
      chunksDone: 0,
      chunksTotal: 0,
    });

    try {
      const parsedRepo = parseGitHubRepoUrl(repoUrl);
      const meta = await fetchRepoMetadata({
        owner: parsedRepo.owner,
        repo: parsedRepo.repo,
        signal: controller.signal,
      });

      const resolvedBranch = parsedRepo.branch || meta.default_branch || 'main';
      const rawTree = await fetchRepoTree({
        owner: parsedRepo.owner,
        repo: parsedRepo.repo,
        branch: resolvedBranch,
        signal: controller.signal,
      });

      setProgress((prev) => ({ ...prev, stage: 'filtering' }));
      const filtered = filterRepositoryTree(rawTree);
      if (filtered.selectedFiles.length === 0) {
        throw new AppError(ERROR_CODES.EMPTY_REPO, 'No readable code/config/doc files found.');
      }

      setProgress((prev) => ({
        ...prev,
        stage: 'fetching',
        filesFetched: 0,
        filesTotal: filtered.selectedFiles.length,
      }));

      const downloaded = await fetchRepositoryFiles({
        owner: parsedRepo.owner,
        repo: parsedRepo.repo,
        branch: resolvedBranch,
        files: filtered.selectedFiles,
        isPrivate: Boolean(meta.private),
        onProgress: ({ fetched, total, currentPath }) => {
          setProgress((prev) => ({
            ...prev,
            stage: 'fetching',
            filesFetched: fetched,
            filesTotal: total,
            currentPath,
          }));
        },
        signal: controller.signal,
      });

      if (downloaded.files.length === 0) {
        throw new AppError(ERROR_CODES.EMPTY_REPO, 'Could not download readable files from repository.');
      }

      setProgress((prev) => ({ ...prev, stage: 'mapping' }));
      const builtMap = buildProjectMap({
        repoInfo: {
          ...parsedRepo,
          branch: resolvedBranch,
          description: meta.description || '',
          private: Boolean(meta.private),
        },
        files: downloaded.files,
        excludedStats: filtered.excludedStats,
      });
      setProjectMap(builtMap);

      const previousQuestions = getRepoQuestionHistory(builtMap.repoInfo.fullName);

      const quizResult = await generateRepoQuiz({
        apiKey: geminiKey,
        preferredModel: selectedModel,
        projectMap: builtMap,
        counts: getDesiredCounts(),
        language,
        previousQuestions,
        onStageChange: (update) => {
          setProgress((prev) => ({
            ...prev,
            stage: update.stage,
            chunksDone: update.chunksDone ?? prev.chunksDone,
            chunksTotal: update.chunksTotal ?? prev.chunksTotal,
          }));
        },
        signal: controller.signal,
      });

      appendRepoQuestionHistory(builtMap.repoInfo.fullName, quizResult.questions);
      setQuestions(quizResult.questions);
      setIsRunning(false);
      setCurrentStep('quiz');
    } catch (err) {
      setIsRunning(false);
      if (err?.code === ERROR_CODES.ABORTED || err?.name === 'AbortError') {
        setGenerationError(t(language, 'generate.cancelledMsg'));
      } else {
        setGenerationError(getFriendlyErrorMessage(err, language));
      }
    }
  };

  const handleCancelGeneration = () => {
    abortRef.current?.abort();
  };

  const handleSubmitAnswer = () => {
    const q = questions[currentQuestionIndex];
    if (!q || !selectedOption) return;
    setSubmittedAnswers((prev) => ({
      ...prev,
      [q.id]: selectedOption,
    }));
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      const nextIdx = currentQuestionIndex + 1;
      const nextQ = questions[nextIdx];
      setCurrentQuestionIndex(nextIdx);
      setSelectedOption(submittedAnswers[nextQ?.id] || '');
    } else {
      setCurrentStep('results');
    }
  };

  const handleRetakeQuiz = () => {
    setSubmittedAnswers({});
    setSelectedOption('');
    setCurrentQuestionIndex(0);
    setCurrentStep('quiz');
  };

  const handleGenerateNewQuiz = () => {
    setQuestions([]);
    setSubmittedAnswers({});
    setSelectedOption('');
    setCurrentQuestionIndex(0);
    setCurrentStep('repo');
  };

  const maxReachableIndex = (() => {
    if (questions.length > 0 && Object.keys(submittedAnswers).length === questions.length) {
      return STEP_ORDER.indexOf('results');
    }
    if (questions.length > 0) return STEP_ORDER.indexOf('quiz');
    if (geminiKey && repoUrl.trim()) return STEP_ORDER.indexOf('language');
    if (geminiKey) return STEP_ORDER.indexOf('repo');
    return STEP_ORDER.indexOf('settings');
  })();

  return (
    <div className="app-shell">
      <Header
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenSettings={() => {
          if (!isRunning) setCurrentStep('settings');
        }}
        onLogoClick={() => {
          if (!isRunning) setCurrentStep(geminiKey ? 'repo' : 'settings');
        }}
      />

      <main className="app-main">
        <div className="container">
          <Stepper
            currentStep={currentStep}
            maxReachableIndex={maxReachableIndex}
            onSelectStep={(step) => {
              if (!isRunning) setCurrentStep(step);
            }}
            language="en"
          />

          {currentStep === 'settings' && (
            <SettingsStep
              language="en"
              geminiKey={geminiKey}
              selectedModel={selectedModel}
              onSaveGeminiKey={handleSaveGeminiKey}
              onRemoveGeminiKey={handleRemoveGeminiKey}
              onSelectModel={handleSelectModel}
              onContinue={() => setCurrentStep('repo')}
            />
          )}

          {currentStep === 'repo' && (
            <RepoStep
              language="en"
              repoUrl={repoUrl}
              onChangeRepoUrl={setRepoUrl}
              onBack={() => setCurrentStep('settings')}
              onContinue={() => setCurrentStep('mode')}
            />
          )}

          {currentStep === 'mode' && (
            <ModeStep
              language="en"
              mode={mode}
              customTotal={customTotal}
              customCounts={customCounts}
              onSelectMode={setMode}
              onChangeCustomTotal={setCustomTotal}
              onChangeCustomCounts={setCustomCounts}
              onBack={() => setCurrentStep('repo')}
              onContinue={() => setCurrentStep('language')}
            />
          )}

          {currentStep === 'language' && (
            <LanguageStep
              language={language}
              onSelectLanguage={handleSelectLanguage}
              onBack={() => setCurrentStep('mode')}
              onGenerate={startGeneration}
            />
          )}

          {currentStep === 'generate' && (
            <GenerateStep
              language={language}
              progress={progress}
              error={generationError}
              isRunning={isRunning}
              onCancel={handleCancelGeneration}
              onRetry={startGeneration}
              onGoSettings={() => setCurrentStep('settings')}
              onGoRepo={() => setCurrentStep('repo')}
            />
          )}

          {currentStep === 'quiz' && (
            <QuizStep
              language={language}
              questions={questions}
              currentIndex={currentQuestionIndex}
              selectedOption={selectedOption}
              submittedAnswers={submittedAnswers}
              onSelectOption={setSelectedOption}
              onSubmitAnswer={handleSubmitAnswer}
              onNext={handleNextQuestion}
              onExitQuiz={handleGenerateNewQuiz}
            />
          )}

          {currentStep === 'results' && (
            <ResultsStep
              language={language}
              repoFullName={projectMap?.repoInfo?.fullName || repoUrl}
              repoUrl={projectMap?.repoInfo?.canonicalUrl || repoUrl}
              questions={questions}
              submittedAnswers={submittedAnswers}
              onRetakeQuiz={handleRetakeQuiz}
              onGenerateNewQuiz={handleGenerateNewQuiz}
            />
          )}
        </div>
      </main>

      <footer className="app-footer">
        <div className="container">
          Developed by{' '}
          <a
            href="https://rehankhansahu.github.io/muhammad-rehan-portfolio/"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            Muhammad Rehan
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;

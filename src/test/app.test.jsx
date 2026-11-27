import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../App.jsx';
import { QuizStep } from '../components/QuizStep.jsx';
import { ResultsStep } from '../components/ResultsStep.jsx';
import { STORAGE_KEYS } from '../utils/storage.js';

describe('App persistence and flow', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.className = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prompts for Gemini key on first visit and persists it with show/hide, update, and remove', () => {
    render(<App />);
    expect(screen.getByText('API Key Settings')).toBeInTheDocument();

    const input = screen.getByLabelText(/Google Gemini API Key/i);
    expect(input).toHaveAttribute('type', 'password');

    // Show/hide toggle
    const showBtns = screen.getAllByRole('button', { name: /Show/i });
    fireEvent.click(showBtns[0]);
    expect(input).toHaveAttribute('type', 'text');

    fireEvent.change(input, { target: { value: 'AIzaMySecretKey' } });
    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    expect(window.localStorage.getItem(STORAGE_KEYS.GEMINI_KEY)).toBe('AIzaMySecretKey');
    expect(screen.getByText('Select GitHub Repository')).toBeInTheDocument();
  });

  it('automatically skips Settings on subsequent visits when Gemini key exists', () => {
    window.localStorage.setItem(STORAGE_KEYS.GEMINI_KEY, 'AIzaExistingKey');
    render(<App />);
    expect(screen.getByText('Select GitHub Repository')).toBeInTheDocument();

    // Open Settings to verify Update Key & Remove Key buttons exist
    fireEvent.click(screen.getByRole('button', { name: /API Key/i }));
    expect(screen.getByRole('button', { name: /Update Key/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove Key/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Remove Key/i }));
    expect(window.localStorage.getItem(STORAGE_KEYS.GEMINI_KEY)).toBeNull();
  });

  it('validates Custom Quiz total vs Easy + Medium + Hard live counter', () => {
    window.localStorage.setItem(STORAGE_KEYS.GEMINI_KEY, 'AIzaExistingKey');
    render(<App />);

    fireEvent.change(document.getElementById('repo-url-input'), {
      target: { value: 'https://github.com/sindresorhus/ky' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Next: Choose Quiz Mode/i }));

    fireEvent.click(screen.getByRole('button', { name: /Custom Quiz/i }));
    const nextBtn = screen.getByRole('button', { name: /Next: Select Language/i });
    expect(nextBtn).toBeEnabled(); // defaults 5 = 2 + 2 + 1

    fireEvent.change(document.getElementById('custom-easy-input'), { target: { value: '1' } });
    expect(screen.getByText('4 / 5 assigned')).toBeInTheDocument();
    expect(nextBtn).toBeDisabled();

    fireEvent.change(document.getElementById('custom-hard-input'), { target: { value: '2' } });
    expect(screen.getByText('5 / 5 assigned')).toBeInTheDocument();
    expect(nextBtn).toBeEnabled();
  });

  it('switches themes and selects Roman Urdu in Language step while keeping setup English', () => {
    window.localStorage.setItem(STORAGE_KEYS.GEMINI_KEY, 'AIzaExistingKey');
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Toggle theme/i }));
    expect(window.localStorage.getItem(STORAGE_KEYS.THEME)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    fireEvent.change(document.getElementById('repo-url-input'), {
      target: { value: 'https://github.com/sindresorhus/ky' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Next: Choose Quiz Mode/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next: Select Language/i }));

    fireEvent.click(screen.getByRole('button', { name: /Roman Urdu/i }));
    expect(window.localStorage.getItem(STORAGE_KEYS.LANGUAGE)).toBe('hinglish');
    expect(screen.getByText('Select Quiz Language')).toBeInTheDocument();
  });

  it('saves optional GitHub token, fetches private repos, and selects one for the quiz', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => [
        {
          id: 101,
          name: 'secret-app',
          full_name: 'rehan/secret-app',
          html_url: 'https://github.com/rehan/secret-app',
          description: 'Private service',
          language: 'TypeScript',
          default_branch: 'main',
          updated_at: '2026-11-27T00:00:00Z',
          private: true,
        },
        {
          id: 102,
          name: 'secret-api',
          full_name: 'rehan/secret-api',
          html_url: 'https://github.com/rehan/secret-api',
          description: '',
          language: 'JavaScript',
          default_branch: 'main',
          updated_at: '2026-11-26T00:00:00Z',
          private: true,
        },
      ],
    });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/Google Gemini API Key/i), {
      target: { value: 'AIzaTestGeminiKey' },
    });
    fireEvent.change(screen.getByLabelText(/GitHub Personal Access Token/i), {
      target: { value: 'ghp_testPrivateToken' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }));

    expect(window.localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN)).toBe('ghp_testPrivateToken');

    await waitFor(() => {
      expect(screen.getByText('2 found')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/user/repos?visibility=private'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer ghp_testPrivateToken',
        }),
      })
    );

    const select = screen.getByLabelText(/Your Private Repositories/i);
    fireEvent.change(select, { target: { value: 'https://github.com/rehan/secret-app' } });
    expect(document.getElementById('repo-url-input')).toHaveValue('https://github.com/rehan/secret-app');

    fireEvent.click(screen.getByRole('button', { name: /Next: Choose Quiz Mode/i }));
    expect(screen.getByText('Choose Quiz Mode')).toBeInTheDocument();
  });
});

describe('QuizStep and ResultsStep', () => {
  const sampleQuestions = [
    {
      id: 'q1',
      difficulty: 'Easy',
      question: 'What port does server.js listen on?',
      options: { A: '3000', B: '8080', C: '4000', D: '5173' },
      correctAnswer: 'A',
      explanation: 'server.js sets PORT || 3000.',
      sourceFile: 'src/server.js (startServer)',
    },
  ];

  it('shows immediate feedback, explanation, and source file on submit', () => {
    let chosen = '';
    const { rerender } = render(
      <QuizStep
        language="en"
        questions={sampleQuestions}
        currentIndex={0}
        selectedOption={chosen}
        submittedAnswers={{}}
        onSelectOption={(opt) => {
          chosen = opt;
        }}
        onSubmitAnswer={() => {}}
        onNext={() => {}}
        onExitQuiz={() => {}}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Submit Answer/i });
    expect(submitBtn).toBeDisabled();

    rerender(
      <QuizStep
        language="en"
        questions={sampleQuestions}
        currentIndex={0}
        selectedOption="A"
        submittedAnswers={{ q1: 'A' }}
        onSelectOption={() => {}}
        onSubmitAnswer={() => {}}
        onNext={() => {}}
        onExitQuiz={() => {}}
      />
    );

    expect(screen.getByText('Correct!')).toBeInTheDocument();
    expect(screen.getByText(/server\.js sets PORT \|\| 3000/)).toBeInTheDocument();
    expect(screen.getByText(/src\/server\.js \(startServer\)/)).toBeInTheDocument();
  });

  it('renders score, difficulty breakdown, review, Retake Quiz, Generate New Quiz, and Download Result buttons', () => {
    render(
      <ResultsStep
        language="en"
        repoFullName="demo/repo"
        repoUrl="https://github.com/demo/repo"
        questions={sampleQuestions}
        submittedAnswers={{ q1: 'A' }}
        onRetakeQuiz={() => {}}
        onGenerateNewQuiz={() => {}}
      />
    );

    expect(screen.getAllByText('1 / 1')).toHaveLength(2);
    expect(screen.getByText('100% Accuracy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retake Quiz/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate New Quiz/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download Result/i })).toBeInTheDocument();
  });
});

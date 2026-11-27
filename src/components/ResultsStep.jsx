import { CheckCircle2, Download, FileCode2, RotateCcw, Sparkles, Trophy, XCircle } from 'lucide-react';
import { t } from '../utils/i18n.js';

const LEVELS = ['Easy', 'Medium', 'Hard'];

export function buildResultReportText({
  repoFullName,
  repoUrl,
  language,
  questions,
  submittedAnswers,
}) {
  const total = questions.length;
  const correctTotal = questions.filter((q) => submittedAnswers[q.id] === q.correctAnswer).length;
  const percentage = total > 0 ? Math.round((correctTotal / total) * 100) : 0;
  const resolvedUrl =
    repoUrl && repoUrl.startsWith('http')
      ? repoUrl
      : repoFullName && repoFullName.includes('/')
        ? `https://github.com/${repoFullName}`
        : repoUrl || '';

  const lines = [
    '============================================================',
    'REPO QUIZ GENERATOR - QUIZ RESULT',
    '============================================================',
    `Repository     : ${repoFullName || 'N/A'}`,
    `Repository URL : ${resolvedUrl || 'N/A'}`,
    `Language       : ${language === 'hinglish' ? 'Roman Urdu' : 'English'}`,
    `Generated At   : ${new Date().toLocaleString()}`,
    `Final Score    : ${correctTotal} / ${total} (${percentage}%)`,
    '',
    'Breakdown by Difficulty:',
  ];

  for (const level of LEVELS) {
    const items = questions.filter((q) => q.difficulty === level);
    const right = items.filter((q) => submittedAnswers[q.id] === q.correctAnswer).length;
    lines.push(`- ${level}: ${items.length > 0 ? `${right} / ${items.length}` : '0 questions'}`);
  }

  lines.push('', '------------------------------------------------------------', 'QUESTION-BY-QUESTION REVIEW', '------------------------------------------------------------');

  questions.forEach((q, idx) => {
    const userChoice = submittedAnswers[q.id];
    const isCorrect = userChoice === q.correctAnswer;
    lines.push('');
    lines.push(`Q${idx + 1}. [${q.difficulty}] ${q.question}`);
    if (q.codeSnippet) {
      lines.push('Code:');
      lines.push(q.codeSnippet);
    }
    for (const key of ['A', 'B', 'C', 'D']) {
      lines.push(`  ${key}. ${q.options?.[key] || ''}`);
    }
    lines.push(
      `Your Answer    : ${userChoice ? `${userChoice}. ${q.options?.[userChoice] || ''}` : 'Not answered'} (${isCorrect ? 'Correct' : 'Incorrect'})`
    );
    lines.push(`Correct Answer : ${q.correctAnswer}. ${q.options?.[q.correctAnswer] || ''}`);
    lines.push(`Explanation    : ${q.explanation}`);
    lines.push(`Source File    : ${q.sourceFile}`);
  });

  lines.push(
    '',
    '============================================================',
    'Developed by Muhammad Rehan - https://rehankhansahu.github.io/muhammad-rehan-portfolio/',
    '============================================================'
  );

  return lines.join('\n');
}

export function ResultsStep({
  language,
  repoFullName,
  repoUrl,
  questions,
  submittedAnswers,
  onRetakeQuiz,
  onGenerateNewQuiz,
}) {
  const total = questions.length;
  const correctTotal = questions.filter((q) => submittedAnswers[q.id] === q.correctAnswer).length;
  const percentage = total > 0 ? Math.round((correctTotal / total) * 100) : 0;

  const breakdown = LEVELS.map((level) => {
    const items = questions.filter((q) => q.difficulty === level);
    const right = items.filter((q) => submittedAnswers[q.id] === q.correctAnswer).length;
    return {
      level,
      total: items.length,
      correct: right,
    };
  });

  const handleDownloadResult = () => {
    const report = buildResultReportText({
      repoFullName,
      repoUrl,
      language,
      questions,
      submittedAnswers,
    });
    const slug = (repoFullName || 'repo').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '');
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug || 'repo'}-quiz-result.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="card">
      <div className="section-stack">
        <div className="score-hero">
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', opacity: 0.9, fontSize: '0.9rem', fontWeight: 600 }}>
              <Trophy size={18} />
              <span>{t(language, 'results.title')}</span>
            </div>
            <h2 style={{ margin: '6px 0 4px', fontSize: '1.3rem', fontWeight: 700 }}>
              {t(language, 'results.subtitle', { repo: repoFullName || 'Repository' })}
            </h2>
            <div style={{ opacity: 0.9, fontSize: '0.92rem' }}>
              {t(language, 'results.percentageLabel', { pct: percentage })}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.85 }}>
              {t(language, 'results.scoreLabel')}
            </div>
            <div className="score-number">
              {correctTotal} / {total}
            </div>
          </div>
        </div>

        {/* Breakdown by Difficulty */}
        <div className="field-group">
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
            {t(language, 'results.breakdownTitle')}
          </h3>
          <div className="difficulty-grid">
            {breakdown.map((b) => {
              const badgeClass =
                b.level === 'Easy'
                  ? 'badge-easy'
                  : b.level === 'Medium'
                    ? 'badge-medium'
                    : 'badge-hard';
              return (
                <div key={b.level} className="stat-tile">
                  <div style={{ marginBottom: '6px' }}>
                    <span className={`badge ${badgeClass}`}>
                      {t(language, `quiz.difficulty.${b.level}`)}
                    </span>
                  </div>
                  <div className="stat-value">
                    {b.total > 0 ? `${b.correct} / ${b.total}` : t(language, 'results.noQuestions')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="chip-list" style={{ gap: '10px' }}>
          <button type="button" className="btn btn-secondary" onClick={onRetakeQuiz}>
            <RotateCcw size={16} />
            <span>{t(language, 'results.retakeBtn')}</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={onGenerateNewQuiz}>
            <Sparkles size={16} />
            <span>{t(language, 'results.newQuizBtn')}</span>
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleDownloadResult}>
            <Download size={16} />
            <span>{t(language, 'results.downloadBtn')}</span>
          </button>
        </div>

        {/* Full Review */}
        <div className="section-stack" style={{ gap: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
            {t(language, 'results.reviewTitle')}
          </h3>

          {questions.map((q, idx) => {
            const userChoice = submittedAnswers[q.id];
            const isCorrect = userChoice === q.correctAnswer;
            const diffBadge =
              q.difficulty === 'Easy'
                ? 'badge-easy'
                : q.difficulty === 'Medium'
                  ? 'badge-medium'
                  : 'badge-hard';

            return (
              <article key={q.id} className="review-item">
                <div className="row-between">
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <span className="badge badge-neutral">#{idx + 1}</span>
                    <span className={`badge ${diffBadge}`}>
                      {t(language, `quiz.difficulty.${q.difficulty}`)}
                    </span>
                  </div>
                  <span className={`badge ${isCorrect ? 'badge-easy' : 'badge-hard'}`}>
                    {isCorrect ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                    <span>
                      {isCorrect ? t(language, 'results.statusCorrect') : t(language, 'results.statusIncorrect')}
                    </span>
                  </span>
                </div>

                <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>{q.question}</div>

                {q.codeSnippet && (
                  <pre className="code-snippet-block">
                    <code>{q.codeSnippet}</code>
                  </pre>
                )}

                <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', display: 'grid', gap: '4px' }}>
                  <div>
                    <strong>{t(language, 'results.yourAnswer')}:</strong>{' '}
                    <span style={{ color: isCorrect ? 'var(--success-text)' : 'var(--danger-text)', fontWeight: 600 }}>
                      {userChoice ? `${userChoice}. ${q.options?.[userChoice]}` : '—'}
                    </span>
                  </div>
                  {!isCorrect && (
                    <div>
                      <strong>{t(language, 'results.correctAnswer')}:</strong>{' '}
                      <span style={{ color: 'var(--success-text)', fontWeight: 600 }}>
                        {q.correctAnswer}. {q.options?.[q.correctAnswer]}
                      </span>
                    </div>
                  )}
                  <div>
                    <strong>{t(language, 'results.explanation')}:</strong> {q.explanation}
                  </div>
                </div>

                <div>
                  <span className="source-pill">
                    <FileCode2 size={14} />
                    <span>
                      {t(language, 'results.sourceFile')}: {q.sourceFile}
                    </span>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

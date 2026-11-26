import { CheckCircle2, FileCode2, RotateCcw, Sparkles, Trophy, XCircle } from 'lucide-react';
import { t } from '../utils/i18n.js';

const LEVELS = ['Easy', 'Medium', 'Hard'];

export function ResultsStep({
  language,
  repoFullName,
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

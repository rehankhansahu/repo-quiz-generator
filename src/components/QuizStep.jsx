import { ArrowRight, CheckCircle2, FileCode2, FolderGit2, XCircle } from 'lucide-react';
import { t } from '../utils/i18n.js';

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

export function QuizStep({
  language,
  questions,
  currentIndex,
  selectedOption,
  submittedAnswers,
  onSelectOption,
  onSubmitAnswer,
  onNext,
  onExitQuiz,
}) {
  const question = questions[currentIndex];
  if (!question) return null;

  const submittedChoice = submittedAnswers[question.id];
  const isSubmitted = Boolean(submittedChoice);
  const isCorrect = submittedChoice === question.correctAnswer;
  const isLast = currentIndex === questions.length - 1;
  const progressPct = Math.round(((currentIndex + (isSubmitted ? 1 : 0)) / questions.length) * 100);

  const difficultyClass =
    question.difficulty === 'Easy'
      ? 'badge-easy'
      : question.difficulty === 'Medium'
        ? 'badge-medium'
        : 'badge-hard';

  return (
    <section className="card">
      <div className="section-stack" style={{ gap: '16px' }}>
        <div className="row-between">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span className="badge badge-blue">
              {t(language, 'quiz.questionCounter', {
                current: currentIndex + 1,
                total: questions.length,
              })}
            </span>
            <span className={`badge ${difficultyClass}`}>
              {t(language, `quiz.difficulty.${question.difficulty}`)}
            </span>
          </div>

          <button type="button" className="btn btn-ghost btn-sm" onClick={onExitQuiz}>
            <FolderGit2 size={14} />
            <span>{t(language, 'quiz.exitQuiz')}</span>
          </button>
        </div>

        <div className="progress-track" aria-label="Quiz progress">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        <h2 className="quiz-question-text">{question.question}</h2>

        {question.codeSnippet && (
          <pre className="code-snippet-block">
            <code>{question.codeSnippet}</code>
          </pre>
        )}

        <div className="options-list" role="radiogroup" aria-label={question.question}>
          {OPTION_KEYS.map((key) => {
            const optionText = question.options?.[key] || '';
            const isChosen = (isSubmitted ? submittedChoice : selectedOption) === key;
            const isRightOption = question.correctAnswer === key;

            let optionStateClass = '';
            if (isSubmitted) {
              if (isRightOption) optionStateClass = 'correct';
              else if (isChosen && !isRightOption) optionStateClass = 'incorrect';
            } else if (isChosen) {
              optionStateClass = 'selected';
            }

            return (
              <button
                key={key}
                type="button"
                disabled={isSubmitted}
                className={`option-btn ${optionStateClass}`}
                onClick={() => onSelectOption(key)}
                aria-pressed={isChosen}
              >
                <span className="option-key">{key}</span>
                <span style={{ flex: 1 }}>{optionText}</span>
                {isSubmitted && isRightOption && (
                  <CheckCircle2 size={19} style={{ flexShrink: 0, marginTop: '2px' }} />
                )}
                {isSubmitted && isChosen && !isRightOption && (
                  <XCircle size={19} style={{ flexShrink: 0, marginTop: '2px' }} />
                )}
              </button>
            );
          })}
        </div>

        {!isSubmitted && (
          <p className="field-hint">{t(language, 'quiz.selectPrompt')}</p>
        )}

        {isSubmitted && (
          <div
            className={`alert ${isCorrect ? 'alert-success' : 'alert-danger'}`}
            role="status"
          >
            {isCorrect ? (
              <CheckCircle2 size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
            ) : (
              <XCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
            )}
            <div className="section-stack" style={{ gap: '8px', flex: 1 }}>
              <div style={{ fontWeight: 700 }}>
                {isCorrect
                  ? t(language, 'quiz.correctFeedback')
                  : `${t(language, 'quiz.incorrectFeedback')} — ${t(language, 'quiz.correctAnswerWas')} ${question.correctAnswer}`}
              </div>
              <div>
                <strong>{t(language, 'quiz.explanationLabel')}:</strong> {question.explanation}
              </div>
              <div>
                <span className="source-pill">
                  <FileCode2 size={14} />
                  <span>
                    {t(language, 'quiz.sourceFileLabel')}: {question.sourceFile}
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="actions-bar" style={{ justifyContent: 'flex-end' }}>
        {!isSubmitted ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selectedOption}
            onClick={onSubmitAnswer}
          >
            <span>{t(language, 'quiz.submitAnswer')}</span>
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onNext}>
            <span>
              {isLast ? t(language, 'quiz.viewResults') : t(language, 'quiz.nextQuestion')}
            </span>
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </section>
  );
}

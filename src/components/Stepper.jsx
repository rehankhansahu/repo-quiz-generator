import { Check } from 'lucide-react';
import { t } from '../utils/i18n.js';

export const STEP_ORDER = ['settings', 'repo', 'mode', 'language', 'generate', 'quiz', 'results'];

export function Stepper({ currentStep, maxReachableIndex, onSelectStep, language }) {
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <nav className="stepper-wrap" aria-label="Quiz setup steps">
      <div className="stepper">
        {STEP_ORDER.map((stepId, index) => {
          const isActive = stepId === currentStep;
          const isDone = index < currentIndex;
          // Prevent jumping directly to 'generate' from nav unless currently generating,
          // and prevent jumping ahead of maxReachableIndex.
          const isClickable =
            !isActive &&
            index <= maxReachableIndex &&
            stepId !== 'generate';

          return (
            <div key={stepId} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onSelectStep(stepId)}
                className={`step-pill ${isActive ? 'active' : ''} ${isDone ? 'done' : ''} ${
                  isClickable ? 'clickable' : ''
                }`}
              >
                <span className="step-num">
                  {isDone ? <Check size={12} strokeWidth={3} /> : index + 1}
                </span>
                <span>{t(language, `steps.${stepId}`)}</span>
              </button>
              {index < STEP_ORDER.length - 1 && <span className="step-connector" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

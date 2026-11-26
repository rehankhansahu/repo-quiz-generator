import { ArrowLeft, ArrowRight, CheckCircle2, SlidersHorizontal, Zap } from 'lucide-react';
import { t } from '../utils/i18n.js';

function clampInt(raw, min = 0, max = 30) {
  if (raw === '' || raw === null || raw === undefined) return 0;
  const num = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(num)) return 0;
  return Math.max(min, Math.min(max, num));
}

export function ModeStep({
  language,
  mode,
  customTotal,
  customCounts,
  onSelectMode,
  onChangeCustomTotal,
  onChangeCustomCounts,
  onBack,
  onContinue,
}) {
  const total = Number(customTotal) || 0;
  const assigned = (customCounts.Easy || 0) + (customCounts.Medium || 0) + (customCounts.Hard || 0);
  const isTotalValid = total >= 1 && total <= 30;
  const isCustomMatched = isTotalValid && assigned === total;
  const canContinue = mode === 'quick' || isCustomMatched;

  const handleTotalChange = (val) => {
    if (val === '') {
      onChangeCustomTotal(0);
      return;
    }
    const clamped = clampInt(val, 0, 30);
    onChangeCustomTotal(clamped);
  };

  const handleCountChange = (level, val) => {
    const clamped = clampInt(val, 0, 30);
    onChangeCustomCounts({
      ...customCounts,
      [level]: clamped,
    });
  };

  let counterClass = 'pending';
  let counterMessage = '';
  if (!isTotalValid) {
    counterClass = 'over';
    counterMessage = t(language, 'mode.invalidTotal');
  } else if (assigned === total) {
    counterClass = 'matched';
    counterMessage = t(language, 'mode.matchedStatus', { total });
  } else if (assigned > total) {
    counterClass = 'over';
    counterMessage = t(language, 'mode.overAssigned', {
      assigned,
      total,
      diff: assigned - total,
    });
  } else {
    counterClass = 'pending';
    counterMessage = t(language, 'mode.underAssigned', {
      diff: total - assigned,
    });
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">{t(language, 'mode.title')}</h2>
        <p className="card-subtitle">{t(language, 'mode.subtitle')}</p>
      </div>

      <div className="section-stack">
        <div className="choice-grid">
          <button
            type="button"
            className={`choice-card ${mode === 'quick' ? 'selected' : ''}`}
            onClick={() => onSelectMode('quick')}
          >
            <div className="choice-card-top">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={18} color="var(--primary-600)" />
                <span className="choice-card-title">{t(language, 'mode.quickTitle')}</span>
              </span>
              <span className="badge badge-blue">{t(language, 'mode.quickBadge')}</span>
            </div>
            <p className="choice-card-desc">{t(language, 'mode.quickDesc')}</p>
            <div className="chip-list">
              <span className="badge badge-easy">1 {t(language, 'mode.easyLabel')}</span>
              <span className="badge badge-medium">1 {t(language, 'mode.mediumLabel')}</span>
              <span className="badge badge-hard">1 {t(language, 'mode.hardLabel')}</span>
            </div>
          </button>

          <button
            type="button"
            className={`choice-card ${mode === 'custom' ? 'selected' : ''}`}
            onClick={() => onSelectMode('custom')}
          >
            <div className="choice-card-top">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <SlidersHorizontal size={18} color="var(--primary-600)" />
                <span className="choice-card-title">{t(language, 'mode.customTitle')}</span>
              </span>
              <span className="badge badge-neutral">{t(language, 'mode.customBadge')}</span>
            </div>
            <p className="choice-card-desc">{t(language, 'mode.customDesc')}</p>
          </button>
        </div>

        {mode === 'custom' && (
          <div className="card-subtle section-stack">
            <div className="field-group">
              <label htmlFor="custom-total-input" className="field-label">
                {t(language, 'mode.step1Label')}
              </label>
              <input
                id="custom-total-input"
                type="number"
                min={1}
                max={30}
                className="number-input"
                style={{ maxWidth: '200px' }}
                value={total === 0 ? '' : total}
                onChange={(e) => handleTotalChange(e.target.value)}
                placeholder={t(language, 'mode.totalPlaceholder')}
              />
            </div>

            <div className="field-group">
              <span className="field-label">{t(language, 'mode.step2Label')}</span>
              <div className="difficulty-grid">
                <div className="diff-input-card">
                  <label htmlFor="custom-easy-input" className="field-label">
                    <span className="badge badge-easy">{t(language, 'mode.easyLabel')}</span>
                  </label>
                  <input
                    id="custom-easy-input"
                    type="number"
                    min={0}
                    max={30}
                    className="number-input"
                    value={customCounts.Easy}
                    onChange={(e) => handleCountChange('Easy', e.target.value)}
                  />
                  <span className="field-hint">{t(language, 'mode.easyHint')}</span>
                </div>

                <div className="diff-input-card">
                  <label htmlFor="custom-medium-input" className="field-label">
                    <span className="badge badge-medium">{t(language, 'mode.mediumLabel')}</span>
                  </label>
                  <input
                    id="custom-medium-input"
                    type="number"
                    min={0}
                    max={30}
                    className="number-input"
                    value={customCounts.Medium}
                    onChange={(e) => handleCountChange('Medium', e.target.value)}
                  />
                  <span className="field-hint">{t(language, 'mode.mediumHint')}</span>
                </div>

                <div className="diff-input-card">
                  <label htmlFor="custom-hard-input" className="field-label">
                    <span className="badge badge-hard">{t(language, 'mode.hardLabel')}</span>
                  </label>
                  <input
                    id="custom-hard-input"
                    type="number"
                    min={0}
                    max={30}
                    className="number-input"
                    value={customCounts.Hard}
                    onChange={(e) => handleCountChange('Hard', e.target.value)}
                  />
                  <span className="field-hint">{t(language, 'mode.hardHint')}</span>
                </div>
              </div>
            </div>

            <div className={`counter-bar ${counterClass}`} role="status" aria-live="polite">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                {isCustomMatched && <CheckCircle2 size={18} />}
                <span>{counterMessage}</span>
              </span>
              <span className="mono">
                {t(language, 'mode.assignedStatus', { assigned, total })}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="actions-bar">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>{t(language, 'mode.backBtn')}</span>
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canContinue}
          onClick={onContinue}
        >
          <span>{t(language, 'mode.continueBtn')}</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}

import { useState, useEffect } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { t } from '../utils/i18n.js';
import { listAvailableGeminiModels } from '../services/geminiApi.js';
import { getFriendlyErrorMessage } from '../utils/errors.js';

export function SettingsStep({
  language,
  geminiKey,
  selectedModel,
  onSaveGeminiKey,
  onRemoveGeminiKey,
  onSelectModel,
  onContinue,
}) {
  const [geminiInput, setGeminiInput] = useState(geminiKey || '');
  const [showGemini, setShowGemini] = useState(false);

  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);

  useEffect(() => {
    setGeminiInput(geminiKey || '');
  }, [geminiKey]);

  const hasSavedGemini = Boolean(geminiKey);

  const handleSaveOrUpdateGemini = (shouldAdvance = false) => {
    const trimmed = geminiInput.trim();
    if (!trimmed) {
      setErrorMsg(t(language, 'settings.geminiRequiredError'));
      setStatusMessage(null);
      return;
    }
    const wasSaved = hasSavedGemini;
    onSaveGeminiKey(trimmed);
    setErrorMsg('');
    setStatusMessage({
      type: 'success',
      text: wasSaved ? t(language, 'settings.keyUpdatedToast') : t(language, 'settings.keySavedToast'),
    });
    if (shouldAdvance) {
      onContinue();
    }
  };

  const handleRemoveGemini = () => {
    onRemoveGeminiKey();
    setGeminiInput('');
    setAvailableModels([]);
    setErrorMsg('');
    setStatusMessage({
      type: 'info',
      text: t(language, 'settings.keyRemovedToast'),
    });
  };

  const handleTestGeminiKey = async () => {
    const keyToTest = geminiInput.trim() || geminiKey;
    if (!keyToTest) {
      setErrorMsg(t(language, 'settings.geminiRequiredError'));
      return;
    }
    setIsTesting(true);
    setErrorMsg('');
    setStatusMessage(null);
    try {
      const models = await listAvailableGeminiModels(keyToTest, { forceRefresh: true });
      setAvailableModels(models);
      onSaveGeminiKey(keyToTest);
      setStatusMessage({
        type: 'success',
        text: `${t(language, 'settings.keyValid')} (${models[0]?.id})`,
      });
    } catch (err) {
      setErrorMsg(getFriendlyErrorMessage(err, language));
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">{t(language, 'settings.title')}</h2>
        <p className="card-subtitle">Enter your Google Gemini API key to generate quizzes from any GitHub repository.</p>
      </div>

      <div className="section-stack">
        {errorMsg && (
          <div className="alert alert-danger" role="alert">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {statusMessage && (
          <div
            className={`alert ${statusMessage.type === 'success' ? 'alert-success' : 'alert-info'}`}
            role="status"
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Gemini API Key Section */}
        <div className="card-subtle section-stack">
          <div className="field-group">
            <div className="field-label">
              <label htmlFor="gemini-api-key-input" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={16} />
                {t(language, 'settings.geminiSectionTitle')}
              </label>
            </div>

            <div className="input-row">
              <div className="input-wrap">
                <input
                  id="gemini-api-key-input"
                  type={showGemini ? 'text' : 'password'}
                  className="text-input input-with-toggle mono"
                  value={geminiInput}
                  onChange={(e) => setGeminiInput(e.target.value)}
                  placeholder={t(language, 'settings.geminiPlaceholder')}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="toggle-visibility-btn"
                  onClick={() => setShowGemini((s) => !s)}
                  aria-label={showGemini ? t(language, 'settings.hideKey') : t(language, 'settings.showKey')}
                >
                  {showGemini ? <EyeOff size={13} /> : <Eye size={13} />}
                  <span>{showGemini ? t(language, 'settings.hideKey') : t(language, 'settings.showKey')}</span>
                </button>
              </div>

              {hasSavedGemini && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleSaveOrUpdateGemini(false)}
                  >
                    {t(language, 'settings.updateKey')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger-outline"
                    onClick={handleRemoveGemini}
                  >
                    <Trash2 size={15} />
                    <span>{t(language, 'settings.removeKey')}</span>
                  </button>
                </>
              )}
            </div>

            <div className="row-between">
              <p className="field-hint">{t(language, 'settings.geminiHelp')}</p>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleTestGeminiKey}
                disabled={isTesting}
              >
                {isTesting ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                <span>{isTesting ? t(language, 'settings.verifying') : t(language, 'settings.verifyKey')}</span>
              </button>
            </div>
          </div>

          {availableModels.length > 0 && (
            <div className="field-group">
              <label htmlFor="gemini-model-select" className="field-label">
                {t(language, 'settings.modelLabel')}
              </label>
              <select
                id="gemini-model-select"
                className="select-input"
                value={selectedModel}
                onChange={(e) => onSelectModel(e.target.value)}
              >
                <option value="">{t(language, 'settings.modelAuto')}</option>
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName} ({m.id})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="actions-bar" style={{ justifyContent: 'flex-end' }}>
        {!hasSavedGemini ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleSaveOrUpdateGemini(true)}
          >
            <span>{t(language, 'settings.saveAndContinue')}</span>
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (geminiInput.trim() && geminiInput.trim() !== geminiKey) {
                handleSaveOrUpdateGemini(true);
              } else {
                onContinue();
              }
            }}
          >
            <span>{t(language, 'settings.continueToRepo')}</span>
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </section>
  );
}

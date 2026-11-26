import { ArrowLeft, Info, Languages, Sparkles } from 'lucide-react';
import { t } from '../utils/i18n.js';

export function LanguageStep({
  language,
  onSelectLanguage,
  onBack,
  onGenerate,
}) {
  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">{t(language, 'language.title')}</h2>
        <p className="card-subtitle">{t(language, 'language.subtitle')}</p>
      </div>

      <div className="section-stack">
        <div className="choice-grid">
          <button
            type="button"
            className={`choice-card ${language === 'en' ? 'selected' : ''}`}
            onClick={() => onSelectLanguage('en')}
          >
            <div className="choice-card-top">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Languages size={18} color="var(--primary-600)" />
                <span className="choice-card-title">{t(language, 'language.enTitle')}</span>
              </span>
              <span className="badge badge-blue">EN</span>
            </div>
            <p className="choice-card-desc">{t(language, 'language.enDesc')}</p>
            <div className="sample-quote">{t(language, 'language.enSample')}</div>
          </button>

          <button
            type="button"
            className={`choice-card ${language === 'hinglish' ? 'selected' : ''}`}
            onClick={() => onSelectLanguage('hinglish')}
          >
            <div className="choice-card-top">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Languages size={18} color="var(--primary-600)" />
                <span className="choice-card-title">{t(language, 'language.hinglishTitle')}</span>
              </span>
              <span className="badge badge-blue">Roman</span>
            </div>
            <p className="choice-card-desc">{t(language, 'language.hinglishDesc')}</p>
            <div className="sample-quote">{t(language, 'language.hinglishSample')}</div>
          </button>
        </div>

        <div className="alert alert-info">
          <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{t(language, 'language.note')}</span>
        </div>
      </div>

      <div className="actions-bar">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>{t(language, 'language.backBtn')}</span>
        </button>
        <button type="button" className="btn btn-primary" onClick={onGenerate}>
          <Sparkles size={16} />
          <span>{t(language, 'language.generateBtn')}</span>
        </button>
      </div>
    </section>
  );
}

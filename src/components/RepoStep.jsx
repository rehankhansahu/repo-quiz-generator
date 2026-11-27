import { useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, FolderGit2 } from 'lucide-react';
import { parseGitHubRepoUrl } from '../services/githubUrl.js';
import { t } from '../utils/i18n.js';

export function RepoStep({
  language,
  repoUrl,
  onChangeRepoUrl,
  onBack,
  onContinue,
}) {
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    try {
      parseGitHubRepoUrl(repoUrl);
      setError('');
      onContinue();
    } catch {
      setError(t(language, 'repo.invalidUrl'));
    }
  };

  return (
    <form className="card" onSubmit={handleSubmit} noValidate>
      <div className="card-header">
        <h2 className="card-title">{t(language, 'repo.title')}</h2>
        <p className="card-subtitle">{t(language, 'repo.subtitle')}</p>
      </div>

      <div className="section-stack">
        {error && (
          <div className="alert alert-danger" role="alert">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <div className="field-group">
          <label htmlFor="repo-url-input" className="field-label">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <FolderGit2 size={16} />
              {t(language, 'repo.urlLabel')}
            </span>
          </label>
          <input
            id="repo-url-input"
            type="url"
            className="text-input mono"
            value={repoUrl}
            onChange={(e) => {
              onChangeRepoUrl(e.target.value);
              if (error) setError('');
            }}
            placeholder={t(language, 'repo.urlPlaceholder')}
            autoFocus
          />
        </div>
      </div>

      <div className="actions-bar">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>{t(language, 'repo.backBtn')}</span>
        </button>
        <button type="submit" className="btn btn-primary">
          <span>{t(language, 'repo.continueBtn')}</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}

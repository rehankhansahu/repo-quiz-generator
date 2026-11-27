import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FolderGit2,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { parseGitHubRepoUrl } from '../services/githubUrl.js';
import { fetchUserPrivateRepos } from '../services/githubApi.js';
import { t } from '../utils/i18n.js';

export function RepoStep({
  language,
  repoUrl,
  onChangeRepoUrl,
  githubToken = '',
  onGoSettings,
  onBack,
  onContinue,
}) {
  const [error, setError] = useState('');
  const [privateRepos, setPrivateRepos] = useState([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const fetchAbortRef = useRef(null);

  const loadPrivateRepos = useCallback(async () => {
    fetchAbortRef.current?.abort();
    if (!githubToken) {
      setPrivateRepos([]);
      return;
    }
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setIsLoadingRepos(true);
    setFetchError('');
    try {
      const repos = await fetchUserPrivateRepos({
        token: githubToken,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setPrivateRepos(repos);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setFetchError(err?.message || 'Failed to fetch private repositories.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingRepos(false);
      }
    }
  }, [githubToken]);

  useEffect(() => {
    if (githubToken) {
      loadPrivateRepos();
    } else {
      setPrivateRepos([]);
      setFetchError('');
    }
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [githubToken, loadPrivateRepos]);

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

  const handleSelectPrivateRepo = (e) => {
    const selectedUrl = e.target.value;
    onChangeRepoUrl(selectedUrl);
    if (error) setError('');
  };

  const selectedPrivateRepo = privateRepos.find(
    (r) => r.url.toLowerCase() === repoUrl.trim().toLowerCase()
  );

  return (
    <form className="card" onSubmit={handleSubmit} noValidate>
      <div className="card-header">
        <h2 className="card-title">{t(language, 'repo.title')}</h2>
        <p className="card-subtitle">
          {githubToken
            ? 'Select one of your private repositories or enter any public repository URL.'
            : t(language, 'repo.subtitle')}
        </p>
      </div>

      <div className="section-stack">
        {error && (
          <div className="alert alert-danger" role="alert">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        {/* Private Repositories Section if GitHub Token is connected */}
        {githubToken && (
          <div className="card-subtle section-stack" style={{ border: '1px solid var(--border-strong)' }}>
            <div className="row-between">
              <label htmlFor="private-repo-select" className="field-label" style={{ margin: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <Lock size={16} />
                  <span>Your Private Repositories</span>
                </span>
                {privateRepos.length > 0 && (
                  <span className="badge badge-secondary" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
                    {privateRepos.length} found
                  </span>
                )}
              </label>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={loadPrivateRepos}
                disabled={isLoadingRepos}
                title="Refresh private repositories"
              >
                <RefreshCw size={14} className={isLoadingRepos ? 'spin' : ''} />
                <span>{isLoadingRepos ? 'Fetching...' : 'Refresh'}</span>
              </button>
            </div>

            {isLoadingRepos && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '8px 0' }}>
                <Loader2 size={16} className="spin" />
                <span>Loading your private repositories from GitHub...</span>
              </div>
            )}

            {fetchError && !isLoadingRepos && (
              <div className="alert alert-warning" role="alert" style={{ fontSize: '0.85rem', padding: '8px 12px' }}>
                <AlertCircle size={16} />
                <span>{fetchError} (Make sure your token has the &apos;repo&apos; scope)</span>
              </div>
            )}

            {!isLoadingRepos && privateRepos.length > 0 && (
              <div className="field-group">
                <select
                  id="private-repo-select"
                  className="select-input"
                  value={selectedPrivateRepo ? selectedPrivateRepo.url : ''}
                  onChange={handleSelectPrivateRepo}
                >
                  <option value="">-- Choose a Private Repository ({privateRepos.length}) --</option>
                  {privateRepos.map((repo) => (
                    <option key={repo.id} value={repo.url}>
                      🔒 {repo.fullName} {repo.language ? `(${repo.language})` : ''}
                    </option>
                  ))}
                </select>

                {selectedPrivateRepo && (
                  <div style={{
                    marginTop: '4px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.85rem'
                  }}>
                    <CheckCircle2 size={16} style={{ color: 'var(--success-accent)' }} />
                    <div>
                      <strong>{selectedPrivateRepo.fullName}</strong>
                      {selectedPrivateRepo.description && (
                        <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                          — {selectedPrivateRepo.description}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isLoadingRepos && privateRepos.length === 0 && !fetchError && (
              <p className="field-hint">
                No private repositories found on your account. Make sure your GitHub token has the <code>repo</code> scope, or paste any repository URL below.
              </p>
            )}
          </div>
        )}

        {/* Manual URL Input Field */}
        <div className="field-group">
          <label htmlFor="repo-url-input" className="field-label">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <FolderGit2 size={16} />
              <span>{githubToken ? 'Or Enter Any Repository URL (Public / Private)' : t(language, 'repo.urlLabel')}</span>
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
            autoFocus={!githubToken}
          />
        </div>

        {/* If GitHub Token is missing, show helpful note */}
        {!githubToken && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-default)',
            fontSize: '0.85rem',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
              <Lock size={15} style={{ color: 'var(--text-muted)' }} />
              <span>Want to select from your <strong>Private Repositories</strong>?</span>
            </div>
            {onGoSettings && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onGoSettings}
                style={{ padding: '4px 10px', height: '28px' }}
              >
                <KeyRound size={13} />
                <span>Add GitHub Token</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="actions-bar">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>{t(language, 'repo.backBtn')}</span>
        </button>
        <button type="submit" className="btn btn-primary" disabled={!repoUrl.trim()}>
          <span>{t(language, 'repo.continueBtn')}</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}

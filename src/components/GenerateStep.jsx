import {
  AlertTriangle,
  ArrowLeft,
  Cpu,
  FileCode2,
  KeyRound,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { t } from '../utils/i18n.js';

export function GenerateStep({
  language,
  progress,
  projectMap,
  strategy,
  error,
  isRunning,
  onCancel,
  onRetry,
  onGoSettings,
  onGoRepo,
}) {
  const getStageLabel = () => {
    switch (progress.stage) {
      case 'tree':
        return t(language, 'generate.stageTree');
      case 'filtering':
        return t(language, 'generate.stageFiltering');
      case 'fetching':
        return t(language, 'generate.stageFetching');
      case 'mapping':
        return t(language, 'generate.stageMapping');
      case 'summarizing':
        return t(language, 'generate.stageSummarizing');
      case 'generating':
        return t(language, 'generate.stageGenerating');
      case 'validating':
        return t(language, 'generate.stageValidating');
      default:
        return t(language, 'generate.subtitle');
    }
  };

  const fetchPct =
    progress.filesTotal > 0
      ? Math.round((progress.filesFetched / progress.filesTotal) * 100)
      : 0;

  const chunkPct =
    progress.chunksTotal > 0
      ? Math.round((progress.chunksDone / progress.chunksTotal) * 100)
      : 0;

  return (
    <section className="card">
      <div className="card-header">
        <div className="row-between" style={{ marginBottom: '6px' }}>
          <h2 className="card-title" style={{ margin: 0 }}>
            {t(language, 'generate.title')}
          </h2>
          {strategy && (
            <span className="badge badge-blue">
              <Cpu size={13} />
              {strategy === 'map-reduce'
                ? t(language, 'generate.strategyMapReduce')
                : t(language, 'generate.strategyDirect')}
            </span>
          )}
        </div>
        <p className="card-subtitle">{t(language, 'generate.subtitle')}</p>
      </div>

      <div className="section-stack">
        {isRunning && (
          <div className="card-subtle section-stack">
            <div className="row-between">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', fontWeight: 600 }}>
                <Loader2 size={18} className="spin" color="var(--primary-600)" />
                <span>{getStageLabel()}</span>
              </span>
              {progress.filesTotal > 0 && progress.stage === 'fetching' && (
                <span className="mono badge badge-blue">{fetchPct}%</span>
              )}
              {progress.chunksTotal > 0 && progress.stage === 'summarizing' && (
                <span className="mono badge badge-blue">{chunkPct}%</span>
              )}
            </div>

            {progress.filesTotal > 0 && (
              <div className="field-group">
                <div className="progress-track" role="progressbar" aria-valuenow={fetchPct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="progress-fill" style={{ width: `${fetchPct}%` }} />
                </div>
                <div className="row-between">
                  <span className="field-hint">
                    {t(language, 'generate.filesProgress', {
                      fetched: progress.filesFetched,
                      total: progress.filesTotal,
                    })}
                  </span>
                  {progress.currentPath && progress.stage === 'fetching' && (
                    <span className="field-hint mono" style={{ maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {progress.currentPath}
                    </span>
                  )}
                </div>
              </div>
            )}

            {progress.chunksTotal > 0 && (
              <div className="field-group">
                <div className="progress-track" role="progressbar" aria-valuenow={chunkPct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="progress-fill" style={{ width: `${chunkPct}%` }} />
                </div>
                <span className="field-hint">
                  {t(language, 'generate.chunkProgress', {
                    done: progress.chunksDone,
                    total: progress.chunksTotal,
                  })}
                </span>
              </div>
            )}
          </div>
        )}

        {projectMap && (
          <div className="card-subtle section-stack">
            <div className="row-between">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                <FileCode2 size={17} color="var(--primary-600)" />
                <span>{t(language, 'generate.projectMapTitle')}</span>
              </span>
              <span className="mono badge badge-neutral">{projectMap.repoInfo.fullName}</span>
            </div>

            <div className="stats-grid">
              <div className="stat-tile">
                <div className="stat-label">{t(language, 'generate.filesIncluded')}</div>
                <div className="stat-value">{projectMap.totalFiles}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">{t(language, 'generate.filesSkipped')}</div>
                <div className="stat-value">{projectMap.excludedStats?.totalSkipped || 0}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">{t(language, 'generate.modulesLabel')}</div>
                <div className="stat-value">{projectMap.modules.length}</div>
              </div>
            </div>

            {projectMap.languages.length > 0 && (
              <div className="field-group">
                <span className="field-hint">{t(language, 'generate.languagesLabel')}</span>
                <div className="chip-list">
                  {projectMap.languages.slice(0, 6).map((langItem) => (
                    <span key={langItem.language} className="chip">
                      {langItem.language} ({langItem.files})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {projectMap.entryPoints.length > 0 && (
              <div className="field-group">
                <span className="field-hint">{t(language, 'generate.entryPointsLabel')}</span>
                <div className="chip-list">
                  {projectMap.entryPoints.slice(0, 6).map((ep) => (
                    <span key={ep} className="chip mono">
                      {ep}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={19} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div className="section-stack" style={{ gap: '10px', flex: 1 }}>
              <span>{error}</span>
              <div className="chip-list">
                <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
                  <RefreshCw size={14} />
                  <span>{t(language, 'generate.retryBtn')}</span>
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onGoSettings}>
                  <KeyRound size={14} />
                  <span>{t(language, 'generate.backToSettingsBtn')}</span>
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onGoRepo}>
                  <ArrowLeft size={14} />
                  <span>{t(language, 'generate.backToRepoBtn')}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {isRunning && (
        <div className="actions-bar" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-danger-outline" onClick={onCancel}>
            <XCircle size={16} />
            <span>{t(language, 'generate.cancelBtn')}</span>
          </button>
        </div>
      )}
    </section>
  );
}

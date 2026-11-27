import { Code2, KeyRound, Moon, Sun } from 'lucide-react';
import { t } from '../utils/i18n.js';

export function Header({
  theme,
  onToggleTheme,
  onOpenSettings,
  onLogoClick,
}) {
  return (
    <header className="app-header">
      <div className="container header-inner">
        <button
          type="button"
          className="brand"
          onClick={onLogoClick}
          title={t('en', 'appName')}
        >
          <span className="brand-icon" aria-hidden="true">
            <Code2 size={22} />
          </span>
          <div>
            <h1 className="brand-title">{t('en', 'appName')}</h1>
            <p className="brand-subtitle">{t('en', 'appTagline')}</p>
          </div>
        </button>

        <div className="header-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={onOpenSettings}
            title="API Key"
          >
            <KeyRound size={15} />
            <span>API Key</span>
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label={t('en', 'header.toggleTheme')}
            title={t('en', 'header.toggleTheme')}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            <span>
              {theme === 'dark' ? t('en', 'header.lightMode') : t('en', 'header.darkMode')}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

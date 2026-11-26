import { Code2, KeyRound, Languages, Moon, Sun } from 'lucide-react';
import { t } from '../utils/i18n.js';

export function Header({
  theme,
  onToggleTheme,
  language,
  onToggleLanguage,
  hasGeminiKey,
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
          title={t(language, 'appName')}
        >
          <span className="brand-icon" aria-hidden="true">
            <Code2 size={22} />
          </span>
          <div>
            <h1 className="brand-title">{t(language, 'appName')}</h1>
            <p className="brand-subtitle">{t(language, 'appTagline')}</p>
          </div>
        </button>

        <div className="header-actions">
          <button
            type="button"
            className={`icon-btn ${hasGeminiKey ? 'active-status' : ''}`}
            onClick={onOpenSettings}
            title={t(language, 'header.apiKeys')}
          >
            <KeyRound size={15} />
            <span>
              {hasGeminiKey ? t(language, 'header.keySaved') : t(language, 'header.keyMissing')}
            </span>
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={onToggleLanguage}
            aria-label={t(language, 'header.languageLabel')}
            title={t(language, 'header.languageLabel')}
          >
            <Languages size={15} />
            <span>{language === 'hinglish' ? 'Hinglish' : 'English'}</span>
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label={t(language, 'header.toggleTheme')}
            title={t(language, 'header.toggleTheme')}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            <span>
              {theme === 'dark' ? t(language, 'header.lightMode') : t(language, 'header.darkMode')}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

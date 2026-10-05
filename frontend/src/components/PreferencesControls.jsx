import { Languages, Moon, Sun } from 'lucide-react'
import { usePreferences } from '../contexts/usePreferences'

export default function PreferencesControls({ compact = false }) {
  const { language, theme, setLanguage, toggleTheme, t } = usePreferences()
  return <div className={`preferences-controls ${compact ? 'compact' : ''}`} aria-label="Language and theme preferences"><label className="language-control" title={t('language')}><Languages size={16} /><select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t('language')}><option value="en">EN</option><option value="fr">FR</option><option value="ar">ع</option></select></label><button className="icon-button" onClick={toggleTheme} aria-label={`${t('theme')}: ${theme === 'dark' ? t('dark') : t('light')}`} title={theme === 'dark' ? t('light') : t('dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button></div>
}

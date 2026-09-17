import { useCallback, useEffect, useState } from 'react'
import { clampFtp, loadSettings, saveSettings, type AppSettings } from '../lib/settings'

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(() => loadSettings())

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const setSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettingsState((current) => ({
      ...current,
      ...patch,
      ftp: patch.ftp !== undefined ? clampFtp(patch.ftp) : current.ftp,
    }))
  }, [])

  return { settings, setSettings }
}

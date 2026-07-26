const DARK_KEY = 'joltshot-color-mode'

export function useColorMode() {
  const isDark = useState<boolean>('color-mode-dark', () => false)

  function setColorMode(dark: boolean) {
    isDark.value = dark
    if (import.meta.client) localStorage.setItem(DARK_KEY, dark ? 'dark' : 'light')
  }

  function toggleColorMode() {
    setColorMode(!isDark.value)
  }

  onMounted(() => {
    if (!import.meta.client) return
    const stored = localStorage.getItem(DARK_KEY)
    if (stored === 'light' || stored === 'dark') {
      isDark.value = stored === 'dark'
    }
  })

  return { isDark, setColorMode, toggleColorMode }
}
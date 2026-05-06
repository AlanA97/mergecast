(function () {
  const script = document.currentScript as HTMLScriptElement | null
  const workspaceSlug = script?.getAttribute('data-workspace') ?? ''
  if (!workspaceSlug) return

  const API_BASE = 'MERGECAST_API_URL'

  let entries: Array<{
    id: string
    title: string | null
    final_content: string | null
    published_at: string
  }> = []
  let isOpen = false

  async function fetchEntries() {
    try {
      const res = await fetch(`${API_BASE}/api/public/changelog/${workspaceSlug}`)
      const data = await res.json()
      entries = data.entries ?? []
    } catch {
      /* silent fail — don't break host page */
    }
  }

  async function fetchSettings(): Promise<{
    position: string
    theme: string
    accentColor: string
    buttonLabel: string
  }> {
    try {
      const res = await fetch(`${API_BASE}/api/public/widget-settings/${workspaceSlug}`)
      const data = await res.json()
      const s = data.settings
      return {
        position: s?.position ?? 'bottom-right',
        theme: s?.theme ?? 'light',
        accentColor: s?.accent_color ?? '#000000',
        buttonLabel: s?.button_label ?? "What's new",
      }
    } catch {
      return { position: 'bottom-right', theme: 'light', accentColor: '#000000', buttonLabel: "What's new" }
    }
  }

  function createWidget(settings: {
    position: string
    theme: string
    accentColor: string
    buttonLabel: string
  }) {
    const container = document.createElement('div')
    container.id = 'mergecast-widget'
    const isRight = settings.position.includes('right')
    const isBottom = settings.position.includes('bottom')
    container.style.cssText = `position:fixed;${isRight ? 'right:24px' : 'left:24px'};${isBottom ? 'bottom:24px' : 'top:24px'};z-index:9999;font-family:system-ui,sans-serif;`

    const button = document.createElement('button')
    button.textContent = settings.buttonLabel
    button.style.cssText = `background:${settings.accentColor};color:#fff;border:none;border-radius:9999px;padding:8px 16px;font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.15);`

    const drawerBottom = isBottom ? '48px' : 'auto'
    const drawerTop = isBottom ? 'auto' : '48px'
    const drawer = document.createElement('div')
    drawer.style.cssText = `display:none;position:absolute;bottom:${drawerBottom};top:${drawerTop};${isRight ? 'right:0' : 'left:0'};width:320px;max-height:480px;overflow-y:auto;background:${settings.theme === 'dark' ? '#1a1a1a' : '#fff'};color:${settings.theme === 'dark' ? '#fff' : '#111'};border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.12);padding:16px;`

    function renderEntries() {
      drawer.textContent = ''
      if (entries.length === 0) {
        const empty = document.createElement('p')
        empty.style.cssText = 'font-size:13px;color:#888;text-align:center;padding:24px 0'
        empty.textContent = 'No updates yet.'
        drawer.appendChild(empty)
        return
      }
      entries.forEach(e => {
        const item = document.createElement('div')
        item.style.cssText = 'padding:12px 0;border-bottom:1px solid rgba(0,0,0,0.08);'
        const date = document.createElement('p')
        date.style.cssText = 'font-size:11px;color:#888;margin:0 0 4px'
        date.textContent = new Date(e.published_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
        const title = document.createElement('p')
        title.style.cssText = 'font-size:14px;font-weight:600;margin:0 0 4px'
        title.textContent = e.title ?? 'Update'
        const body = document.createElement('p')
        body.style.cssText = 'font-size:13px;color:#555;margin:0'
        const content = e.final_content ?? ''
        body.textContent = content.length > 120 ? content.slice(0, 120) + '…' : content
        item.appendChild(date)
        item.appendChild(title)
        item.appendChild(body)
        drawer.appendChild(item)
      })
    }

    button.addEventListener('click', () => {
      isOpen = !isOpen
      drawer.style.display = isOpen ? 'block' : 'none'
      if (isOpen) renderEntries()
    })

    document.addEventListener('click', e => {
      if (isOpen && !container.contains(e.target as Node)) {
        isOpen = false
        drawer.style.display = 'none'
      }
    })

    container.appendChild(drawer)
    container.appendChild(button)
    document.body.appendChild(container)
  }

  async function init() {
    const [settings] = await Promise.all([fetchSettings(), fetchEntries()])
    createWidget(settings)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()

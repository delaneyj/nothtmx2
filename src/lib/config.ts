export const SwapStyles = {
  // the default, puts the content inside the target element
  InnerHTML: 'innerHTML',
  // replaces the entire target element with the returned content
  OuterHTML: 'outerHTML',
  // prepends the content before the first child inside the target
  AfterBegin: 'afterbegin',
  // prepends the content before the target in the targets parent element
  BeforeBegin: 'beforebegin',
  // appends the content after the last child inside the target
  BeforeEnd: 'beforeend',
  // appends the content after the target in the targets parent element
  AfterEnd: 'afterend',
  // does not append content from response (Out of Band Swaps and Response Headers will still be processed)
  None: 'none',

  // TODO: not in docs, is it really a config?
  Delete: 'delete',
} as const
export type SwapStyle = typeof SwapStyles[keyof typeof SwapStyles]

export interface Config {
  historyEnabled: boolean // really only useful for testing

  historyCacheSize: number

  refreshOnHistoryMiss: boolean // if set to true htmx will issue a full page refresh on history misses rather than use an AJAX request

  defaultSwapStyle: SwapStyle
  defaultSwapDelayMs: number
  defaultSettleDelayMs: number
  includeIndicatorStyles: boolean // (determines if the indicator styles are loaded)
  indicatorClass: string
  requestClass: string
  addedClass: string
  settlingClass: string
  swappingClass: string
  allowEval: boolean
  inlineScriptNonce: string // If empty no nonce will be added to inline scripts
  attributesToSettle: string[] // TODO: not in docs, is it really a config?
  withCredentials: boolean // TODO: not in docs, is it really a config?
  timeoutMs: number
  wsReconnectDelay: 'full-jitter' | ((retryCount: number) => number)
  wsBinaryType: BinaryType
  disableSelector: string // TODO: not in docs, is it really a config?
  useTemplateFragments: false //  HTML template tags for parsing content from the server (not IE11 compatible!)
  scrollBehavior: 'smooth' // TODO: not in docs, is it really a config?  Only ever 'smooth'?
  defaultFocusScroll: boolean // if the focused element should be scrolled into view, can be overridden using the focus-scroll swap modifier.
  getCacheBusterParam: boolean // if set to true htmx will include a cache-busting parameter in GET requests to avoid caching partial responses by the browser
}

export function defaultConfig(): Config {
  return {
    historyEnabled: true,
    historyCacheSize: 10,
    refreshOnHistoryMiss: false,
    defaultSwapStyle: 'innerHTML',
    defaultSwapDelayMs: 0,
    defaultSettleDelayMs: 20,
    includeIndicatorStyles: true,
    indicatorClass: 'htmx-indicator',
    requestClass: 'htmx-request',
    addedClass: 'htmx-added',
    settlingClass: 'htmx-settling',
    swappingClass: 'htmx-swapping',
    allowEval: true,
    inlineScriptNonce: '',
    attributesToSettle: ['class', 'style', 'width', 'height'],
    withCredentials: false,
    timeoutMs: 0,
    wsReconnectDelay: 'full-jitter',
    wsBinaryType: 'blob',
    disableSelector: '[hx-disable], [data-hx-disable]',
    useTemplateFragments: false,
    scrollBehavior: 'smooth',
    defaultFocusScroll: false,
    getCacheBusterParam: false,
  }
}

export function mergeMetaConfig() {
  const userDefined = document.querySelector<HTMLMetaElement>(
    'meta[name="htmx-config"]',
  )
  if (userDefined) {
    const parsed: Config = JSON.parse(userDefined.content)
    if (!parsed)
      throw new Error('htmx-config meta tag must contain valid Config JSON')

    config = Object.assign(config, parsed)
  }
}

export let config = defaultConfig()

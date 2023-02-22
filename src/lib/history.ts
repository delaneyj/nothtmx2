import { makeSettleInfo } from './ajax'
import { config } from './config'
import { triggerErrorEvent, triggerEvent } from './events'
import {
  findAttributeTargets,
  findTitle,
  swapInnerHTML,
} from './node-processing'
import { find, findAll, removeClassFromElement } from './public'
import { canAccessLocalStorage, getInternalData, makeFragment } from './utils'

function currentPath() {
  return location.pathname + location.search
}
let currentPathForHistory = currentPath()

function getCacheHistory() {
  const localCacheStr = localStorage.getItem('htmx-history-cache') || '[]'
  const historyCache: HistoryItem[] = JSON.parse(localCacheStr) || []
  return historyCache
}

export function getHistoryElement() {
  var historyElt = document.querySelector(
    '[hx-history-elt],[data-hx-history-elt]',
  )
  return historyElt || document.body
}

export interface HistoryItem {
  url: string
  content: string
  title: string
  scroll: number
}
export function saveToHistoryCache(
  url: string,
  content: string,
  title: string,
  scroll: number,
) {
  if (!canAccessLocalStorage()) {
    return
  }

  const historyCache = getCacheHistory()
  for (var i = 0; i < historyCache.length; i++) {
    if (historyCache[i].url === url) {
      historyCache.splice(i, 1)
      break
    }
  }
  const newHistoryItem = {
    url: url,
    content: content,
    title: title,
    scroll: scroll,
  }
  triggerEvent(document.body, 'htmx:historyItemCreated', {
    item: newHistoryItem,
    cache: historyCache,
  })
  historyCache.push(newHistoryItem)
  while (historyCache.length > config.historyCacheSize) {
    historyCache.shift()
  }
  while (historyCache.length > 0) {
    try {
      localStorage.setItem('htmx-history-cache', JSON.stringify(historyCache))
      break
    } catch (e) {
      triggerErrorEvent(document.body, 'htmx:historyCacheError', {
        cause: e,
        cache: historyCache,
      })
      historyCache.shift() // shrink the cache and retry
    }
  }
}

export function getCachedHistory(url: string) {
  if (!canAccessLocalStorage()) {
    return null
  }

  const historyCache = getCacheHistory()
  for (var i = 0; i < historyCache.length; i++) {
    if (historyCache[i].url === url) {
      return historyCache[i]
    }
  }
  return null
}

export function cleanInnerHtmlForHistory(elt: Element) {
  const { requestClass } = config
  const clone = elt.cloneNode(true) as Element
  findAll(clone, '.' + requestClass).forEach((child) => {
    removeClassFromElement(child, requestClass)
  })
  return clone.innerHTML
}

export function saveCurrentPageToHistory() {
  const elt = getHistoryElement()
  const path = currentPath()

  // Allow history snapshot feature to be disabled where hx-history="false"
  // is present *anywhere* in the current document we're about to save,
  // so we can prevent privileged data entering the cache.
  // The page will still be reachable as a history entry, but htmx will fetch it
  // live from the server onpopstate rather than look in the localStorage cache
  var disableHistoryCache = document.querySelector(
    '[hx-history="false" i],[data-hx-history="false" i]',
  )
  if (!disableHistoryCache) {
    triggerEvent(document.body, 'htmx:beforeHistorySave', {
      path: path,
      historyElt: elt,
    })
    saveToHistoryCache(
      path,
      cleanInnerHtmlForHistory(elt),
      document.title,
      window.scrollY,
    )
  }

  if (config.historyEnabled)
    history.replaceState({ htmx: true }, document.title, window.location.href)
}

export function pushUrlIntoHistory(path: string) {
  // remove the cache buster parameter, if any
  if (config.getCacheBusterParam) {
    path = path.replace(/org\.htmx\.cache-buster=[^&]*&?/, '')
    if (path.endsWith('&') || path.endsWith('?')) {
      path = path.slice(0, -1)
    }
  }
  if (config.historyEnabled) {
    history.pushState({ htmx: true }, '', path)
  }
  currentPathForHistory = path
}

export function replaceUrlInHistory(path: string) {
  if (config.historyEnabled) history.replaceState({ htmx: true }, '', path)
  currentPathForHistory = path
}

export type Task = () => void
export function settleImmediately(tasks: Task[]) {
  tasks.forEach((task) => task())
}

export function loadHistoryFromServer(path: string) {
  let request = new XMLHttpRequest()
  let details = { path: path, xhr: request }
  triggerEvent(document.body, 'htmx:historyCacheMiss', details)
  request.open('GET', path, true)
  request.setRequestHeader('HX-History-Restore-Request', 'true')
  request.onload = function () {
    if (this.status >= 200 && this.status < 400) {
      triggerEvent(document.body, 'htmx:historyCacheMissLoad', details)
      let fragment = makeFragment(this.response)
      fragment =
        fragment?.querySelector('[hx-history-elt],[data-hx-history-elt]') ||
        fragment
      const historyElement = getHistoryElement()
      const settleInfo = makeSettleInfo(historyElement)
      const title = findTitle(this.response)
      if (title) {
        var titleElt = find('title')
        if (titleElt) {
          titleElt.innerHTML = title
        } else {
          window.document.title = title
        }
      }
      // @ts-ignore
      swapInnerHTML(historyElement, fragment, settleInfo)
      settleImmediately(settleInfo.tasks)
      currentPathForHistory = path
      triggerEvent(document.body, 'htmx:historyRestore', {
        path: path,
        cacheMiss: true,
        serverResponse: this.response,
      })
    } else {
      triggerErrorEvent(
        document.body,
        'htmx:historyCacheMissLoadError',
        details,
      )
    }
  }
  request.send()
}

export function restoreHistory(path?: string) {
  saveCurrentPageToHistory()
  path = path || currentPath()
  const cached = getCachedHistory(path)
  if (cached) {
    const fragment = makeFragment(cached.content)
    const historyElement = getHistoryElement()
    const settleInfo = makeSettleInfo(historyElement)
    swapInnerHTML(historyElement, fragment, settleInfo)
    settleImmediately(settleInfo.tasks)
    document.title = cached.title
    window.scrollTo(0, cached.scroll)
    currentPathForHistory = path
    triggerEvent(document.body, 'htmx:historyRestore', {
      path: path,
      item: cached,
    })
  } else {
    if (config.refreshOnHistoryMiss) {
      // @ts-ignore: optional parameter in reload() function throws error
      window.location.reload(true)
    } else {
      loadHistoryFromServer(path)
    }
  }
}

export function addRequestIndicatorClasses(elt: Element) {
  let indicators = findAttributeTargets(elt, 'hx-indicator')
  if (!indicators) {
    indicators = [elt]
  }
  indicators.forEach((ic) => {
    if (!ic) throw new Error('no indicator')
    var internalData = getInternalData(ic)
    internalData.requestCount = (internalData.requestCount || 0) + 1
    ic.classList['add'].call(ic.classList, config.requestClass)
  })
  return indicators
}

export function removeRequestIndicatorClasses(indicators: Element[]) {
  indicators.forEach((ic) => {
    var internalData = getInternalData(ic)
    internalData.requestCount = (internalData.requestCount || 0) - 1
    if (internalData.requestCount === 0) {
      ic.classList['remove'].call(ic.classList, config.requestClass)
    }
  })
}

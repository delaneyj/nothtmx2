import { getSwapSpecification, makeSettleInfo } from './ajax'
import { triggerErrorEvent, triggerEvent, withExtensions } from './events'
import { settleImmediately } from './history'
import { getTarget, selectAndSwap } from './node-processing'
import { getClosestMatch, getInternalData, splitOnWhitespace } from './utils'

export function processSSEInfo(elt: Element, info: string) {
  const values = splitOnWhitespace(info)
  for (let i = 0; i < values.length; i++) {
    const [tag, url] = values[i].split(/:(.+)/)
    if (tag === 'connect') {
      processSSESource(elt, url)
    }

    if (tag === 'swap') {
      processSSESwap(elt, url)
    }
  }
}

export function processSSESource(elt: Element, sseSrcURL: string) {
  const source = new EventSource(sseSrcURL, { withCredentials: true })
  source.onerror = (e) => {
    triggerErrorEvent(elt, 'htmx:sseError', { error: e, source: source })
    maybeCloseSSESource(elt)
  }
  getInternalData(elt).sseEventSource = source
}

export function processSSESwap(elt: Element, sseEventName: string) {
  const sseSourceElt = getClosestMatch(elt, hasEventSource)
  if (sseSourceElt) {
    const sseEventSource = getInternalData(sseSourceElt).sseEventSource
    const sseListener = (event: any) => {
      if (maybeCloseSSESource(sseSourceElt)) {
        sseEventSource.removeEventListener(sseEventName, sseListener)
        return
      }

      ///////////////////////////
      // TODO: merge this code with AJAX and WebSockets code in the future.

      let response = event.data
      withExtensions(elt, function (extension) {
        response = extension.transformResponse(response, null, elt)
      })

      const swapSpec = getSwapSpecification(elt)
      const target = getTarget(elt)
      const settleInfo = makeSettleInfo(elt)

      if (!target) throw new Error('no target found for SSE swap')

      selectAndSwap(swapSpec.swapStyle, elt, target, response, settleInfo)
      settleImmediately(settleInfo.tasks)
      triggerEvent(elt, 'htmx:sseMessage', event)
    }

    getInternalData(elt).sseListener = sseListener
    sseEventSource.addEventListener(sseEventName, sseListener)
  } else {
    triggerErrorEvent(elt, 'htmx:noSSESourceError')
  }
}

export function processSSETrigger(
  elt: Element,
  handler: Function,
  sseEventName: string,
) {
  const sseSourceElt = getClosestMatch(elt, hasEventSource)
  if (sseSourceElt) {
    const sseEventSource = getInternalData(sseSourceElt).sseEventSource
    const sseListener = function () {
      if (!maybeCloseSSESource(sseSourceElt)) {
        if (document.body.contains(elt)) {
          handler(elt)
        } else {
          sseEventSource.removeEventListener(sseEventName, sseListener)
        }
      }
    }
    getInternalData(elt).sseListener = sseListener
    sseEventSource.addEventListener(sseEventName, sseListener)
  } else {
    triggerErrorEvent(elt, 'htmx:noSSESourceError')
  }
}

export function maybeCloseSSESource(elt: Element) {
  if (!document.body.contains(elt)) {
    getInternalData(elt).sseEventSource.close()
    return true
  }
  return false
}

export function hasEventSource(node: Element) {
  return getInternalData(node).sseEventSource != null
}

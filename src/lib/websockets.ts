import {
  filterValues,
  getExpressionVars,
  getHeaders,
  makeSettleInfo,
} from './ajax'
import { config } from './config'
import { triggerErrorEvent, triggerEvent, withExtensions } from './events'
import { settleImmediately } from './history'
import { getInputValues } from './input-value-processing'
import { getTriggerSpecs, oobSwap, shouldCancel } from './node-processing'
import {
  getAttributeValue,
  getClosestMatch,
  getInternalData,
  makeFragment,
  splitOnWhitespace,
} from './utils'

export function processWebSocketInfo(elt: Element, info: any) {
  const values = splitOnWhitespace(info)
  for (let i = 0; i < values.length; i++) {
    const [tag, url] = values[i].split(/:(.+)/)
    if (tag === 'connect') {
      ensureWebSocket(elt, url, 0)
    }
    if (tag === 'send') {
      processWebSocketSend(elt)
    }
  }
}

export function ensureWebSocket(
  elt: Element,
  wssSourceURL: string,
  retryCount: number,
) {
  if (!document.body.contains(elt)) {
    return // stop ensuring websocket connection when socket bearing element ceases to exist
  }

  if (wssSourceURL.indexOf('/') == 0) {
    // complete absolute paths only
    const base_part =
      location.hostname + (location.port ? ':' + location.port : '')
    if (location.protocol == 'https:') {
      wssSourceURL = 'wss://' + base_part + wssSourceURL
    } else if (location.protocol == 'http:') {
      wssSourceURL = 'ws://' + base_part + wssSourceURL
    }
  }

  const socket = new WebSocket(wssSourceURL, [])
  socket.binaryType = config.wsBinaryType
  socket.onerror = function (e) {
    triggerErrorEvent(elt, 'htmx:wsError', { error: e, socket: socket })
    maybeCloseWebSocketSource(elt)
  }

  socket.onclose = function (e) {
    if ([1006, 1012, 1013].indexOf(e.code) >= 0) {
      // Abnormal Closure/Service Restart/Try Again Later
      const delay = getWebSocketReconnectDelay(retryCount)
      setTimeout(function () {
        ensureWebSocket(elt, wssSourceURL, retryCount + 1) // creates a websocket with a new timeout
      }, delay)
    }
  }
  socket.onopen = () => {
    retryCount = 0
  }

  getInternalData(elt).webSocket = socket
  socket.addEventListener('message', function (event) {
    if (maybeCloseWebSocketSource(elt)) {
      return
    }

    let response = event.data
    withExtensions(elt, (extension) => {
      response = extension.transformResponse(response, null, elt)
    })

    const settleInfo = makeSettleInfo(elt)
    const fragment = makeFragment(response)
    const children = Array.from(fragment?.children || [])
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      oobSwap(
        getAttributeValue(child, 'hx-swap-oob') || 'true',
        child,
        settleInfo,
      )
    }

    settleImmediately(settleInfo.tasks)
  })
}

export function maybeCloseWebSocketSource(elt: Element) {
  if (!document.body.contains(elt)) {
    getInternalData(elt).webSocket.close()
    return true
  }
  return false
}

export function processWebSocketSend(elt: Element) {
  const webSocketSourceElt = getClosestMatch(elt, function (parent) {
    return getInternalData(parent).webSocket != null
  })
  if (webSocketSourceElt) {
    elt.addEventListener(getTriggerSpecs(elt)[0].trigger, function (evt) {
      const webSocket = getInternalData(webSocketSourceElt).webSocket
      const headers = getHeaders(elt, webSocketSourceElt)
      const results = getInputValues(elt, 'post')
      const errors = results.errors
      const rawParameters = results.values
      const expressionVars = getExpressionVars(elt)
      const allParameters = Object.assign(rawParameters, expressionVars)
      const filteredParameters = filterValues(allParameters, elt)
      filteredParameters['HEADERS'] = headers
      if (errors && errors.length > 0) {
        triggerEvent(elt, 'htmx:validation:halted', errors)
        return
      }
      webSocket.send(JSON.stringify(filteredParameters))
      if (shouldCancel(evt, elt)) {
        evt.preventDefault()
      }
    })
  } else {
    triggerErrorEvent(elt, 'htmx:noWebSocketSourceError')
  }
}

export function getWebSocketReconnectDelay(retryCount: number) {
  const delay = config.wsReconnectDelay
  if (typeof delay === 'function') {
    return delay(retryCount)
  } else if (delay === 'full-jitter') {
    const exp = Math.min(retryCount, 6)
    const maxDelay = 1000 * Math.pow(2, exp)
    return maxDelay * Math.random()
  }

  throw new Error(
    "htmx.config.wsReconnectDelay must either be a function or the string 'full-jitter'",
  )
}

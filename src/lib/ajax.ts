import { config, SwapStyle, SwapStyles } from './config'
import { triggerErrorEvent, triggerEvent, withExtensions } from './events'
import {
  addRequestIndicatorClasses,
  pushUrlIntoHistory,
  removeRequestIndicatorClasses,
  replaceUrlInHistory,
  saveCurrentPageToHistory,
} from './history'
import {
  getInputValues,
  makeFormData,
  urlEncode,
} from './input-value-processing'
import {
  DUMMY_ELT,
  findThisElement,
  getTarget,
  handleTrigger,
  selectAndSwap,
  SettleInfo,
} from './node-processing'
import { find, querySelectorExt, resolveTarget } from './public'
import {
  getAttributeValue,
  getClosestAttributeValue,
  getInternalData,
  getRawAttribute,
  matches,
  parseInterval,
  splitOnWhitespace,
} from './utils'

export interface ResponseInfo {
  xhr: XMLHttpRequest
  etc: boolean
  pathInfo: string
}

export function getHeaders(elt: Element, target: Element, prompt?: string) {
  const headers: Record<string, string> = {
    'HX-Request': 'true',
    'HX-Current-URL': document.location.href,
  }

  const trigger = getRawAttribute(elt, 'id')
  if (trigger) {
    headers['HX-Trigger'] = trigger
  }

  const targetName = getRawAttribute(target, 'name')
  if (targetName) {
    headers['HX-Target-Name'] = targetName
  }

  const targetValue = getRawAttribute(target, 'id')
  if (targetValue) {
    headers['HX-Target'] = targetValue
  }

  getValuesForElement(
    elt,
    'hx-headers',
    false,
    headers as Record<string, string>,
  )
  if (prompt) {
    headers['HX-Prompt'] = prompt
  }
  if (getInternalData(elt).boosted) {
    headers['HX-Boosted'] = 'true'
  }
  return headers
}

// takes an object containing form input values and returns a new object that only
// contains keys that are specified by the closest "hx-params" attribute
export function filterValues(
  inputValues: Record<string, string>,
  elt: Element,
) {
  const paramsValue = getClosestAttributeValue(elt, 'hx-params')
  if (paramsValue) {
    if (paramsValue === 'none') {
      return {}
    } else if (paramsValue === '*') {
      return inputValues
    } else if (paramsValue.indexOf('not ') === 0) {
      paramsValue
        .substring(4)
        .split(',')
        .forEach((name) => {
          name = name.trim()
          delete inputValues[name]
        })
      return inputValues
    } else {
      const newValues: Record<string, string> = {}
      paramsValue.split(',').forEach((name) => {
        name = name.trim()
        newValues[name] = inputValues[name]
      })
      return newValues
    }
  } else {
    return inputValues
  }
}

export function isAnchorLink(elt: Element) {
  const hrefHashIndex = getRawAttribute(elt, 'href')?.indexOf('#')
  return (hrefHashIndex && hrefHashIndex >= 0) || false
}

export interface SwapSpecification {
  swapStyle: SwapStyle
  swapDelayMs: number
  settleDelayMs: number
  scroll?: string
  scrollTarget?: string
  show?: string
  showTarget?: string
  focusScroll?: boolean
  pollInterval?: number
  path?: string
}
export function getSwapSpecification(elt: Element, swapInfoOverride?: string) {
  const swapInfo = swapInfoOverride
    ? swapInfoOverride
    : getClosestAttributeValue(elt, 'hx-swap')
  const swapSpec: SwapSpecification = {
    swapStyle: getInternalData(elt).boosted
      ? 'innerHTML'
      : config.defaultSwapStyle,
    swapDelayMs: config.defaultSwapDelayMs,
    settleDelayMs: config.defaultSettleDelayMs,
  }
  if (getInternalData(elt).boosted && !isAnchorLink(elt)) {
    swapSpec['show'] = 'top'
  }
  if (swapInfo) {
    const split = splitOnWhitespace(swapInfo)
    if (split.length > 0) {
      const possibleSwapStyle = split[0] as SwapStyle
      if (!Object.values(SwapStyles).includes(possibleSwapStyle)) {
        throw new Error(`Invalid swap style: ${possibleSwapStyle}`)
      }
      swapSpec.swapStyle = possibleSwapStyle

      for (let i = 1; i < split.length; i++) {
        const modifier = split[i]
        if (modifier.indexOf('swap:') === 0) {
          swapSpec.swapDelayMs = parseInterval(modifier.substring(5))
        }
        if (modifier.indexOf('settle:') === 0) {
          swapSpec.settleDelayMs = parseInterval(modifier.substring(7))
        }
        if (modifier.indexOf('scroll:') === 0) {
          const scrollSpec = modifier.substr(7)
          const splitSpec = scrollSpec.split(':')
          const scrollVal = splitSpec.pop()
          const selectorVal = splitSpec.length > 0 ? splitSpec.join(':') : null
          swapSpec.scroll = scrollVal
          swapSpec.scrollTarget = selectorVal || undefined
        }
        if (modifier.indexOf('show:') === 0) {
          const showSpec = modifier.substr(5)
          const splitSpec = showSpec.split(':')
          const showVal = splitSpec.pop()
          const selectorVal = splitSpec.length > 0 ? splitSpec.join(':') : null
          swapSpec.show = showVal
          swapSpec.showTarget = selectorVal || undefined
        }
        if (modifier.indexOf('focus-scroll:') === 0) {
          const focusScrollVal = modifier.substr('focus-scroll:'.length)
          swapSpec.focusScroll = focusScrollVal == 'true'
        }
      }
    }
  }
  return swapSpec
}

export function usesFormData(elt: Element) {
  return (
    getClosestAttributeValue(elt, 'hx-encoding') === 'multipart/form-data' ||
    (matches(elt, 'form') &&
      getRawAttribute(elt, 'enctype') === 'multipart/form-data')
  )
}

export function encodeParamsForBody(
  xhr: XMLHttpRequest,
  elt: Element,
  filteredParameters: Record<string, string>,
) {
  const encodedParameters: Record<string, string> | null = null
  withExtensions(elt, function (extension) {
    if (!encodedParameters) {
      encodedParameters = extension.encodeParameters(
        xhr,
        filteredParameters,
        elt,
      )
    }
  })
  if (encodedParameters != null) {
    return encodedParameters
  } else {
    if (usesFormData(elt)) {
      return makeFormData(filteredParameters)
    } else {
      return urlEncode(filteredParameters)
    }
  }
}

export function makeSettleInfo(target: Element) {
  const si: SettleInfo = { tasks: [], elts: [target] }
  return si
}

export function updateScrollState(
  content: Element[],
  swapSpec: SwapSpecification,
) {
  const first = content[0]
  const last = content[content.length - 1]
  if (swapSpec.scroll) {
    let target = null
    if (swapSpec.scrollTarget) {
      target = querySelectorExt(first, swapSpec.scrollTarget)
    }
    if (swapSpec.scroll === 'top' && (first || target)) {
      target = target || first
      target.scrollTop = 0
    }
    if (swapSpec.scroll === 'bottom' && (last || target)) {
      target = target || last
      target.scrollTop = target.scrollHeight
    }
  }
  if (swapSpec.show) {
    let target = null
    if (swapSpec.showTarget) {
      let targetStr = swapSpec.showTarget
      if (swapSpec.showTarget === 'window') {
        targetStr = 'body'
      }
      target = querySelectorExt(first, targetStr)
    }
    if (swapSpec.show === 'top' && (first || target)) {
      target = target || first
      target.scrollIntoView({
        block: 'start',
        behavior: config.scrollBehavior,
      })
    }
    if (swapSpec.show === 'bottom' && (last || target)) {
      target = target || last
      target.scrollIntoView({
        block: 'end',
        behavior: config.scrollBehavior,
      })
    }
  }
}

export function getValuesForElement(
  elt: Element | undefined,
  attr: string,
  evalAsDefault = false,
  values: Record<string, string> = {},
): Record<string, string> {
  if (!elt) return values

  const attributeValue = getAttributeValue(elt, attr)
  if (attributeValue) {
    let str = attributeValue.trim()
    let evaluateValue = evalAsDefault
    if (str === 'unset') return {}

    if (str.indexOf('javascript:') === 0) {
      str = str.substring(11)
      evaluateValue = true
    } else if (str.indexOf('js:') === 0) {
      str = str.substring(3)
      evaluateValue = true
    }
    if (str.indexOf('{') !== 0) {
      str = '{' + str + '}'
    }
    let varsValues
    if (evaluateValue) {
      varsValues = maybeEval(
        elt,
        function () {
          return Function('return (' + str + ')')()
        },
        {},
      )
    } else {
      varsValues = JSON.parse(str)
    }
    for (const key in varsValues) {
      if (varsValues.hasOwnProperty(key)) {
        if (values[key] == null) {
          values[key] = varsValues[key]
        }
      }
    }
  }

  if (elt.parentElement) {
    return getValuesForElement(elt.parentElement, attr, evalAsDefault, values)
  }
  return values
}

export function maybeEval<T>(elt: Element, toEval: () => T, defaultVal?: T) {
  if (config.allowEval) {
    return toEval()
  } else {
    triggerErrorEvent(elt, 'htmx:evalDisallowedError')
    return defaultVal
  }
}

export function getHXVarsForElement(
  elt: Element,
  expressionVars?: Record<string, string>,
) {
  return getValuesForElement(elt, 'hx-vars', true, expressionVars)
}

export function getHXValsForElement(
  elt: Element,
  expressionVars?: Record<string, string>,
) {
  return getValuesForElement(elt, 'hx-vals', false, expressionVars)
}

export function getExpressionVars(elt: Element) {
  return Object.assign(getHXVarsForElement(elt), getHXValsForElement(elt))
}

export function safelySetHeaderValue(
  xhr: XMLHttpRequest,
  header: string,
  headerValue?: string,
) {
  if (headerValue) {
    try {
      xhr.setRequestHeader(header, headerValue)
    } catch (e) {
      // On an exception, try to set the header URI encoded instead
      xhr.setRequestHeader(header, encodeURIComponent(headerValue))
      xhr.setRequestHeader(header + '-URI-AutoEncoded', 'true')
    }
  }
}

export function getPathFromResponse(xhr: XMLHttpRequest) {
  // NB: IE11 does not support this stuff
  if (xhr.responseURL && typeof URL !== 'undefined') {
    try {
      const url = new URL(xhr.responseURL)
      return url.pathname + url.search
    } catch (e) {
      triggerErrorEvent(document.body, 'htmx:badResponseUrl', {
        url: xhr.responseURL,
      })
    }
  }

  throw new Error('No path found')
}

export function hasHeader(xhr: XMLHttpRequest, regexp: RegExp) {
  return xhr.getAllResponseHeaders().match(regexp)
}

export function ajaxHelper(
  verb: string,
  path: string,
  context: Element | string,
) {
  verb = verb.toLowerCase()
  if (context) {
    if (context instanceof Element || typeof context === 'string') {
      return issueAjaxRequest(verb, path, null, null, {
        targetOverride: resolveTarget(context),
        returnPromise: true,
      })
    }

    const resolvedSource = resolveTarget(context.source)
    if (!resolvedSource) {
      throw new Error('No source element found')
    }

    return issueAjaxRequest(verb, path, resolvedSource, context.event, {
      handler: context.handler,
      headers: context.headers,
      values: context.values,
      targetOverride: resolveTarget(context.target),
      swapOverride: context.swap,
      returnPromise: true,
    })
  } else {
    return issueAjaxRequest(verb, path, null, null, {
      returnPromise: true,
    })
  }
}

export function hierarchyForElt(start: Element) {
  const arr = []
  let current: Element | null = start
  while (current) {
    arr.push(current)
    current = current.parentElement
  }
  return arr
}

export async function issueAjaxRequest(
  verb: string,
  path: string,
  elt: Element = document.body,
  event: Element,
  confirmed?: boolean,
  handler?: (elt: Element, event: Event, xhr?: XMLHttpRequest) => void,
  targetOverride?: Element,
) {
  const responseHandler = handler || handleAjaxResponse

  // do not issue requests for elements removed from the DOM
  if (!document.body.contains(elt)) return

  const target = targetOverride || getTarget(elt)
  if (target == null || target == DUMMY_ELT) {
    triggerErrorEvent(elt, 'htmx:targetError', {
      target: getAttributeValue(elt, 'hx-target'),
    })
    return
  }

  // allow event-based confirmation w/ a callback
  if (!confirmed) {
    const issueRequest = function () {
      return issueAjaxRequest(verb, path, elt, event, true)
    }
    const confirmDetails = {
      target: target,
      elt: elt,
      path: path,
      verb: verb,
      triggeringEvent: event,
      issueRequest: issueRequest,
    }
    if (triggerEvent(elt, 'htmx:confirm', confirmDetails) === false) {
      return
    }
  }

  let syncElt: Element | null = elt
  let syncStrategy = getClosestAttributeValue(elt, 'hx-sync')
  let eltData = getInternalData(elt)
  let queueStrategy = null
  let abortable = false
  if (syncStrategy) {
    const syncStrings = syncStrategy.split(':')
    const selector = syncStrings[0].trim()
    if (selector === 'this') {
      syncElt = findThisElement(elt, 'hx-sync')
    } else {
      syncElt = querySelectorExt(elt, selector)
    }
    // default to the drop strategy
    syncStrategy = (syncStrings[1] || 'drop').trim()
    eltData = getInternalData(syncElt)
    if (syncStrategy === 'drop' && eltData.xhr && eltData.abortable !== true) {
      return
    } else if (syncStrategy === 'abort') {
      if (eltData.xhr) {
        return
      } else {
        abortable = true
      }
    } else if (syncStrategy === 'replace') {
      triggerEvent(syncElt, 'htmx:abort') // abort the current request and continue
    } else if (syncStrategy.indexOf('queue') === 0) {
      const queueStrArray = syncStrategy.split(' ')
      queueStrategy = (queueStrArray[1] || 'last').trim()
    }
  }

  if (eltData.xhr) {
    if (eltData.abortable) {
      triggerEvent(syncElt, 'htmx:abort') // abort the current request and continue
    } else {
      if (queueStrategy == null) {
        if (event) {
          const eventData = getInternalData(event)
          if (
            eventData &&
            eventData.triggerSpec &&
            eventData.triggerSpec.queue
          ) {
            queueStrategy = eventData.triggerSpec.queue
          }
        }
        if (queueStrategy == null) {
          queueStrategy = 'last'
        }
      }
      if (eltData.queuedRequests == null) {
        eltData.queuedRequests = []
      }
      if (queueStrategy === 'first' && eltData.queuedRequests.length === 0) {
        eltData.queuedRequests.push(function () {
          issueAjaxRequest(verb, path, elt, event)
        })
      } else if (queueStrategy === 'all') {
        eltData.queuedRequests.push(function () {
          issueAjaxRequest(verb, path, elt, event)
        })
      } else if (queueStrategy === 'last') {
        eltData.queuedRequests = [] // dump existing queue
        eltData.queuedRequests.push(function () {
          issueAjaxRequest(verb, path, elt, event)
        })
      }
      return
    }
  }

  const xhr = new XMLHttpRequest()
  eltData.xhr = xhr
  eltData.abortable = abortable
  const endRequestLock = function () {
    eltData.xhr = null
    eltData.abortable = false
    if (eltData.queuedRequests != null && eltData.queuedRequests.length > 0) {
      const queuedRequest = eltData.queuedRequests.shift()
      queuedRequest()
    }
  }
  const promptQuestion = getClosestAttributeValue(elt, 'hx-prompt')
  let promptResponse
  if (promptQuestion) {
    promptResponse = prompt(promptQuestion)
    // prompt returns null if cancelled and empty string if accepted with no entry
    if (
      promptResponse === null ||
      !triggerEvent(elt, 'htmx:prompt', {
        prompt: promptResponse,
        target: target,
      })
    ) {
      endRequestLock()
      return
    }
  }

  const confirmQuestion = getClosestAttributeValue(elt, 'hx-confirm')
  if (confirmQuestion) {
    if (!confirm(confirmQuestion)) {
      endRequestLock()
      return
    }
  }

  let headers = getHeaders(elt, target, promptResponse)
  if (headers) {
    headers = Object.assign(headers, etc.headers)
  }
  const results = getInputValues(elt, verb)
  let errors = results.errors
  const rawParameters = results.values
  if (etc.values) {
    rawParameters = Object.assign(rawParameters, etc.values)
  }
  const expressionVars = getExpressionVars(elt)
  const allParameters = Object.assign(rawParameters, expressionVars)
  let filteredParameters = filterValues(allParameters, elt)

  if (verb !== 'get' && !usesFormData(elt)) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  if (config.getCacheBusterParam && verb === 'get') {
    filteredParameters['org.htmx.cache-buster'] =
      getRawAttribute(target, 'id') || 'true'
  }

  // behavior of anchors w/ empty href is to use the current URL
  if (path == null || path === '') {
    path = document.location.href
  }

  const requestAttrValues = getValuesForElement(elt, 'hx-request')

  const eltIsBoosted = getInternalData(elt).boosted
  const requestConfig = {
    boosted: eltIsBoosted,
    parameters: filteredParameters,
    unfilteredParameters: allParameters,
    headers: headers,
    target: target,
    verb: verb,
    errors: errors,
    withCredentials:
      etc.credentials ||
      requestAttrValues.credentials ||
      config.withCredentials,
    timeout: etc.timeout || requestAttrValues.timeout || config.timeout,
    path: path,
    triggeringEvent: event,
  }

  if (!triggerEvent(elt, 'htmx:configRequest', requestConfig)) {
    resolve?.()
    endRequestLock()
    return promise
  }

  // copy out in case the object was overwritten
  path = requestConfig.path
  verb = requestConfig.verb
  headers = requestConfig.headers
  filteredParameters = requestConfig.parameters
  errors = requestConfig.errors

  if (errors && errors.length > 0) {
    triggerEvent(elt, 'htmx:validation:halted', requestConfig)
    resolve?.()
    endRequestLock()
    return promise
  }

  const splitPath = path.split('#')
  const pathNoAnchor = splitPath[0]
  const anchor = splitPath[1]
  let finalPathForGet = null
  if (verb === 'get') {
    finalPathForGet = pathNoAnchor
    const values = Object.keys(filteredParameters).length !== 0
    if (values) {
      if (finalPathForGet.indexOf('?') < 0) {
        finalPathForGet += '?'
      } else {
        finalPathForGet += '&'
      }
      finalPathForGet += urlEncode(filteredParameters)
      if (anchor) {
        finalPathForGet += '#' + anchor
      }
    }
    xhr.open('GET', finalPathForGet, true)
  } else {
    xhr.open(verb.toUpperCase(), path, true)
  }

  xhr.overrideMimeType('text/html')
  xhr.withCredentials = requestConfig.withCredentials
  xhr.timeout = requestConfig.timeout

  // request headers
  if (requestAttrValues.noHeaders) {
    // ignore all headers
  } else {
    for (const header in headers) {
      if (headers.hasOwnProperty(header)) {
        const headerValue = headers[header]
        safelySetHeaderValue(xhr, header, headerValue)
      }
    }
  }

  const responseInfo = {
    xhr,
    target,
    requestConfig,
    etc,
    boosted: eltIsBoosted,
    pathInfo: {
      requestPath: path,
      finalRequestPath: finalPathForGet || path,
      anchor,
    },
  }

  xhr.onload = function () {
    try {
      const hierarchy = hierarchyForElt(elt)
      responseInfo.pathInfo.responsePath = getPathFromResponse(xhr)
      responseHandler(elt, responseInfo)
      removeRequestIndicatorClasses(indicators)
      triggerEvent(elt, 'htmx:afterRequest', responseInfo)
      triggerEvent(elt, 'htmx:afterOnLoad', responseInfo)
      // if the body no longer contains the element, trigger the even on the closest parent
      // remaining in the DOM
      if (!document.body.contains(elt)) {
        const secondaryTriggerElt = null
        while (hierarchy.length > 0 && secondaryTriggerElt == null) {
          const parentEltInHierarchy = hierarchy.shift()
          if (document.body.contains(parentEltInHierarchy)) {
            secondaryTriggerElt = parentEltInHierarchy
          }
        }
        if (secondaryTriggerElt) {
          triggerEvent(secondaryTriggerElt, 'htmx:afterRequest', responseInfo)
          triggerEvent(secondaryTriggerElt, 'htmx:afterOnLoad', responseInfo)
        }
      }
      resolve?.()
      endRequestLock()
    } catch (e) {
      triggerErrorEvent(
        elt,
        'htmx:onLoadError',
        Object.assign({ error: e }, responseInfo),
      )
      throw e
    }
  }
  xhr.onerror = function () {
    removeRequestIndicatorClasses(indicators)
    triggerErrorEvent(elt, 'htmx:afterRequest', responseInfo)
    triggerErrorEvent(elt, 'htmx:sendError', responseInfo)
    maybeCall(reject)
    endRequestLock()
  }
  xhr.onabort = function () {
    removeRequestIndicatorClasses(indicators)
    triggerErrorEvent(elt, 'htmx:afterRequest', responseInfo)
    triggerErrorEvent(elt, 'htmx:sendAbort', responseInfo)
    maybeCall(reject)
    endRequestLock()
  }
  xhr.ontimeout = function () {
    removeRequestIndicatorClasses(indicators)
    triggerErrorEvent(elt, 'htmx:afterRequest', responseInfo)
    triggerErrorEvent(elt, 'htmx:timeout', responseInfo)
    maybeCall(reject)
    endRequestLock()
  }
  if (!triggerEvent(elt, 'htmx:beforeRequest', responseInfo)) {
    maybeCall(resolve)
    endRequestLock()
    return promise
  }
  const indicators = addRequestIndicatorClasses(elt)[
    ('loadstart', 'loadend', 'progress', 'abort')
  ].forEach((eventName) => {
    ;[xhr, xhr.upload].forEach((target) => {
      target.addEventListener(eventName, (event) => {
        triggerEvent(elt, 'htmx:xhr:' + eventName, {
          lengthComputable: event.lengthComputable,
          loaded: event.loaded,
          total: event.total,
        })
      })
    })
  })
  triggerEvent(elt, 'htmx:beforeSend', responseInfo)
  xhr.send(
    verb === 'get' ? null : encodeParamsForBody(xhr, elt, filteredParameters),
  )
}

export function determineHistoryUpdates(
  elt: Element,
  responseInfo: ResponseInfo,
) {
  const xhr = responseInfo.xhr

  // First consult response headers
  let pathFromHeaders = null
  let typeFromHeaders = null
  if (hasHeader(xhr, /HX-Push:/i)) {
    pathFromHeaders = xhr.getResponseHeader('HX-Push')
    typeFromHeaders = 'push'
  } else if (hasHeader(xhr, /HX-Push-Url:/i)) {
    pathFromHeaders = xhr.getResponseHeader('HX-Push-Url')
    typeFromHeaders = 'push'
  } else if (hasHeader(xhr, /HX-Replace-Url:/i)) {
    pathFromHeaders = xhr.getResponseHeader('HX-Replace-Url')
    typeFromHeaders = 'replace'
  }

  // if there was a response header, that has priority
  if (pathFromHeaders) {
    if (pathFromHeaders === 'false') {
      return {}
    } else {
      return {
        type: typeFromHeaders,
        path: pathFromHeaders,
      }
    }
  }

  //===========================================
  // Next resolve via DOM values
  //===========================================
  const requestPath = responseInfo.pathInfo.finalRequestPath
  const responsePath = responseInfo.pathInfo.responsePath

  const pushUrl = getClosestAttributeValue(elt, 'hx-push-url')
  const replaceUrl = getClosestAttributeValue(elt, 'hx-replace-url')
  const elementIsBoosted = getInternalData(elt).boosted

  let saveType = null
  let path = null

  if (pushUrl) {
    saveType = 'push'
    path = pushUrl
  } else if (replaceUrl) {
    saveType = 'replace'
    path = replaceUrl
  } else if (elementIsBoosted) {
    saveType = 'push'
    path = responsePath || requestPath // if there is no response path, go with the original request path
  }

  if (path) {
    // false indicates no push, return empty object
    if (path === 'false') {
      return {}
    }

    // true indicates we want to follow wherever the server ended up sending us
    if (path === 'true') {
      path = responsePath || requestPath // if there is no response path, go with the original request path
    }

    // restore any anchor associated with the request
    if (responseInfo.pathInfo.anchor && path.indexOf('#') === -1) {
      path = path + '#' + responseInfo.pathInfo.anchor
    }

    return {
      type: saveType,
      path: path,
    }
  } else {
    return {}
  }
}

function handleAjaxResponse(elt: Element, responseInfo: ResponseInfo) {
  const xhr = responseInfo.xhr
  let target = responseInfo.target
  const etc = responseInfo.etc

  if (!triggerEvent(elt, 'htmx:beforeOnLoad', responseInfo)) return

  if (hasHeader(xhr, /HX-Trigger:/i)) {
    handleTrigger(xhr, 'HX-Trigger', elt)
  }

  if (hasHeader(xhr, /HX-Location:/i)) {
    saveCurrentPageToHistory()
    const redirectPath = xhr.getResponseHeader('HX-Location')
    let swapSpec: SwapSpecification
    if (redirectPath?.indexOf('{') === 0) {
      swapSpec = JSON.parse(redirectPath)
      // what's the best way to throw an error if the user didn't include this
      redirectPath = swapSpec.path
      delete swapSpec['path']
    }
    ajaxHelper('GET', redirectPath, swapSpec).then(function () {
      pushUrlIntoHistory(redirectPath)
    })
    return
  }

  if (hasHeader(xhr, /HX-Redirect:/i)) {
    location.href = xhr.getResponseHeader('HX-Redirect')
    return
  }

  if (hasHeader(xhr, /HX-Refresh:/i)) {
    if ('true' === xhr.getResponseHeader('HX-Refresh')) {
      location.reload()
      return
    }
  }

  if (hasHeader(xhr, /HX-Retarget:/i)) {
    responseInfo.target = document.querySelector(
      xhr.getResponseHeader('HX-Retarget'),
    )
  }

  const historyUpdate = determineHistoryUpdates(elt, responseInfo)

  // by default htmx only swaps on 200 return codes and does not swap
  // on 204 'No Content'
  // this can be ovverriden by responding to the htmx:beforeSwap event and
  // overriding the detail.shouldSwap property
  const shouldSwap = xhr.status >= 200 && xhr.status < 400 && xhr.status !== 204
  const serverResponse = xhr.response
  const isError = xhr.status >= 400
  const beforeSwapDetails = Objec.assign(
    {
      shouldSwap: shouldSwap,
      serverResponse: serverResponse,
      isError: isError,
    },
    responseInfo,
  )
  if (!triggerEvent(target, 'htmx:beforeSwap', beforeSwapDetails)) return

  target = beforeSwapDetails.target // allow re-targeting
  serverResponse = beforeSwapDetails.serverResponse // allow updating content
  isError = beforeSwapDetails.isError // allow updating error

  responseInfo.failed = isError // Make failed property available to response events
  responseInfo.successful = !isError // Make successful property available to response events

  if (beforeSwapDetails.shouldSwap) {
    if (xhr.status === 286) {
      cancelPolling(elt)
    }

    withExtensions(elt, function (extension) {
      serverResponse = extension.transformResponse(serverResponse, xhr, elt)
    })

    // Save current page if there will be a history update
    if (historyUpdate.type) {
      saveCurrentPageToHistory()
    }

    const swapOverride = etc.swapOverride
    if (hasHeader(xhr, /HX-Reswap:/i)) {
      swapOverride = xhr.getResponseHeader('HX-Reswap')
    }
    const swapSpec = getSwapSpecification(elt, swapOverride)

    target.classList.add(config.swappingClass)
    const doSwap = function () {
      try {
        const activeElt = document.activeElement
        let selectionInfo: {
          elt?: Element
          start?: number
          end?: number
        } = {}
        try {
          selectionInfo = {
            elt: activeElt || undefined,
            // @ts-ignore
            start: activeElt ? activeElt.selectionStart : null,
            // @ts-ignore
            end: activeElt ? activeElt.selectionEnd : null,
          }
        } catch (e) {
          // safari issue - see https://github.com/microsoft/playwright/issues/5894
        }

        const settleInfo = makeSettleInfo(target)
        selectAndSwap(
          swapSpec.swapStyle,
          target,
          elt,
          serverResponse,
          settleInfo,
        )

        if (
          selectionInfo.elt &&
          !document.body.contains(selectionInfo.elt) &&
          selectionInfo.elt.id
        ) {
          const newActiveElt = document.getElementById(selectionInfo.elt.id)
          const focusOptions = {
            preventScroll:
              swapSpec.focusScroll !== undefined
                ? !swapSpec.focusScroll
                : !config.defaultFocusScroll,
          }
          if (newActiveElt) {
            // @ts-ignore
            if (selectionInfo.start && newActiveElt.setSelectionRange) {
              // @ts-ignore
              try {
                newActiveElt.setSelectionRange(
                  selectionInfo.start,
                  selectionInfo.end,
                )
              } catch (e) {
                // the setSelectionRange method is present on fields that don't support it, so just let this fail
              }
            }
            newActiveElt.focus(focusOptions)
          }
        }

        target.classList.remove(config.swappingClass)
        settleInfo.elts.forEach((elt) => {
          if (elt.classList) {
            elt.classList.add(config.settlingClass)
          }
          triggerEvent(elt, 'htmx:afterSwap', responseInfo)
        })

        if (hasHeader(xhr, /HX-Trigger-After-Swap:/i)) {
          let finalElt = elt
          if (!document.body.contains(elt)) {
            finalElt = document.body
          }
          handleTrigger(xhr, 'HX-Trigger-After-Swap', finalElt)
        }

        const doSettle = function () {
          settleInfo.tasks.forEach((task) => task())
          settleInfo.elts.forEach((elt) => {
            if (elt.classList) {
              elt.classList.remove(config.settlingClass)
            }
            triggerEvent(elt, 'htmx:afterSettle', responseInfo)
          })

          // if we need to save history, do so
          if (historyUpdate.type) {
            if (historyUpdate.type === 'push') {
              pushUrlIntoHistory(historyUpdate.path)
              triggerEvent(document.body, 'htmx:pushedIntoHistory', {
                path: historyUpdate.path,
              })
            } else {
              replaceUrlInHistory(historyUpdate.path)
              triggerEvent(document.body, 'htmx:replacedInHistory', {
                path: historyUpdate.path,
              })
            }
          }
          if (responseInfo.pathInfo.anchor) {
            const anchorTarget = find('#' + responseInfo.pathInfo.anchor)
            if (anchorTarget) {
              anchorTarget.scrollIntoView({ block: 'start', behavior: 'auto' })
            }
          }

          if (settleInfo.title) {
            const titleElt = find('title')
            if (titleElt) {
              titleElt.innerHTML = settleInfo.title
            } else {
              window.document.title = settleInfo.title
            }
          }

          updateScrollState(settleInfo.elts, swapSpec)

          if (hasHeader(xhr, /HX-Trigger-After-Settle:/i)) {
            let finalElt = elt
            if (!document.body.contains(elt)) {
              finalElt = document.body
            }
            handleTrigger(xhr, 'HX-Trigger-After-Settle', finalElt)
          }
        }

        if (swapSpec.settleDelayMs > 0) {
          setTimeout(doSettle, swapSpec.settleDelayMs)
        } else {
          doSettle()
        }
      } catch (e) {
        triggerErrorEvent(elt, 'htmx:swapError', responseInfo)
        throw e
      }
    }

    if (swapSpec.swapDelayMs > 0) {
      setTimeout(doSwap, swapSpec.swapDelayMs)
    } else {
      doSwap()
    }
  }
  if (isError) {
    triggerErrorEvent(
      elt,
      'htmx:responseError',
      Object.assign(
        {
          error:
            'Response Status Error Code ' +
            xhr.status +
            ' from ' +
            responseInfo.pathInfo.requestPath,
        },
        responseInfo,
      ),
    )
  }
}

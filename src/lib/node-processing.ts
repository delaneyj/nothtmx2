import { issueAjaxRequest, maybeEval } from './ajax'
import { config, SwapStyle } from './config'
import { makeEvent, triggerErrorEvent, triggerEvent } from './events'
import { getExtensions } from './extensions'
import { Task } from './history'
import {
  addClassToElement,
  closest,
  findAll,
  querySelectorAllExt,
  querySelectorExt,
  removeClassFromElement,
  resolveTarget,
} from './public'
import { processSSEInfo, processSSETrigger } from './sse'
import {
  getAttributeValue,
  getClosestAttributeValue,
  getClosestMatch,
  getInternalData,
  getRawAttribute,
  hasAttribute,
  isScrolledIntoView,
  makeFragment,
  matches,
  parseInterval,
} from './utils'
import { processWebSocketInfo } from './websockets'

export const DUMMY_ELT = document.createElement('output') // dummy element for bad selectors
export function findAttributeTargets(elt: Element, attrName: string) {
  const attrTarget = getClosestAttributeValue(elt, attrName)
  if (attrTarget) {
    if (attrTarget === 'this') {
      return [findThisElement(elt, attrName)]
    } else {
      const result = querySelectorAllExt(elt, attrTarget)
      if (result.length === 0) {
        console.error(
          `The selector ${attrTarget} on ${attrName} returned no matches!`,
        )
        return [DUMMY_ELT]
      } else {
        return result
      }
    }
  }

  throw new Error(`No attribute ${attrName} found on ${elt}`)
}

export function findThisElement(elt: Element, attribute: string) {
  return getClosestMatch(elt, function (elt) {
    return getAttributeValue(elt, attribute) != null
  })
}

export function getTarget(elt: Element) {
  const targetStr = getClosestAttributeValue(elt, 'hx-target')
  if (targetStr) {
    if (targetStr === 'this') {
      return findThisElement(elt, 'hx-target')
    } else {
      return querySelectorExt(elt, targetStr)
    }
  } else {
    const data = getInternalData(elt)
    if (data.boosted) {
      return document.body
    } else {
      return elt
    }
  }
}

export function shouldSettleAttribute(name: string) {
  const { attributesToSettle } = config
  for (var i = 0; i < attributesToSettle.length; i++) {
    if (name === attributesToSettle[i]) {
      return true
    }
  }
  return false
}

// TODO: revisit to remove any
export function cloneAttributes(mergeTo: any, mergeFrom: any) {
  mergeTo.attributes.forEach((attr: any) => {
    if (
      !mergeFrom.hasAttribute(attr.name) &&
      shouldSettleAttribute(attr.name)
    ) {
      mergeTo.removeAttribute(attr.name)
    }
  })
  mergeFrom.attributes.forEach((attr: any) => {
    if (shouldSettleAttribute(attr.name)) {
      mergeTo.setAttribute(attr.name, attr.value)
    }
  })
}

export function isInlineSwap(swapStyle: SwapStyle, target: Element) {
  const extensions = getExtensions(target)
  for (var i = 0; i < extensions.length; i++) {
    const extension = extensions[i]
    try {
      if (extension.isInlineSwap(swapStyle)) {
        return true
      }
    } catch (e) {
      console.error(e)
    }
  }
  return swapStyle === 'outerHTML'
}

export interface SettleInfo {
  title?: string
  elts: Element[]
  tasks: Task[]
}

// revisit to remove any
export function oobSwap(
  oobValue: string,
  oobElement: Element,
  settleInfo: SettleInfo,
) {
  let selector = `#${oobElement.id}`
  let swapStyle: SwapStyle = 'outerHTML'
  if (oobValue === 'true') {
    // do nothing
  } else if (oobValue.indexOf(':') > 0) {
    swapStyle = oobValue.substring(0, oobValue.indexOf(':')) as SwapStyle
    selector = oobValue.substring(oobValue.indexOf(':') + 1, oobValue.length)
  } else {
    swapStyle = oobValue as SwapStyle
  }

  if (!swapStyle) throw new Error('swapStyle is null')

  const targets = document.querySelectorAll(selector)
  if (targets) {
    Array.from(targets).forEach((target) => {
      let fragment
      const oobElementClone = oobElement.cloneNode(true)
      fragment = document.createDocumentFragment()
      fragment.appendChild(oobElementClone)
      if (!isInlineSwap(swapStyle, target)) {
        fragment = oobElementClone // if this is not an inline swap, we use the content of the node, not the node itself
      }

      const beforeSwapDetails = {
        shouldSwap: true,
        target: target,
        fragment: fragment,
      }
      if (!triggerEvent(target, 'htmx:oobBeforeSwap', beforeSwapDetails)) return

      target = beforeSwapDetails.target // allow re-targeting
      if (beforeSwapDetails['shouldSwap']) {
        swap(swapStyle, target, target, fragment, settleInfo)
      }
      settleInfo.elts.forEach((elt) => {
        triggerEvent(elt, 'htmx:oobAfterSwap', beforeSwapDetails)
      })
    })
    oobElement?.parentNode?.removeChild(oobElement)
  } else {
    oobElement?.parentNode?.removeChild(oobElement)
    triggerErrorEvent(document.body, 'htmx:oobErrorNoTarget', {
      content: oobElement,
    })
  }
  return oobValue
}

export function handleOutOfBandSwaps(
  elt: Element,
  fragment: DocumentFragment,
  settleInfo: SettleInfo,
) {
  const oobSelects = getClosestAttributeValue(elt, 'hx-select-oob')
  if (oobSelects) {
    const oobSelectValues = oobSelects.split(',')
    for (let i = 0; i < oobSelectValues.length; i++) {
      const oobSelectValue = oobSelectValues[i].split(':', 2)
      let id = oobSelectValue[0]
      if (id.indexOf('#') === 0) {
        id = id.substring(1)
      }
      const oobValue = oobSelectValue[1] || 'true'
      const oobElement = fragment.querySelector('#' + id)
      if (oobElement) {
        oobSwap(oobValue, oobElement, settleInfo)
      }
    }
  }
  findAll(fragment, '[hx-swap-oob], [data-hx-swap-oob]').forEach(
    (oobElement) => {
      const oobValue = getAttributeValue(oobElement, 'hx-swap-oob')
      if (oobValue != null) {
        oobSwap(oobValue, oobElement, settleInfo)
      }
    },
  )
}

export function handleAttributes(
  parentNode: Element,
  fragment: DocumentFragment,
  settleInfo: SettleInfo,
) {
  fragment.querySelectorAll('[id]').forEach((newNode) => {
    if (newNode.id && newNode.id.length > 0) {
      const oldNode = parentNode.querySelector(
        newNode.tagName + "[id='" + newNode.id + "']",
      )
      if (oldNode && oldNode !== parentNode) {
        const newAttributes = newNode.cloneNode()
        cloneAttributes(newNode, oldNode)
        settleInfo.tasks.push(function () {
          cloneAttributes(newNode, newAttributes)
        })
      }
    }
  })
}

export function makeAjaxLoadTask(child: Element) {
  return function () {
    removeClassFromElement(child, config.addedClass)
    processNode(child)
    processScripts(child)
    processFocus(child)
    triggerEvent(child, 'htmx:load')
  }
}

export function processFocus(child: Element) {
  const autofocus = '[autofocus]'
  const autoFocusedElt = matches(child, autofocus)
    ? child
    : child.querySelector(autofocus)
  if (autoFocusedElt != null) {
    autoFocusedElt.focus()
  }
}

export function insertNodesBefore(
  parentNode: Element,
  insertBefore: Element,
  fragment: DocumentFragment,
  settleInfo: SettleInfo,
) {
  handleAttributes(parentNode, fragment, settleInfo)
  while (fragment.childNodes.length > 0) {
    const child: Element | null = fragment.firstChild as Element
    if (!child) throw new Error('child is null')
    addClassToElement(child, config.addedClass)
    parentNode.insertBefore(child, insertBefore)
    if (
      child.nodeType !== Node.TEXT_NODE &&
      child.nodeType !== Node.COMMENT_NODE
    ) {
      settleInfo.tasks.push(makeAjaxLoadTask(child))
    }
  }
}

// based on https://gist.github.com/hyamamoto/fd435505d29ebfa3d9716fd2be8d42f0,
// derived from Java's string hashcode implementation
export function stringHash(s: string, hash: number) {
  let char = 0
  while (char < s.length) {
    hash = ((hash << 5) - hash + s.charCodeAt(char++)) | 0 // bitwise or ensures we have a 32-bit int
  }
  return hash
}

// TODO: no IE support, can we remove?
export function attributeHash(elt: Element) {
  let hash = 0
  // IE fix
  if (elt.attributes) {
    for (var i = 0; i < elt.attributes.length; i++) {
      const attribute = elt.attributes[i]
      if (attribute.value) {
        // only include attributes w/ actual values (empty is same as non-existent)
        hash = stringHash(attribute.name, hash)
        hash = stringHash(attribute.value, hash)
      }
    }
  }
  return hash
}

export function deInitNode(element: Element) {
  const internalData = getInternalData(element)
  if (internalData.webSocket) {
    internalData.webSocket.close()
  }
  if (internalData.sseEventSource) {
    internalData.sseEventSource.close()
  }
  if (internalData.listenerInfos) {
    internalData.listenerInfos.forEach((info) => {
      if (info.on) {
        info.on.removeEventListener(info.trigger, info.listener)
      }
    })
  }
}

export function cleanUpElement(element: Element) {
  triggerEvent(element, 'htmx:beforeCleanupElement')
  deInitNode(element)
  if (element.children) {
    // IE
    Array.from(element.children).forEach((child) => cleanUpElement(child))
  }
}

export function swapOuterHTML(
  target: Element,
  fragment: DocumentFragment,
  settleInfo: SettleInfo,
) {
  if (target.tagName === 'BODY') {
    return swapInnerHTML(target, fragment, settleInfo)
  } else {
    let newElt: Element | null = null
    const eltBeforeNewContent = target.previousSibling
    if (!target.parentElement) throw new Error('target has no parent')
    insertNodesBefore(target.parentElement, target, fragment, settleInfo)
    if (!eltBeforeNewContent) {
      newElt = (target.parentElement?.firstChild as Element) || null
    } else {
      newElt = (eltBeforeNewContent.nextSibling as Element) || null
    }
    getInternalData(target).replacedWith = newElt // tuck away so we can fire events on it later
    settleInfo.elts = [] // clear existing elements
    while (newElt && newElt !== target) {
      if (newElt.nodeType === Node.ELEMENT_NODE) {
        settleInfo.elts.push(newElt)
      }
      newElt = newElt.nextElementSibling
    }
    cleanUpElement(target)
    target.parentElement?.removeChild(target)
  }
}

export function swapAfterBegin(
  target: Element,
  fragment: DocumentFragment,
  settleInfo: SettleInfo,
) {
  if (!target.firstChild) throw new Error('target has no first child')
  return insertNodesBefore(
    target,
    target.firstChild as Element,
    fragment,
    settleInfo,
  )
}

export function swapBeforeBegin(
  target: Element,
  fragment: DocumentFragment,
  settleInfo: SettleInfo,
) {
  if (!target.parentElement) throw new Error('target has no parent')
  return insertNodesBefore(target.parentElement, target, fragment, settleInfo)
}

export function swapBeforeEnd(
  target: Element,
  fragment: DocumentFragment,
  settleInfo: SettleInfo,
) {
  return insertNodesBefore(target, null, fragment, settleInfo)
}

export function swapAfterEnd(
  target: Element,
  fragment: DocumentFragment,
  settleInfo: SettleInfo,
) {
  return insertNodesBefore(
    target.parentElement,
    target.nextSibling,
    fragment,
    settleInfo,
  )
}
export function swapDelete(target: Element) {
  cleanUpElement(target)
  return target?.parentElement?.removeChild(target)
}

export function swapInnerHTML(
  target: Element,
  fragment: DocumentFragment,
  settleInfo: SettleInfo,
) {
  const firstChild = target.firstChild
  if (!firstChild) throw new Error('target has no first child')
  insertNodesBefore(target, firstChild as Element, fragment, settleInfo)
  if (firstChild) {
    while (firstChild.nextSibling) {
      cleanUpElement(firstChild.nextSibling as Element)
      target.removeChild(firstChild.nextSibling)
    }
    cleanUpElement(firstChild as Element)
    target.removeChild(firstChild)
  }
}

export function maybeSelectFromResponse(
  elt: Element,
  fragment: DocumentFragment,
) {
  const selector = getClosestAttributeValue(elt, 'hx-select')
  if (selector) {
    const newFragment = document.createDocumentFragment()
    fragment.querySelectorAll(selector).forEach((node) => {
      newFragment.appendChild(node)
    })
    fragment = newFragment
  }
  return fragment
}

export function swap(
  swapStyle: SwapStyle,
  elt: Element,
  target: Element,
  fragment: DocumentFragment,
  settleInfo: SettleInfo,
) {
  switch (swapStyle) {
    case 'none':
      return
    case 'outerHTML':
      swapOuterHTML(target, fragment, settleInfo)
      return
    case 'afterbegin':
      swapAfterBegin(target, fragment, settleInfo)
      return
    case 'beforebegin':
      swapBeforeBegin(target, fragment, settleInfo)
      return
    case 'beforeend':
      swapBeforeEnd(target, fragment, settleInfo)
      return
    case 'afterend':
      swapAfterEnd(target, fragment, settleInfo)
      return
    case 'delete':
      swapDelete(target)
      return
    default:
      const extensions = getExtensions(elt)
      for (var i = 0; i < extensions.length; i++) {
        const ext = extensions[i]
        try {
          const newElements = ext.handleSwap(
            swapStyle,
            target,
            fragment,
            settleInfo,
          )
          if (newElements) {
            if (typeof newElements.length !== 'undefined') {
              // if handleSwap returns an array (like) of elements, we handle them
              for (var j = 0; j < newElements.length; j++) {
                const child = newElements[j]
                if (
                  child.nodeType !== Node.TEXT_NODE &&
                  child.nodeType !== Node.COMMENT_NODE
                ) {
                  settleInfo.tasks.push(makeAjaxLoadTask(child))
                }
              }
            }
            return
          }
        } catch (e) {
          console.error(e)
        }
      }
      if (swapStyle === 'innerHTML') {
        swapInnerHTML(target, fragment, settleInfo)
      } else {
        swap(config.defaultSwapStyle, elt, target, fragment, settleInfo)
      }
  }
}

export function findTitle(content: string) {
  if (content.indexOf('<title') > -1) {
    const contentWithSvgsRemoved = content.replace(
      /<svg(\s[^>]*>|>)([\s\S]*?)<\/svg>/gim,
      '',
    )
    const result = contentWithSvgsRemoved.match(
      /<title(\s[^>]*>|>)([\s\S]*?)<\/title>/im,
    )

    if (result) {
      return result[2]
    }
  }

  throw new Error('No title found in response')
}

export function selectAndSwap(
  swapStyle: SwapStyle,
  target: Element,
  elt: Element,
  responseText: string,
  settleInfo: SettleInfo,
) {
  settleInfo.title = findTitle(responseText)
  let fragment = makeFragment(responseText)
  if (fragment) {
    handleOutOfBandSwaps(elt, fragment, settleInfo)
    fragment = maybeSelectFromResponse(elt, fragment)

    //handlePreservedElements
    findAll(fragment, '[hx-preserve], [data-hx-preserve]').forEach(
      (preservedElt) => {
        const id = getAttributeValue(preservedElt, 'id')
        if (!id) throw new Error('Preserved element must have an id')
        const oldElt = document.getElementById(id)
        if (!!oldElt) {
          preservedElt.parentNode?.replaceChild(oldElt, preservedElt)
        }
      },
    )

    return swap(swapStyle, elt, target, fragment, settleInfo)
  }

  return null
}

export function handleTrigger(
  xhr: XMLHttpRequest,
  header: string,
  elt: Element,
) {
  const triggerBody = xhr.getResponseHeader(header)
  if (!triggerBody) throw new Error('No trigger body found in header ' + header)
  if (triggerBody.indexOf('{') === 0) {
    const triggers: Record<string, any> = JSON.parse(triggerBody)
    for (var eventName in triggers) {
      if (triggers.hasOwnProperty(eventName)) {
        let detail = triggers[eventName]
        if (typeof detail !== 'object') {
          detail = { value: detail }
        }
        triggerEvent(elt, eventName, detail)
      }
    }
  } else {
    triggerEvent(elt, triggerBody, [])
  }
}

export const WHITESPACE = /\s/
export const WHITESPACE_OR_COMMA = /[\s,]/
export const SYMBOL_START = /[_$a-zA-Z]/
export const SYMBOL_CONT = /[_$a-zA-Z0-9]/
export const STRINGISH_START = ['"', "'", '/']
export const NOT_WHITESPACE = /[^\s]/
export function tokenizeString(str: string) {
  const tokens = []
  let position = 0
  while (position < str.length) {
    if (SYMBOL_START.exec(str.charAt(position))) {
      const startPosition = position
      while (SYMBOL_CONT.exec(str.charAt(position + 1))) {
        position++
      }
      tokens.push(str.substr(startPosition, position - startPosition + 1))
    } else if (STRINGISH_START.indexOf(str.charAt(position)) !== -1) {
      const startChar = str.charAt(position)
      const startPosition = position
      position++
      while (position < str.length && str.charAt(position) !== startChar) {
        if (str.charAt(position) === '\\') {
          position++
        }
        position++
      }
      tokens.push(str.substr(startPosition, position - startPosition + 1))
    } else {
      const symbol = str.charAt(position)
      tokens.push(symbol)
    }
    position++
  }
  return tokens
}

export function isPossibleRelativeReference(
  token: string,
  last: string,
  paramName: string,
) {
  return (
    SYMBOL_START.exec(token.charAt(0)) &&
    token !== 'true' &&
    token !== 'false' &&
    token !== 'this' &&
    token !== paramName &&
    last !== '.'
  )
}

export function maybeGenerateConditional(
  elt: Element,
  tokens: string[],
  paramName: string,
) {
  if (tokens[0] === '[') {
    tokens.shift()
    let bracketCount = 1
    let conditionalSource = ` return (function(${paramName}){ return (`
    let last = null
    while (tokens.length > 0) {
      let token = tokens[0]
      if (token === ']') {
        bracketCount--
        if (bracketCount === 0) {
          if (last === null) {
            conditionalSource = conditionalSource + 'true'
          }
          tokens.shift()
          conditionalSource += ')})'
          try {
            const conditionFunction = maybeEval(
              elt,
              function () {
                return Function(conditionalSource)()
              },
              function () {
                return true
              },
            )
            conditionFunction.source = conditionalSource
            return conditionFunction
          } catch (e) {
            triggerErrorEvent(document.body, 'htmx:syntax:error', {
              error: e,
              source: conditionalSource,
            })
            return null
          }
        }
      } else if (token === '[') {
        bracketCount++
      }
      if (isPossibleRelativeReference(token, last, paramName)) {
        conditionalSource += `((${paramName} && ${paramName}.${token}) ? (${paramName}.${token}) : (window.${token}))`
      } else {
        conditionalSource = conditionalSource + token
      }
      last = tokens.shift()
    }
  }
}

export function consumeUntil(tokens: string[], match: RegExp) {
  let result = ''
  while (tokens.length > 0 && !tokens[0].match(match)) {
    result += tokens.shift()
  }
  return result
}

export const INPUT_SELECTOR = 'input, textarea, select'

export interface TriggerSpec {
  trigger: string
  eventFilter?: (event: Event) => boolean
  pollInterval?: number
  changed?: boolean
  once?: boolean
  consume?: boolean
  delay?: number
  from?: string
  target?: string
  throttle?: number
  queue?: string
  root?: string
  threshold?: string
  sseEvent?: string
}
export function getTriggerSpecs(elt: Element) {
  const explicitTrigger = getAttributeValue(elt, 'hx-trigger')
  const triggerSpecs: TriggerSpec[] = []
  if (explicitTrigger) {
    const tokens = tokenizeString(explicitTrigger)
    do {
      consumeUntil(tokens, NOT_WHITESPACE)
      const initialLength = tokens.length
      const trigger = consumeUntil(tokens, /[,\[\s]/)
      if (trigger !== '') {
        if (trigger === 'every') {
          const every = {
            trigger: 'every',
            pollInterval: 0,
            eventFilter: null,
          }
          consumeUntil(tokens, NOT_WHITESPACE)
          every.pollInterval = parseInterval(consumeUntil(tokens, /[,\[\s]/))
          consumeUntil(tokens, NOT_WHITESPACE)
          const eventFilter = maybeGenerateConditional(elt, tokens, 'event')
          if (eventFilter) {
            every.eventFilter = eventFilter
          }
          triggerSpecs.push(every)
        } else if (trigger.indexOf('sse:') === 0) {
          triggerSpecs.push({ trigger: 'sse', sseEvent: trigger.substr(4) })
        } else {
          const triggerSpec: TriggerSpec = { trigger: trigger }
          const eventFilter = maybeGenerateConditional(elt, tokens, 'event')
          if (eventFilter) {
            triggerSpec.eventFilter = eventFilter
          }
          while (tokens.length > 0 && tokens[0] !== ',') {
            consumeUntil(tokens, NOT_WHITESPACE)
            const token = tokens.shift()
            if (token === 'changed') {
              triggerSpec.changed = true
            } else if (token === 'once') {
              triggerSpec.once = true
            } else if (token === 'consume') {
              triggerSpec.consume = true
            } else if (token === 'delay' && tokens[0] === ':') {
              tokens.shift()
              triggerSpec.delay = parseInterval(
                consumeUntil(tokens, WHITESPACE_OR_COMMA),
              )
            } else if (token === 'from' && tokens[0] === ':') {
              tokens.shift()
              let from_arg = consumeUntil(tokens, WHITESPACE_OR_COMMA)
              if (
                from_arg === 'closest' ||
                from_arg === 'find' ||
                from_arg === 'next' ||
                from_arg === 'previous'
              ) {
                tokens.shift()
                from_arg += ' ' + consumeUntil(tokens, WHITESPACE_OR_COMMA)
              }
              triggerSpec.from = from_arg
            } else if (token === 'target' && tokens[0] === ':') {
              tokens.shift()
              triggerSpec.target = consumeUntil(tokens, WHITESPACE_OR_COMMA)
            } else if (token === 'throttle' && tokens[0] === ':') {
              tokens.shift()
              triggerSpec.throttle = parseInterval(
                consumeUntil(tokens, WHITESPACE_OR_COMMA),
              )
            } else if (token === 'queue' && tokens[0] === ':') {
              tokens.shift()
              triggerSpec.queue = consumeUntil(tokens, WHITESPACE_OR_COMMA)
            } else if (
              (token === 'root' || token === 'threshold') &&
              tokens[0] === ':'
            ) {
              tokens.shift()
              triggerSpec[token] = consumeUntil(tokens, WHITESPACE_OR_COMMA)
            } else {
              triggerErrorEvent(elt, 'htmx:syntax:error', {
                token: tokens.shift(),
              })
            }
          }
          triggerSpecs.push(triggerSpec)
        }
      }
      if (tokens.length === initialLength) {
        triggerErrorEvent(elt, 'htmx:syntax:error', { token: tokens.shift() })
      }
      consumeUntil(tokens, NOT_WHITESPACE)
    } while (tokens[0] === ',' && tokens.shift())
  }

  if (triggerSpecs.length > 0) {
    return triggerSpecs
  } else if (matches(elt, 'form')) {
    return [{ trigger: 'submit' }]
  } else if (matches(elt, 'input[type="button"]')) {
    return [{ trigger: 'click' }]
  } else if (matches(elt, INPUT_SELECTOR)) {
    return [{ trigger: 'change' }]
  } else {
    return [{ trigger: 'click' }]
  }
}

export function cancelPolling(elt: Element) {
  getInternalData(elt).cancelled = true
}

export function processPolling(
  elt: Element,
  handler: (elt: Element) => void,
  spec: TriggerSpec,
) {
  const nodeData = getInternalData(elt)
  nodeData.timeout = setTimeout(function () {
    if (document.body.contains(elt) && nodeData.cancelled !== true) {
      if (
        !maybeFilterEvent(
          spec,
          makeEvent('hx:poll:trigger', { triggerSpec: spec, target: elt }),
        )
      ) {
        handler(elt)
      }
      processPolling(elt, handler, spec)
    }
  }, spec.pollInterval)
}

export function isLocalLink(elt: Element & { hostname?: string }) {
  if (location.hostname !== elt.hostname) return false
  const href = getRawAttribute(elt, 'href')
  if (!href) return false
  return href.indexOf('#') !== 0
}

// TODO: deal with any
export function boostElement(
  elt: Element & { target?: string },
  nodeData: any,
  triggerSpecs: TriggerSpec[],
) {
  if (
    (elt.tagName === 'A' &&
      isLocalLink(elt) &&
      (elt.target === '' || elt.target === '_self')) ||
    elt.tagName === 'FORM'
  ) {
    nodeData.boosted = true
    let verb: string
    let path: string | null
    if (elt.tagName === 'A') {
      verb = 'get'
      path = getRawAttribute(elt, 'href')
    } else {
      const rawAttribute = getRawAttribute(elt, 'method')
      verb = rawAttribute ? rawAttribute.toLowerCase() : 'get'
      if (verb === 'get') {
      }
      path = getRawAttribute(elt, 'action')
    }
    if (!path) throw new Error('no path')
    triggerSpecs.forEach(function (triggerSpec) {
      addEventListener(
        elt,
        function (elt, evt) {
          issueAjaxRequest(verb, path, elt, evt)
        },
        nodeData,
        triggerSpec,
        true,
      )
    })
  }
}

export function shouldCancel(evt: Event, elt: Element) {
  if (evt.type === 'submit' || evt.type === 'click') {
    if (elt.tagName === 'FORM') {
      return true
    }
    if (
      matches(elt, 'input[type="submit"], button') &&
      closest(elt, 'form') !== null
    ) {
      return true
    }
    const aElt = elt as HTMLAnchorElement
    if (aElt?.href?.indexOf('#') !== 0) {
      return true
    }
  }
  return false
}

export function ignoreBoostedAnchorCtrlClick(elt: Element, evt: Event) {
  return (
    getInternalData(elt).boosted &&
    elt.tagName === 'A' &&
    evt.type === 'click' &&
    (evt.ctrlKey || evt.metaKey)
  )
}

export function maybeFilterEvent(triggerSpec: TriggerSpec, evt: Event) {
  const eventFilter = triggerSpec.eventFilter
  if (eventFilter) {
    try {
      return eventFilter(evt) !== true
    } catch (e) {
      triggerErrorEvent(document.body, 'htmx:eventFilter:error', {
        error: e,
        source: eventFilter.source,
      })
      return true
    }
  }
  return false
}

export function addEventListener(
  elt: Element,
  handler: (elt: Element, evt: Element) => void,
  nodeData: any,
  triggerSpec: TriggerSpec,
  explicitCancel: boolean = false,
) {
  const eltsToListenOn = triggerSpec.from
    ? querySelectorAllExt(elt, triggerSpec.from)
    : [elt]

  if (!eltsToListenOn) throw new Error('no elts to listen on')

  eltsToListenOn.forEach((eltToListenOn) => {
    if (!eltToListenOn) throw new Error('no elt to listen on')

    // TODO: deal with any
    const eventListener = function (evt: any) {
      if (!document.body.contains(elt)) {
        eltToListenOn.removeEventListener(triggerSpec.trigger, eventListener)
        return
      }
      if (ignoreBoostedAnchorCtrlClick(elt, evt)) {
        return
      }
      if (explicitCancel || shouldCancel(evt, elt)) {
        evt.preventDefault()
      }
      if (maybeFilterEvent(triggerSpec, evt)) {
        return
      }
      const eventData = getInternalData(evt)
      eventData.triggerSpec = triggerSpec
      if (eventData.handledFor == null) {
        eventData.handledFor = []
      }
      const elementData = getInternalData(elt)
      if (eventData.handledFor.indexOf(elt) < 0) {
        eventData.handledFor.push(elt)
        if (triggerSpec.consume) {
          evt.stopPropagation()
        }
        if (triggerSpec.target && evt.target) {
          if (!matches(evt.target, triggerSpec.target)) {
            return
          }
        }
        if (triggerSpec.once) {
          if (elementData.triggeredOnce) {
            return
          } else {
            elementData.triggeredOnce = true
          }
        }
        if (triggerSpec.changed) {
          if (elementData.lastValue === elt.value) {
            return
          } else {
            elementData.lastValue = elt.value
          }
        }
        if (elementData.delayed) {
          clearTimeout(elementData.delayed)
        }
        if (elementData.throttle) {
          return
        }

        if (triggerSpec.throttle) {
          if (!elementData.throttle) {
            handler(elt, evt)
            elementData.throttle = setTimeout(function () {
              elementData.throttle = null
            }, triggerSpec.throttle)
          }
        } else if (triggerSpec.delay) {
          elementData.delayed = setTimeout(function () {
            handler(elt, evt)
          }, triggerSpec.delay)
        } else {
          handler(elt, evt)
        }
      }
    }
    if (nodeData.listenerInfos == null) {
      nodeData.listenerInfos = []
    }
    nodeData.listenerInfos.push({
      trigger: triggerSpec.trigger,
      listener: eventListener,
      on: eltToListenOn,
    })
    eltToListenOn.addEventListener(triggerSpec.trigger, eventListener)
  })
}

let windowIsScrolling = false // used by initScrollHandler
export let scrollHandler: (this: Window, ev: Event) => any
export function initScrollHandler() {
  if (!scrollHandler) {
    scrollHandler = function () {
      windowIsScrolling = true
    }
    window.addEventListener('scroll', scrollHandler)
    setInterval(function () {
      if (windowIsScrolling) {
        windowIsScrolling = false

        document
          .querySelectorAll(
            "[hx-trigger='revealed'],[data-hx-trigger='revealed']",
          )
          .forEach((elt) => maybeReveal(elt))
      }
    }, 200)
  }
}

export function maybeReveal(elt: Element) {
  if (!hasAttribute(elt, 'data-hx-revealed') && isScrolledIntoView(elt)) {
    elt.setAttribute('data-hx-revealed', 'true')
    const nodeData = getInternalData(elt)
    if (nodeData.initHash) {
      triggerEvent(elt, 'revealed')
    } else {
      // if the node isn't initialized, wait for it before triggering the request
      elt.addEventListener(
        'htmx:afterProcessNode',
        () => triggerEvent(elt, 'revealed'),
        { once: true },
      )
    }
  }
}

// TODO: resolve use of any
export function loadImmediately(
  elt: Element,
  handler: any,
  nodeData: any,
  delay?: number,
) {
  const load = function () {
    if (!nodeData.loaded) {
      nodeData.loaded = true
      handler(elt)
    }
  }
  if (delay) {
    setTimeout(load, delay)
  } else {
    load()
  }
}

const VERBS = ['get', 'post', 'put', 'delete', 'patch']
const VERB_SELECTOR = VERBS.map(function (verb) {
  return `[hx-${verb}], [data-hx-${verb}]`
}).join(', ')

// TODO: resolve use of any
export function processVerbs(
  elt: Element,
  nodeData: any,
  triggerSpecs: TriggerSpec[],
) {
  let explicitAction = false
  VERBS.forEach((verb) => {
    if (hasAttribute(elt, 'hx-' + verb)) {
      const path = getAttributeValue(elt, 'hx-' + verb)
      if (!path) throw new Error('no path')
      explicitAction = true
      nodeData.path = path
      nodeData.verb = verb
      triggerSpecs.forEach(function (triggerSpec) {
        addTriggerHandler(elt, triggerSpec, nodeData, (elt, evt) => {
          issueAjaxRequest(verb, path, elt, evt)
        })
      })
    }
  })
  return explicitAction
}

export function addTriggerHandler(
  elt: Element,
  triggerSpec: TriggerSpec,
  nodeData: any,
  handler: (elt: Element, evt: Element) => void,
) {
  if (triggerSpec.sseEvent) {
    processSSETrigger(elt, handler, triggerSpec.sseEvent)
  } else if (triggerSpec.trigger === 'revealed') {
    initScrollHandler()
    addEventListener(elt, handler, nodeData, triggerSpec)
    maybeReveal(elt)
  } else if (triggerSpec.trigger === 'intersect') {
    const observerOptions: {
      root?: Element
      threshold?: number
    } = {}
    if (triggerSpec.root) {
      observerOptions.root = querySelectorExt(elt, triggerSpec.root)
    }
    if (triggerSpec.threshold) {
      observerOptions.threshold = parseFloat(triggerSpec.threshold)
    }
    const observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        const entry = entries[i]
        if (entry.isIntersecting) {
          triggerEvent(elt, 'intersect')
          break
        }
      }
    }, observerOptions)
    observer.observe(elt)
    addEventListener(elt, handler, nodeData, triggerSpec)
  } else if (triggerSpec.trigger === 'load') {
    if (!maybeFilterEvent(triggerSpec, makeEvent('load', { elt: elt }))) {
      loadImmediately(elt, handler, nodeData, triggerSpec.delay)
    }
  } else if (triggerSpec.pollInterval) {
    nodeData.polling = true
    processPolling(elt, handler, triggerSpec)
  } else {
    addEventListener(elt, handler, nodeData, triggerSpec)
  }
}

export function evalScript(script: HTMLScriptElement) {
  if (
    script.type === 'text/javascript' ||
    script.type === 'module' ||
    script.type === ''
  ) {
    const newScript = document.createElement('script')
    Object.entries(script.attributes).forEach(([v, attr]) => {
      newScript.setAttribute(attr.name, v)
    })
    newScript.textContent = script.textContent
    newScript.async = false
    if (config.inlineScriptNonce) {
      newScript.nonce = config.inlineScriptNonce
    }
    const parent = script.parentElement
    if (!parent) throw new Error('script has no parent')

    try {
      parent.insertBefore(newScript, script)
    } catch (e) {
      console.error(e)
    } finally {
      // remove old script element, but only if it is still in DOM
      if (script.parentElement) {
        script.parentElement.removeChild(script)
      }
    }
  }
}

export function processScripts(elt: Element) {
  if (matches(elt, 'script')) {
    evalScript(elt)
  }
  findAll(elt, 'script').forEach((script) => {
    if (script instanceof HTMLScriptElement) {
      evalScript(script)
    } else {
      throw new Error('script is not an HTMLScriptElement')
    }
  })
}

export function hasChanceOfBeingBoosted() {
  return document.querySelector('[hx-boost], [data-hx-boost]')
}

export function findElementsToProcess(elt: Element) {
  if (elt.querySelectorAll) {
    const boostedElts = hasChanceOfBeingBoosted() ? ', a, form' : ''
    const results = elt.querySelectorAll(
      VERB_SELECTOR +
        boostedElts +
        ', [hx-sse], [data-hx-sse], [hx-ws],' +
        ' [data-hx-ws], [hx-ext], [data-hx-ext]',
    )
    return results
  } else {
    return []
  }
}

export function initButtonTracking(form: HTMLFormElement) {
  // need to handle both click and focus in:

  //   click - on OSX buttons do not focus on click see https://bugs.webkit.org/show_bug.cgi?id=13724
  form.addEventListener('click', (evt) => {
    if (!evt.target) throw new Error('evt.target is null')
    const elt = closest(evt.target as Element, "button, input[type='submit']")
    if (elt !== null) {
      const internalData = getInternalData(form)
      internalData.lastButtonClicked = elt
    }
  })

  //   focusin - in case someone tabs in to a button and hits the space bar
  form.addEventListener('focusin', (evt) => {
    if (!evt.target) throw new Error('evt.target is null')
    const elt = closest(evt.target as Element, "button, input[type='submit']")
    if (elt !== null) {
      const internalData = getInternalData(form)
      internalData.lastButtonClicked = elt
    }
  })
  form.addEventListener('focusout', () => {
    const internalData = getInternalData(form)
    internalData.lastButtonClicked = null
  })
}

export function initNode(elt: Element & { value?: string }) {
  if (elt.closest && elt.closest(config.disableSelector)) {
    return
  }
  const nodeData = getInternalData(elt)
  if (nodeData.initHash !== attributeHash(elt)) {
    nodeData.initHash = attributeHash(elt)

    // clean up any previously processed info
    deInitNode(elt)

    triggerEvent(elt, 'htmx:beforeProcessNode')

    if (elt.value) {
      nodeData.lastValue = elt.value
    }

    const triggerSpecs = getTriggerSpecs(elt)
    const explicitAction = processVerbs(elt, nodeData, triggerSpecs)

    if (
      !explicitAction &&
      getClosestAttributeValue(elt, 'hx-boost') === 'true'
    ) {
      boostElement(elt, nodeData, triggerSpecs)
    }

    if (elt.tagName === 'FORM') {
      initButtonTracking(elt)
    }

    const sseInfo = getAttributeValue(elt, 'hx-sse')
    if (sseInfo) {
      processSSEInfo(elt, sseInfo)
    }

    const wsInfo = getAttributeValue(elt, 'hx-ws')
    if (wsInfo) {
      processWebSocketInfo(elt, wsInfo)
    }
    triggerEvent(elt, 'htmx:afterProcessNode')
  }
}

export function processNode(elt: Element) {
  const resolved = resolveTarget(elt)
  if (!resolved) throw new Error('resolved is null')
  initNode(resolved)
  findElementsToProcess(resolved).forEach((child) => {
    initNode(child)
  })
}

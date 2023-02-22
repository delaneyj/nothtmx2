import { maybeEval } from './ajax'
import { ready } from './init'

export function internalEval(str: string) {
  return maybeEval(document.body, () => {
    return eval(str)
  })
}

// TODO: come back to resolve any
export function onLoadHelper(callback: (elt: Element) => void) {
  var value = addEventListenerImpl('htmx:load', (evt: any) => {
    callback(evt.detail.elt)
  })
  return value
}

export function find(
  eltOrSelector: Element | string,
  selector?: string,
): Element | null {
  const isString = typeof eltOrSelector === 'string'
  if (selector) {
    if (isString) throw new Error('find() called with 2 strings')
    return eltOrSelector.querySelector(selector)
  }
  if (!isString) throw new Error('find() called with 1 string')
  return find(document.documentElement, eltOrSelector)
}

export function findAll(
  eltOrSelector: Element | string,
  selector?: string,
): NodeListOf<Element> {
  const isString = typeof eltOrSelector === 'string'
  if (selector) {
    if (isString) throw new Error('findAll() called with 2 strings')
    return eltOrSelector.querySelectorAll(selector)
  } else {
    if (!isString) throw new Error('findAll() called with 1 string')
    return findAll(document.documentElement, eltOrSelector)
  }
}

export function removeElement(elt: Element, delay?: number) {
  const resolved = resolveTarget(elt)
  if (!resolved) return
  if (delay) {
    setTimeout(function () {
      removeElement(resolved)
    }, delay)
  } else {
    resolved.parentElement?.removeChild(resolved)
  }
}

export function addClassToElement(elt: Element, clazz: string, delay?: number) {
  const resolved = resolveTarget(elt)
  if (!resolved) return
  if (delay) {
    setTimeout(function () {
      addClassToElement(resolved, clazz)
    }, delay)
  } else {
    resolved.classList && resolved.classList.add(clazz)
  }
}

export function removeClassFromElement(
  elt: Element,
  clazz: string,
  delay?: number,
) {
  const resolved = resolveTarget(elt)
  if (!resolved) return
  if (delay) {
    setTimeout(function () {
      removeClassFromElement(resolved, clazz)
    }, delay)
  } else {
    if (resolved.classList) {
      resolved.classList.remove(clazz)
      // if there are no classes left, remove the class attribute
      if (resolved.classList.length === 0) {
        resolved.removeAttribute('class')
      }
    }
  }
}

export function toggleClassOnElement(elt: Element, clazz: string) {
  resolveTarget(elt)?.classList.toggle(clazz)
}

export function takeClassForElement(elt: Element, clazz: string) {
  const resolved = resolveTarget(elt)
  if (resolved?.parentElement?.children) {
    Array.from(resolved.parentElement.children).forEach((child) => {
      removeClassFromElement(child, clazz)
    })
  }
  addClassToElement(elt, clazz)
}

export function closest(elt: Element, selector: string) {
  return resolveTarget(elt)?.closest(selector) || null
}

export function querySelectorAllExt(elt: Element, selector: string): Element[] {
  if (selector.indexOf('closest ') === 0) {
    const x = closest(elt, selector.substring(8))
    if (!x) throw new Error('No element found')
    return [x]
  } else if (selector.indexOf('find ') === 0) {
    const x = find(elt, selector.substring(5))
    if (!x) throw new Error('No element found')
    return [x]
  } else if (selector.indexOf('next ') === 0) {
    const x = scanForwardQuery(elt, selector.substring(5))
    if (!x) throw new Error('No element found')
    return [x]
  } else if (selector.indexOf('previous ') === 0) {
    return [scanBackwardsQuery(elt, selector.substr(9))]
  } else if (selector === 'document') {
    return [document.documentElement]
  } else if (selector === 'window') {
    throw new Error('window is not a valid selector') // TODO: WAT
  } else {
    return Array.from(document.querySelectorAll(selector))
  }
}

export function scanForwardQuery(start: Element, match: string) {
  const results = document.querySelectorAll(match)
  for (var i = 0; i < results.length; i++) {
    const elt = results[i]
    if (
      elt.compareDocumentPosition(start) === Node.DOCUMENT_POSITION_PRECEDING
    ) {
      return elt
    }
  }
  throw new Error('No element found')
}

export function scanBackwardsQuery(start: Element, match: string) {
  var results = document.querySelectorAll(match)
  for (var i = results.length - 1; i >= 0; i--) {
    var elt = results[i]
    if (
      elt.compareDocumentPosition(start) === Node.DOCUMENT_POSITION_FOLLOWING
    ) {
      return elt
    }
  }
  throw new Error('No element found')
}

export function querySelectorExt(
  eltOrSelector: Element | string,
  selector: string,
) {
  const isString = typeof eltOrSelector === 'string'
  if (selector) {
    if (isString) throw new Error('Invalid selector')
    return querySelectorAllExt(eltOrSelector, selector)[0]
  } else {
    if (!isString) throw new Error('Invalid selector')
    return querySelectorAllExt(document.body, eltOrSelector)[0]
  }
}

export function resolveTarget(arg2: string | Element) {
  if (typeof arg2 === 'string') {
    return find(arg2)
  } else {
    return arg2
  }
}

// TODO: resolve any type later
export function processEventArgs(arg1: any, arg2: any, arg3: any) {
  if (typeof arg2 === 'function') {
    return {
      target: document.body,
      event: arg1,
      listener: arg2,
    }
  }
  return {
    target: resolveTarget(arg1),
    event: arg2,
    listener: arg3,
  }
}

// TODO: resolve any type later
export function addEventListenerImpl(arg1: any, arg2: any, arg3?: any) {
  ready(function () {
    var eventArgs = processEventArgs(arg1, arg2, arg3)
    eventArgs.target?.addEventListener(eventArgs.event, eventArgs.listener)
  })
  const b = typeof arg2 === 'function'
  return b ? arg2 : arg3
}

// TODO: resolve any type later
export function removeEventListenerImpl(arg1: any, arg2: any, arg3: any) {
  ready(function () {
    var eventArgs = processEventArgs(arg1, arg2, arg3)
    eventArgs.target?.removeEventListener(eventArgs.event, eventArgs.listener)
  })
  return typeof arg2 === 'function' ? arg2 : arg3
}

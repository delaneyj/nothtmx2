import { config } from './config'

export function parseInterval(str: string) {
  if (!str?.length) return 0
  if (str.slice(-2) == 'ms') return parseFloat(str.slice(0, -2)) || 0
  if (str.slice(-1) == 's') return parseFloat(str.slice(0, -1)) * 1000 || 0
  if (str.slice(-1) == 'm') return parseFloat(str.slice(0, -1)) * 1000 * 60 || 0
  return parseFloat(str) || 0
}

export function getRawAttribute(elt: Element, name: string) {
  return elt.getAttribute && elt.getAttribute(name)
}

// resolve with both hx and data-hx prefixes
export function hasAttribute(elt: Element, qualifiedName: string) {
  return (
    elt.hasAttribute &&
    (elt.hasAttribute(qualifiedName) ||
      elt.hasAttribute('data-' + qualifiedName))
  )
}

export function getAttributeValue(elt: Element, qualifiedName: string) {
  return (
    getRawAttribute(elt, qualifiedName) ||
    getRawAttribute(elt, 'data-' + qualifiedName)
  )
}

export function getClosestMatch(
  start: Element,
  condition: (e: Element) => boolean,
) {
  let elt: Element | null = start
  while (elt && !condition(elt)) {
    elt = elt.parentElement
  }

  return elt ? elt : null
}

export function getAttributeValueWithDisinheritance(
  initialElement: Element,
  ancestor: Element,
  attributeName: string,
) {
  const attributeValue = getAttributeValue(ancestor, attributeName)
  const disinherit = getAttributeValue(ancestor, 'hx-disinherit')
  if (
    initialElement !== ancestor &&
    disinherit &&
    (disinherit === '*' || disinherit.split(' ').indexOf(attributeName) >= 0)
  ) {
    return 'unset'
  } else {
    return attributeValue
  }
}

//TODO: check if this is valid
export function getClosestAttributeValue(
  elt: Element,
  attributeName: string,
): string | null {
  let closestAttr: string | null = null
  getClosestMatch(elt, function (e) {
    closestAttr = getAttributeValueWithDisinheritance(elt, e, attributeName)
    return !!closestAttr
  })
  if (closestAttr !== 'unset') {
    return closestAttr
  }
  return null
}

export type SelectorFilter = (elt: Element) => boolean
export function matches(
  elt: Element & {
    matchesSelector?: SelectorFilter
    msMatchesSelector?: SelectorFilter
    mozMatchesSelector?: SelectorFilter
    webkitMatchesSelector?: SelectorFilter
    oMatchesSelector?: SelectorFilter
  },
  selector: string,
) {
  let matchesFunction =
    elt.matches ||
    elt.matchesSelector ||
    elt.msMatchesSelector ||
    elt.mozMatchesSelector ||
    elt.webkitMatchesSelector ||
    elt.oMatchesSelector
  return matchesFunction && matchesFunction.call(elt, selector)
}

export function getStartTag(str: string) {
  var tagMatcher = /<([a-z][^\/\0>\x20\t\r\n\f]*)/i
  var match = tagMatcher.exec(str)
  if (match) {
    return match[1].toLowerCase()
  } else {
    return ''
  }
}

const parser = new DOMParser()
export function parseHTML(resp: string, depth: number) {
  const responseDoc = parser.parseFromString(resp, 'text/html')
  let responseNode: Element | null = responseDoc.body
  while (depth > 0) {
    depth--
    responseNode = (responseNode?.firstChild as Element) || null
  }
  if (!responseNode) {
    // TODO: Check this is correct use of DocumentFragment
    const fragment = document.createDocumentFragment()
    responseNode = fragment.getElementById('root')
  }
  return responseNode
}

export function makeFragment(resp: string) {
  if (config.useTemplateFragments) {
    const documentFragment = parseHTML(
      `<body><template>${resp}</template></body>`,
      0,
    )
    return documentFragment?.querySelector('template')?.content || null
  }
  const startTag = getStartTag(resp)
  switch (startTag) {
    case 'thead':
    case 'tbody':
    case 'tfoot':
    case 'colgroup':
    case 'caption':
      return parseHTML(`<table>${resp}</table>`, 1)
    case 'col':
      return parseHTML(`<table><colgroup>${resp}</colgroup></table>`, 2)
    case 'tr':
      return parseHTML(`<table><tbody>${resp}</tbody></table>`, 2)
    case 'td':
    case 'th':
      return parseHTML(`<table><tbody><tr>${resp}</tr></tbody></table>`, 3)
    case 'script':
      return parseHTML(`<div>${resp}</div>`, 1)
    default:
      return parseHTML(resp, 0)
  }
}

export function getInternalData(elt: Element & { 'htmx-internal-data'?: any }) {
  let data = elt['htmx-internal-data']
  if (!data) {
    data = elt['htmx-internal-data'] = {}
  }
  return data
}

export function isScrolledIntoView(el: Element) {
  const { top, bottom } = el.getBoundingClientRect()
  return top < window.innerHeight && bottom >= 0
}

export function splitOnWhitespace(trigger: string) {
  return trigger.trim().split(/\s+/)
}

export function canAccessLocalStorage() {
  const test = 'htmx:localStorageTest'
  try {
    localStorage.setItem(test, test)
    localStorage.removeItem(test)
    return true
  } catch (e) {
    return false
  }
}

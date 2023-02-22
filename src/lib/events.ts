import { getExtensions } from './extensions'
import { resolveTarget } from './public'

export function kebabEventName(str: string) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

export function makeEvent<T>(eventName: string, detail: T) {
  return new CustomEvent(eventName, { bubbles: true, cancelable: true, detail })
}

export function triggerErrorEvent<T>(
  elt: Element,
  eventName: string,
  detail?: T,
) {
  triggerEvent(elt, eventName, Object.assign({ error: eventName }, detail))
}

export function ignoreEventForLogging(eventName: string) {
  return eventName === 'htmx:afterProcessNode'
}

// locates all active extensions for a provided element, then
// executes the provided function using each of the active extensions.
// It should be called internally at every extendable execution point in htmx.
export function withExtensions(elt: Element, toDo: (ext: any) => void) {
  getExtensions(elt).forEach((ext: any) => {
    try {
      toDo(ext)
    } catch (e) {
      console.error(e)
    }
  })
}

export function triggerEvent(elt: Element, eventName: string, detail?: any) {
  const resolved = resolveTarget(elt)
  if (!resolved) throw new Error('Unable to resolve target for event')
  if (!detail) {
    detail = {}
  }
  detail['elt'] = resolved
  var event = makeEvent(eventName, detail)
  if (!ignoreEventForLogging(eventName)) {
    console.log(resolved, eventName, detail)
  }
  if (detail.error) {
    console.error(detail.error)
    triggerEvent(resolved, 'htmx:error', { errorInfo: detail })
  }
  var eventResult = resolved.dispatchEvent(event)
  var kebabName = kebabEventName(eventName)
  if (eventResult && kebabName !== eventName) {
    var kebabedEvent = makeEvent(kebabName, event.detail)
    eventResult = eventResult && resolved.dispatchEvent(kebabedEvent)
  }
  withExtensions(resolved, function (extension) {
    eventResult = eventResult && !!extension.onEvent(eventName, event)
  })
  return eventResult
}

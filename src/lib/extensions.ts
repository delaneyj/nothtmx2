import {
  filterValues,
  getExpressionVars,
  getHeaders,
  getSwapSpecification,
  SwapSpecification,
} from './ajax'
import { SwapStyle } from './config'
import { triggerErrorEvent, triggerEvent, withExtensions } from './events'
import { settleImmediately, Task } from './history'
import { getInputValues } from './input-value-processing'
import {
  addTriggerHandler,
  getTarget,
  getTriggerSpecs,
  oobSwap,
  selectAndSwap,
  SettleInfo,
  shouldCancel,
  TriggerSpec,
} from './node-processing'
import {
  canAccessLocalStorage,
  getAttributeValue,
  getClosestMatch,
  getInternalData,
  hasAttribute,
  makeFragment,
} from './utils'

export interface API {
  addTriggerHandler: (
    elt: Element,
    triggerSpec: boolean,
    nodeData: boolean,
    handler: boolean,
  ) => void

  canAccessLocalStorage: () => boolean
  filterValues: (values: boolean, filter: boolean) => boolean
  hasAttribute: (elt: Element, name: string) => boolean
  getAttributeValue: (elt: Element, name: string) => string
  getClosestMatch: (elt: Element, selector: string) => Element
  getExpressionVars: (expression: string) => string[]
  getHeaders: (elt: Element) => Record<string, string>
  getInputValues: (elt: Element) => Record<string, string>
  getInternalData: (elt: Element) => Record<string, unknown>
  getSwapSpecification: (elt: Element) => SwapStyle
  getTriggerSpecs: (elt: Element) => Record<string, unknown>
  getTarget: (elt: Element) => Element
  makeFragment: (text: string) => DocumentFragment
  makeSettleInfo: (
    swapStyle: SwapStyle,
    target: Element,
    fragment: DocumentFragment,
  ) => boolean
  oobSwap: (
    swapStyle: SwapStyle,
    target: Element,
    fragment: DocumentFragment,
  ) => void
  selectAndSwap: (
    swapStyle: SwapStyle,
    target: Element,
    fragment: DocumentFragment,
  ) => void
  settleImmediately: (
    swapStyle: SwapStyle,
    target: Element,
    fragment: DocumentFragment,
  ) => void
  shouldCancel: (elt: Element, event: boolean) => boolean
  triggerEvent: (elt: Element, name: string, detail: boolean) => void
  triggerErrorEvent: (elt: Element, name: string, detail: boolean) => void
  withExtensions: (elt: Element, toDo: boolean) => void
}

export const extensions: Record<string, HtmxExtension> = {}

export interface HtmxExtension {
  init: (api: InternalAPI) => void
  //TODO: deal with any
  onEvent: (name: string, evt: CustomEvent<any>) => boolean
  transformResponse: (text: string, xhr: boolean, elt: Element) => string
  isInlineSwap: (swapStyle: SwapStyle) => boolean
  handleSwap: (
    swapStyle: SwapStyle,
    target: Element,
    fragment: DocumentFragment,
    settleInfo: boolean,
  ) => boolean
  encodeParameters: (xhr: boolean, parameters: boolean, elt: boolean) => void
}

export function defaultExtensionsFunctions(): HtmxExtension {
  return {
    init: () => null,
    onEvent: () => true,
    transformResponse: (text: string) => text,
    isInlineSwap: () => false,
    handleSwap: () => false,
    encodeParameters: () => null,
  }
}

export interface InternalAPI {
  addTriggerHandler: (
    elt: Element,
    triggerSpec: TriggerSpec,
    nodeData: any,
    handler: Function,
  ) => void
  canAccessLocalStorage: () => boolean
  filterValues: (
    inputValues: Record<string, string>,
    elt: Element,
  ) => Record<string, string>
  hasAttribute: (elt: Element, qualifiedName: string) => boolean
  getAttributeValue: (elt: Element, qualifiedName: string) => string | null
  getClosestMatch: (
    start: Element,
    condition: (e: Element) => boolean,
  ) => Element | null
  getExpressionVars: (elt: Element) => Record<string, string>
  getHeaders: (
    elt: Element,
    target: Element,
    prompt?: string | undefined,
  ) => Record<string, string>
  getInputValues: (
    elt: Element & { noValidate?: boolean | undefined },
    verb: string,
  ) => { errors: any[]; values: {} }
  getInternalData: (elt: Element & { 'htmx-internal-data'?: any }) => any
  getSwapSpecification: (
    elt: Element,
    swapInfoOverride?: string | undefined,
  ) => SwapSpecification
  getTriggerSpecs: (elt: Element) => TriggerSpec[]
  getTarget: (elt: Element) => any
  makeFragment: (resp: string) => Element | DocumentFragment | null
  oobSwap: (
    oobValue: string,
    oobElement: Element,
    settleInfo: SettleInfo,
  ) => string
  selectAndSwap: (
    swapStyle: SwapStyle,
    target: Element,
    elt: Element,
    responseText: string,
    settleInfo: SettleInfo,
  ) => void | null
  settleImmediately: (tasks: Task[]) => void
  shouldCancel: (evt: Event, elt: Element) => boolean
  triggerEvent: (elt: Element, eventName: string, detail?: any) => boolean
  triggerErrorEvent: <T>(
    elt: Element,
    eventName: string,
    detail?: T | undefined,
  ) => void
  withExtensions: (elt: Element, toDo: (ext: any) => void) => void
}

export function defaultExtension(
  name: string,
  extension: Partial<HtmxExtension>,
) {
  if (extension.init) {
    const internalAPI: InternalAPI = {
      addTriggerHandler,
      canAccessLocalStorage,
      filterValues,
      hasAttribute,
      getAttributeValue,
      getClosestMatch,
      getExpressionVars,
      getHeaders,
      getInputValues,
      getInternalData,
      getSwapSpecification,
      getTriggerSpecs,
      getTarget,
      makeFragment,
      oobSwap,
      selectAndSwap,
      settleImmediately,
      shouldCancel,
      triggerEvent,
      triggerErrorEvent,
      withExtensions,
    }
    extension.init(internalAPI)
  }

  extensions[name] = Object.assign(defaultExtensionsFunctions(), extension)
}

// removes an extension from the htmx registry
export function removeExtension(name: string) {
  delete extensions[name]
}

// getExtensions searches up the DOM tree to return all extensions that can be applied to a given element
export function getExtensions(
  elt: Element,
  extensionsToReturn: HtmxExtension[] = [],
  extensionsToIgnore: string[] = [],
): HtmxExtension[] {
  if (elt == undefined) {
    return extensionsToReturn
  }
  if (extensionsToReturn == undefined) {
    extensionsToReturn = []
  }
  if (extensionsToIgnore == undefined) {
    extensionsToIgnore = []
  }
  const extensionsForElement = getAttributeValue(elt, 'hx-ext')
  if (extensionsForElement) {
    extensionsForElement.split(',').forEach((extensionName) => {
      extensionName = extensionName.replace(/ /g, '')
      if (extensionName.slice(0, 7) == 'ignore:') {
        extensionsToIgnore.push(extensionName.slice(7))
        return
      }
      if (extensionsToIgnore.indexOf(extensionName) < 0) {
        var extension = extensions[extensionName]
        if (extension && extensionsToReturn.indexOf(extension) < 0) {
          extensionsToReturn.push(extension)
        }
      }
    })
  }
  if (!elt.parentElement) throw new Error('No parent element')
  return getExtensions(
    elt.parentElement,
    extensionsToReturn,
    extensionsToIgnore,
  )
}

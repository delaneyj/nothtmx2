import { triggerEvent } from './events'
import { findAttributeTargets, INPUT_SELECTOR } from './node-processing'
import { closest } from './public'
import {
  getAttributeValue,
  getInternalData,
  getRawAttribute,
  matches,
} from './utils'

export function haveSeenNode(processed: Element[], elt: Element) {
  for (let i = 0; i < processed.length; i++) {
    const node = processed[i]
    if (node.isSameNode(elt)) {
      return true
    }
  }
  return false
}

export function shouldInclude(elt: HTMLInputElement) {
  if (elt.name === '' || elt.name == null || elt.disabled) {
    return false
  }
  // ignore "submitter" types (see jQuery src/serialize.js)
  if (
    elt.type === 'button' ||
    elt.type === 'submit' ||
    elt.tagName === 'image' ||
    elt.tagName === 'reset' ||
    elt.tagName === 'file'
  ) {
    return false
  }
  if (elt.type === 'checkbox' || elt.type === 'radio') {
    return elt.checked
  }
  return true
}

// TODO: resolve any
export function processInputValue(
  processed: Element[],
  values: any,
  errors: any[],
  elt: Element,
  validate: boolean,
) {
  if (elt == null || haveSeenNode(processed, elt)) {
    return
  } else {
    processed.push(elt)
  }
  const inputElt = elt as HTMLInputElement
  if (inputElt && shouldInclude(inputElt)) {
    const name = getRawAttribute(elt, 'name')
    let value: any = inputElt.value
    if (inputElt.multiple) {
      value = Array.from(inputElt.querySelectorAll('option:checked')).map(
        (e) => e.value,
      )
    }
    // include file inputs
    if (inputElt.files) {
      value = Array.from(inputElt.files)
    }
    // This is a little ugly because both the current value of the named value in the form
    // and the new value could be arrays, so we have to handle all four cases :/
    if (name != null && value != null) {
      const current = values[name]
      if (current !== undefined) {
        if (Array.isArray(current)) {
          if (Array.isArray(value)) {
            values[name] = current.concat(value)
          } else {
            current.push(value)
          }
        } else {
          if (Array.isArray(value)) {
            values[name] = [current].concat(value)
          } else {
            values[name] = [current, value]
          }
        }
      } else {
        values[name] = value
      }
    }
    if (validate) {
      validateElement(inputElt, errors)
    }
  }

  const formElt = elt as HTMLFormElement
  if (formElt && matches(formElt, 'form')) {
    const inputs = formElt.elements
    Array.from(inputs).forEach((input) => {
      processInputValue(processed, values, errors, input, validate)
    })
  }
}

export interface ValidityError {
  elt: HTMLInputElement
  message?: string
  validity?: ValidityState
}
export function validateElement(
  element: HTMLInputElement & {
    willValidate?: boolean
    validationMessage?: string
    validity?: ValidityState
  },
  errors: ValidityError[],
) {
  if (element.willValidate) {
    triggerEvent(element, 'htmx:validation:validate')
    if (!element.checkValidity()) {
      errors.push({
        elt: element,
        message: element.validationMessage,
        validity: element.validity,
      })
      triggerEvent(element, 'htmx:validation:failed', {
        message: element.validationMessage,
        validity: element.validity,
      })
    }
  }
}

export function getInputValues(
  elt: Element & { noValidate?: boolean },
  verb: string,
) {
  const processed = []
  let values = {}
  const formValues = {}
  const errors = []
  const internalData = getInternalData(elt)

  // only validate when form is directly submitted and novalidate or formnovalidate are not set
  // or if the element has an explicit hx-validate="true" on it
  let validate =
    (matches(elt, 'form') && !!!elt.noValidate) ||
    getAttributeValue(elt, 'hx-validate') === 'true'
  if (internalData.lastButtonClicked) {
    validate =
      validate && internalData.lastButtonClicked.formNoValidate !== true
  }

  // for a non-GET include the closest form
  if (verb !== 'get') {
    processInputValue(
      processed,
      formValues,
      errors,
      closest(elt, 'form'),
      validate,
    )
  }

  // include the element itself
  processInputValue(processed, values, errors, elt, validate)

  // if a button or submit was clicked last, include its value
  if (internalData.lastButtonClicked) {
    const name = getRawAttribute(internalData.lastButtonClicked, 'name')
    if (name) {
      values[name] = internalData.lastButtonClicked.value
    }
  }

  // include any explicit includes
  const includes = findAttributeTargets(elt, 'hx-include')
  includes.forEach((node) => {
    processInputValue(processed, values, errors, node, validate)
    // if a non-form is included, include any input values within it
    if (!matches(node, 'form')) {
      node.querySelectorAll(INPUT_SELECTOR).forEach((descendant) => {
        processInputValue(processed, values, errors, descendant, validate)
      })
    }
  })

  // form values take precedence, overriding the regular values
  values = Object.assign(values, formValues)

  return { errors, values }
}

export function appendParam(
  returnStr: string,
  name: string,
  realValue: string,
) {
  if (returnStr !== '') {
    returnStr += '&'
  }
  if (String(realValue) === '[object Object]') {
    realValue = JSON.stringify(realValue)
  }
  const s = encodeURIComponent(realValue)
  returnStr += encodeURIComponent(name) + '=' + s
  return returnStr
}

export function urlEncode(values: any) {
  let returnStr = ''
  for (const name in values) {
    if (values.hasOwnProperty(name)) {
      const value = values[name]
      if (Array.isArray(value)) {
        value.forEach((v) => {
          returnStr = appendParam(returnStr, name, v)
        })
      } else {
        returnStr = appendParam(returnStr, name, value)
      }
    }
  }
  return returnStr
}

export function makeFormData(values: any) {
  const formData = new FormData()
  for (const name in values) {
    if (values.hasOwnProperty(name)) {
      const value = values[name]
      if (Array.isArray(value)) {
        value.forEach((v) => {
          formData.append(name, v)
        })
      } else {
        formData.append(name, value)
      }
    }
  }
  return formData
}

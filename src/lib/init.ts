import { config, mergeMetaConfig } from './config'
import { triggerEvent } from './events'
import { restoreHistory } from './history'
import { processNode } from './node-processing'
import { getInternalData } from './utils'

export function ready(fn: () => void) {
  if (document.readyState !== 'loading') {
    fn()
  } else {
    document.addEventListener('DOMContentLoaded', fn)
  }
}

export function insertIndicatorStyles() {
  const { includeIndicatorStyles, indicatorClass, requestClass } = config
  if (includeIndicatorStyles) return

  document.head.insertAdjacentHTML(
    'beforeend',
    `<style>
            .${indicatorClass}{opacity:0;transition: opacity 200ms ease-in;}
            .${requestClass} .${indicatorClass}{opacity:1}
            .${requestClass}.${indicatorClass}{opacity:1}
    </style>`,
  )
}

// initialize the document
export function init() {
  ready(function () {
    mergeMetaConfig()
    insertIndicatorStyles()

    const body = document.body
    processNode(body)
    const restoredElts = document.querySelectorAll(
      "[hx-trigger='restored'],[data-hx-trigger='restored']",
    )
    body.addEventListener('htmx:abort', function (evt) {
      if (!evt.target) throw new Error('target is null')
      var internalData = getInternalData(evt.target)
      if (internalData && internalData.xhr) {
        internalData.xhr.abort()
      }
    })
    window.onpopstate = function (event) {
      if (event.state && event.state.htmx) {
        restoreHistory()
        restoredElts.forEach((elt) => {
          triggerEvent(elt, 'htmx:restored', { document, triggerEvent })
        })
      }
    }
    setTimeout(function () {
      triggerEvent(body, 'htmx:load', {}) // give ready handlers a chance to load up before firing this event
    }, 0)
  })
}

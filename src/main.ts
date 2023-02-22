import { setupCounter } from './counter'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
      <button id="counter" type="button"></button>
 
  </div>
`

setupCounter(document.querySelector<HTMLButtonElement>('#counter')!)

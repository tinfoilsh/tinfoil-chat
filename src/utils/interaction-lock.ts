interface InteractionLockOptions {
  ariaHidden?: boolean
}

interface ElementLockState {
  inertOwners: number
  ariaHiddenOwners: number
  originalInert: boolean
  originalAriaHidden: string | null
}

const elementLocks = new WeakMap<HTMLElement, ElementLockState>()

export function acquireInteractionLock(
  elements: Iterable<HTMLElement>,
  { ariaHidden = false }: InteractionLockOptions = {},
): () => void {
  const lockedElements = [...new Set(elements)]

  for (const element of lockedElements) {
    const state = elementLocks.get(element) ?? {
      inertOwners: 0,
      ariaHiddenOwners: 0,
      originalInert: element.hasAttribute('inert'),
      originalAriaHidden: element.getAttribute('aria-hidden'),
    }

    state.inertOwners += 1
    element.setAttribute('inert', '')

    if (ariaHidden) {
      state.ariaHiddenOwners += 1
      element.setAttribute('aria-hidden', 'true')
    }

    elementLocks.set(element, state)
  }

  let released = false
  return () => {
    if (released) return
    released = true

    for (const element of lockedElements) {
      const state = elementLocks.get(element)
      if (!state) continue

      state.inertOwners -= 1
      if (ariaHidden) state.ariaHiddenOwners -= 1

      if (state.inertOwners === 0) {
        if (state.originalInert) element.setAttribute('inert', '')
        else element.removeAttribute('inert')
      }

      if (ariaHidden && state.ariaHiddenOwners === 0) {
        if (state.originalAriaHidden === null) {
          element.removeAttribute('aria-hidden')
        } else {
          element.setAttribute('aria-hidden', state.originalAriaHidden)
        }
      }

      if (state.inertOwners === 0 && state.ariaHiddenOwners === 0) {
        elementLocks.delete(element)
      }
    }
  }
}

export function showModal(content: string, showClose = true): void {
  hideModal()
  const overlay = document.createElement('div')
  overlay.className = 'payment-modal-overlay'
  overlay.id = 'payment-modal'

  const box = document.createElement('div')
  box.className = 'payment-modal-box'

  if (showClose) {
    const close = document.createElement('button')
    close.className = 'payment-modal-close'
    close.innerHTML = '&times;'
    close.onclick = hideModal
    box.appendChild(close)
  }

  const body = document.createElement('div')
  body.className = 'payment-modal-body'
  body.innerHTML = content

  box.appendChild(body)
  overlay.appendChild(box)
  document.body.appendChild(overlay)
}

export function showModalClose(onClose?: () => void): void {
  const box = document.querySelector('#payment-modal .payment-modal-box')
  if (!box) return
  const existing = box.querySelector('.payment-modal-close')
  if (existing) return
  const close = document.createElement('button')
  close.className = 'payment-modal-close'
  close.innerHTML = '&times;'
  close.onclick = () => {
    hideModal()
    if (onClose) onClose()
  }
  box.insertBefore(close, box.firstChild)
}

export function hideModal(): void {
  document.getElementById('payment-modal')?.remove()
}
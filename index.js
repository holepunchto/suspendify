const Signal = require('signal-promise')

module.exports = class Suspendify {
  constructor (opts = {}) {
    const {
      pollLinger = null,
      resume = null,
      suspend = null
    } = opts

    this.updating = false
    this.resuming = false
    this.suspending = false
    this.suspended = false
    this.suspendedTarget = false
    this.pollable = !!pollLinger
    this.linger = 0
    this.resumes = 0

    this.suspendedAt = Date.now()
    this.resumedAt = Date.now()

    this.sleepResolve = null
    this.sleepTimeout = null
    this._resumeSignal = new Signal()
    this._updatingSignal = new Signal()

    if (pollLinger) this._pollLinger = pollLinger
    if (suspend) this._suspend = suspend
    if (resume) this._resume = resume
  }

  _sleep (ms) {
    return new Promise(resolve => {
      this.sleepResolve = resolve
      this.sleepTimeout = setTimeout(() => {
        this.sleepResolve = null
        this.sleepTimeout = null
        resolve(true)
      }, ms)
    })
  }

  _interupt () {
    if (!this.sleepTimeout) return
    clearTimeout(this.sleepTimeout)
    this.sleepTimeout = null
    const resolve = this.sleepResolve
    this.sleepResolve = null
    resolve(false)
  }

  async _pollLinger () {
    return -1
  }

  async _suspend () {
    // do nothing
  }

  async _resume () {
    // do nothing
  }

  get resumed () {
    return !this.suspended
  }

  async waitForResumed () {
    while (!this.resumed) await this._resumeSignal.wait()
  }

  async _presuspend () {
    const resumes = this.resumes

    if (!this.linger) return true

    if (!this.pollable) {
      await this._sleep(this.linger)
      return this.resumes === resumes
    }

    const then = Date.now()

    let ms = Math.min(1000, this.linger)
    let elapsed = 0
    let firstCall = true

    while (elapsed < this.linger) {
      await this._sleep(ms)
      if (this.resumes !== resumes) break

      const remaining = await this._pollLinger()
      if (this.resumes !== resumes || !this.suspendedTarget || !remaining) break

      elapsed = Date.now() - then

      if (firstCall) {
        ms = 50
        firstCall = false
      }

      ms *= 2
      ms = Math.min(ms, remaining, this.linger - elapsed, 1000)
    }

    return this.resumes === resumes
  }

  async update () {
    while (this.updating) await this._updatingSignal.wait()
    if (this.suspendedTarget === this.suspended) return
    this.updating = true
    try {
      await this._update()
    } finally {
      this.updating = false
      this._updatingSignal.notify()
    }
  }

  async _update () {
    while (this.suspendedTarget !== this.suspended) {
      if (this.suspendedTarget) {
        this.suspending = true
        try {
          if (!(await this._presuspend())) continue
          await this._suspend()
        } finally {
          this.suspending = false
        }
        this.suspendedAt = Date.now()
        this.suspended = true
      } else {
        this.resuming = true
        try {
          this.resumedAt = Date.now()
          await this._resume()
        } finally {
          this.resuming = false
        }
        this.suspended = false
        this._resumeSignal.notify()
      }
    }
  }

  suspend (linger = 0) {
    this.suspendedTarget = true
    this.linger = linger
    return this.update()
  }

  resume () {
    this.resumes++
    this.suspendedTarget = false
    this.linger = 0
    this._interupt()
    return this.update()
  }

  resuspend (linger = 0) {
    this.suspendedTarget = true
    this.linger = linger
    return this.update()
  }
}

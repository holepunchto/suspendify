const Signal = require('signal-promise')

module.exports = class Suspendify {
  constructor (opts = {}) {
    const {
      pollLinger = null,
      resume = null,
      suspend = null
    } = opts

    this.updating = null
    this.resuming = false
    this.suspending = false
    this.suspended = false
    this.suspendedTarget = false
    this.linger = 0

    this.suspendedAt = Date.now()
    this.resumedAt = Date.now()

    this.sleepResolve = null
    this.sleepTimeout = null
    this._resumeSignal = new Signal()

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

  waitForResumed () {
    if (!this.resumed) {
      return this._resumeSignal.wait()
    }
    return Promise.resolve()
  }

  async _presuspend () {
    if (!this.linger) return true
    if (!this._pollLinger) return await this._sleep(this.linger)

    const then = Date.now()

    let ms = Math.min(1000, this.linger)
    let elapsed = 0
    let firstCall = true

    while (elapsed < this.linger) {
      if (!(await this._sleep(ms))) return false

      const remaining = await this._pollLinger()
      if (!this.suspendedTarget || !remaining) break

      elapsed = Date.now() - then

      if (firstCall) {
        ms = 50
        firstCall = false
      }

      ms *= 2
      ms = Math.min(ms, remaining, this.linger - elapsed, 1000)
    }

    return this.suspendedTarget
  }

  async update () {
    while (this.updating) await this.updating
    if (this.suspendedTarget === this.suspended) return
    this.updating = this._update()
    await this.updating
    this.updating = null
  }

  async _update () {
    while (this.suspendedTarget !== this.suspended) {
      if (this.suspendedTarget) {
        if (!this.suspending) {
          this.suspending = true
          if (!(await this._presuspend())) {
            this.suspending = false
            continue
          }
          await this._suspend()
          this.suspendedAt = Date.now()
          this.suspending = false
        }

        this.suspended = true
      } else {
        if (!this.resuming) {
          this.resuming = true
          this.resumedAt = Date.now()
          await this._resume()
          this.resuming = false
        }
        this._resumeSignal.notify()
        this.suspended = false
      }
    }
  }

  suspend (linger = 0) {
    this.suspendedTarget = true
    this.linger = linger
    return this.update()
  }

  resume () {
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

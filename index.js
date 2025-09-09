const Signal = require('signal-promise')

const TARGET_RESUME = 0
const TARGET_WAKEUP = 1
const TARGET_SUSPEND = 2

const DEFAULT_WAKEUP_LINGER = 3_000

module.exports = class Suspendify {
  constructor (opts = {}) {
    const {
      wakeupLinger = DEFAULT_WAKEUP_LINGER,
      pollLinger = null,
      resume = null,
      suspend = null,
      suspendCancelled = null,
      wakeup = null
    } = opts

    this.target = TARGET_RESUME
    this.actual = TARGET_RESUME

    this.updating = false
    this.resuming = false
    this.waking = false
    this.suspending = false

    this.pollable = !!pollLinger
    this.linger = 0
    this.resumes = 0

    this.suspendedAt = Date.now()
    this.resumedAt = Date.now()
    this.wokenAt = Date.now()

    this.sleepResolve = null
    this.sleepTimeout = null

    this._resumeSignal = new Signal()
    this._updatingSignal = new Signal()
    this._wakeupLinger = wakeupLinger

    if (pollLinger) this._pollLinger = pollLinger
    if (suspend) this._suspend = suspend
    if (suspendCancelled) this._suspendCancelled = suspendCancelled
    if (resume) this._resume = resume
    if (wakeup) this._wakeup = wakeup
  }

  get suspended () {
    return this.actual === TARGET_SUSPEND
  }

  get resumed () {
    return !this.suspended
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

  async _suspendCancelled () {
    // do nothing
  }

  async _resume () {
    // do nothing
  }

  async _wakeup () {
    // do nothing
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
      if (this.resumes !== resumes || this.target !== TARGET_SUSPEND || !remaining) break

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
    if (this.target === this.actual) return
    this.updating = true
    try {
      await this._update()
    } finally {
      this.updating = false
      this._updatingSignal.notify()
    }
  }

  async _update () {
    while (this.target !== this.actual) {
      switch (this.target) {
        case TARGET_SUSPEND: {
          this.suspending = true
          try {
            if (!(await this._presuspend())) {
              await this._suspendCancelled()
              break
            }
            await this._suspend()
          } finally {
            this.suspending = false
          }
          this.suspendedAt = Date.now()
          this.actual = TARGET_SUSPEND
          break
        }

        case TARGET_RESUME: {
          this.resuming = true
          try {
            this.resumedAt = Date.now()
            await this._resume()
          } finally {
            this.resuming = false
          }
          this.actual = TARGET_RESUME
          this._resumeSignal.notify()
          break
        }

        case TARGET_WAKEUP: {
          this.waking = true
          try {
            this.wokenAt = Date.now()
            await this._wakeup()
          } finally {
            this.waking = false
          }
          if (this.target === TARGET_WAKEUP) {
            this.suspend(this._wakeupLinger)
          }
          break
        }
      }
    }
  }

  suspend (linger = 0) {
    this.target = TARGET_SUSPEND
    this.linger = linger
    return this.update()
  }

  resume () {
    this.target = TARGET_RESUME
    this.resumes++
    this.linger = 0
    this._interupt()
    return this.update()
  }

  wakeup () {
    if (this.target !== TARGET_SUSPEND) return Promise.resolve()
    this.target = TARGET_WAKEUP
    this.resumes++
    this.linger = 0
    this._interupt()
    return this.update()
  }
}

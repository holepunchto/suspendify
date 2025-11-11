const test = require('brittle')
const Suspendify = require('./index.js')

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

test('initial resume', async (t) => {
  t.plan(2)

  let resumeCalled = 0
  const s = new Suspendify({
    async resume() {
      resumeCalled++
    }
  })

  await s.suspend()
  await s.resume()

  t.is(resumeCalled, 1, 'resume called once')
  t.ok(s.resumed, 'is resumed')
})

test('do not resume when not suspended', async (t) => {
  t.plan(2)

  let resumeCalled = 0
  const s = new Suspendify({
    async resume() {
      resumeCalled++
    }
  })

  await s.resume()

  t.is(resumeCalled, 0, 'resume called once')
  t.ok(s.resumed, 'is resumed')
})

test('call resume only once when suspended', async (t) => {
  t.plan(2)

  let resumeCalled = 0
  const s = new Suspendify({
    async resume() {
      resumeCalled++
    }
  })
  await s.suspend()
  await s.resume()
  await s.resume()

  t.is(resumeCalled, 1, 'resume called once')
  t.ok(s.resumed, 'is resumed')
})

test('suspend with linger and pollLinger', async (t) => {
  t.plan(4)

  let suspendCalled = 0
  let pollCalls = 0
  const s = new Suspendify({
    pollLinger() {
      pollCalls++
      return 100
    },
    suspend() {
      suspendCalled++
    }
  })

  const before = Date.now()
  await s.suspend(2000)
  const elapsed = Date.now() - before

  t.ok(s.suspended, 'is suspended')
  t.is(suspendCalled, 1, 'suspend called once')
  t.ok(pollCalls > 1, 'pollLinger called multiple times')
  t.ok(elapsed >= 2000, `at least 300ms elapsed (got ${elapsed}ms)`)
})

test('suspend with linger and pollLinger returning static twice', async (t) => {
  t.plan(4)

  let suspendCalled = 0
  let pollCalls = 0
  const s = new Suspendify({
    pollLinger() {
      pollCalls++
      return 5_000
    },
    suspend() {
      suspendCalled++
    }
  })

  const before = Date.now()
  s.suspend(5_000)

  await new Promise((resolve) => setTimeout(resolve, 1000))

  s.resume()
  await s.suspend(5_000)
  const elapsed = Date.now() - before

  t.ok(s.suspended, 'is suspended')
  t.is(suspendCalled, 1, 'suspend called once')
  t.ok(pollCalls > 1, `pollLinger called multiple times (${pollCalls} calls)`)
  t.ok(elapsed >= 5500, `at least 5500ms elapsed (got ${elapsed}ms)`)
})

test('resume after suspend', async (t) => {
  t.plan(3)

  let suspendCalled = 0
  let resumeCalled = 0

  const s = new Suspendify({
    suspend() {
      suspendCalled++
    },
    resume() {
      resumeCalled++
    }
  })

  await s.suspend(0)
  await s.resume()

  t.ok(s.resume, 'resume method exists')
  t.is(suspendCalled, 1, 'suspend called once')
  t.is(resumeCalled, 1, 'resume called once')
})

test('interleaved suspend/resume calls', async (t) => {
  t.plan(1)

  let suspendCount = 0
  let resumeCount = 0

  const s = new Suspendify({
    suspend() {
      suspendCount++
    },
    resume() {
      resumeCount++
    },
    pollLinger() {
      return 200
    }
  })

  for (let i = 0; i < 5; i++) {
    s.resume()
    s.suspend(300)
    await delay(5)
  }

  await delay(1000)
  t.pass(`suspend/resume calls (suspend: ${suspendCount}, resume: ${resumeCount})`)
})

test('waitForResumed resolves after resume', async (t) => {
  t.plan(2)

  const s = new Suspendify({
    async resume() {
      // golden silence
    }
  })

  await s.suspend()

  setTimeout(async () => {
    await s.resume()
  }, 1000)
  await s.waitForResumed()
  t.is(s.resumed, true)

  t.ok(s.resumed, 'is resumed')
})

test('wakeup', async (t) => {
  t.plan(2)

  let suspendCount = 0
  let resumeCount = 0
  let wakeupCount = 0

  const s = new Suspendify({
    wakeupLinger: 200,
    suspend() {
      suspendCount++
    },
    resume() {
      resumeCount++
    },
    wakeup() {
      wakeupCount++
    },
    pollLinger() {
      return 200
    }
  })

  await s.suspend()

  t.alike(
    { suspendCount, resumeCount, wakeupCount },
    { suspendCount: 1, resumeCount: 0, wakeupCount: 0 }
  )

  await s.wakeup()

  t.alike(
    { suspendCount, resumeCount, wakeupCount },
    { suspendCount: 2, resumeCount: 0, wakeupCount: 1 }
  )
})

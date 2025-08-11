const test = require('brittle')
const Suspendify = require('./index.js')

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

test('initial resume', async (t) => {
  t.plan(2)

  let resumeCalled = 0
  const s = new Suspendify({
    async resume () {
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
    async resume () {
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
    async resume () {
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
    pollLinger () {
      pollCalls++
      return 100
    },
    suspend () {
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

test('resume after suspend', async (t) => {
  t.plan(3)

  let suspendCalled = 0
  let resumeCalled = 0

  const s = new Suspendify({
    suspend () {
      suspendCalled++
    },
    resume () {
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
    suspend () {
      suspendCount++
    },
    resume () {
      resumeCount++
    },
    pollLinger () {
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

test('resuspend extends linger time', async (t) => {
  t.plan(2)

  let suspendedAt = 0

  const s = new Suspendify({
    pollLinger () {
      return 100
    },
    suspend () {
      suspendedAt = Date.now()
    }
  })

  const start = Date.now()

  s.suspend(500)

  setTimeout(() => {
    s.resuspend(1500)
  }, 200)

  await delay(1800)

  const elapsed = suspendedAt - start

  t.ok(suspendedAt > 0, 'suspend was eventually called')
  t.ok(elapsed >= 1400, `suspend occurred after updated linger (got ${elapsed}ms)`)
})

test('waitForResumed resolves after resume', async (t) => {
  t.plan(2)

  const s = new Suspendify({
    async resume () {
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

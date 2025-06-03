import Suspendify from './index.js'

const s = new Suspendify({
  pollLinger () {
    console.log('poll', Date.now())
    return 30_000
  },
  resume () {
    console.log('resuming...')
  },
  suspend () {
    console.log('suspending...')
  }
})

await s.resume()
await s.resume()
await s.suspend(1000)

for (let i = 0; i < 5; i++) {
  s.resume()
  s.suspend(1000)
}

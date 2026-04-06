# suspendify

Suspend/resume state machine with linger support.
Made for mobile apps.

```
npm install suspendify
```

## Why this exists

Mobile platforms (iOS, Android) require apps to release resources — network connections, file locks, DHT announcements — when backgrounded. Holding a Corestore lock file or keeping Hyperswarm connections open in the background causes the OS to kill the app immediately.

The core difficulty: OS suspend/resume signals are **synchronous**, but actual teardown (closing swarm connections, releasing store locks) is **async and must be serialized** in the correct order. Naive implementations race — rapid suspend/resume toggling (user switching apps quickly) creates interleaved async operations that leave resources in undefined states.

Suspendify provides a state machine that safely maps synchronous lifecycle signals to ordered, serialized async operations. It handles:

- **Linger**: a grace period before full suspend (e.g., iOS background execution time), during which a `resume()` call cancels the pending suspend entirely.
- **Wakeup**: brief background activity (e.g., push notification processing) without a full resume cycle.
- **Interleaving**: rapid `suspend()`/`resume()` calls are coalesced — only the final target state is reached.

## Use cases

### Mobile p2p apps

Suspend Hyperswarm before Corestore on background, resume in reverse order. See [autopass](https://github.com/holepunchto/autopass) for this pattern:

```js
// Suspend (app going to background)
await pairing.suspend()
await swarm.suspend()
await store.suspend()

// Resume (app returning to foreground)
await store.resume()
await swarm.resume()
await pairing.resume()
```

### Bare runtime integration

Wire `Bare.on('suspend')` / `Bare.on('resume')` lifecycle events to suspendify. See [pearpass-lib-vault-core](https://github.com/tetherto/pearpass-lib-vault-core) for a complete example:

```js
const sus = new Suspendify({
  async suspend() {
    await suspendAllInstances()
  },
  async resume() {
    await resumeAllInstances()
  }
})

Bare.on('suspend', function (linger) {
  linger = Math.max(linger - 20_000, 0)
  sus.suspend(linger)
})
Bare.on('resume', function () {
  sus.resume()
})
```

### iOS background time with pollLinger

Use `pollLinger` to query remaining background execution time from the OS and defer full suspend as long as allowed:

```js
const sus = new Suspendify({
  async pollLinger() {
    return getRemainingBackgroundTime()
  },
  async suspend() {
    /* release resources */
  },
  async resume() {
    /* reacquire resources */
  }
})
```

### Brief background wakeup

Process a push notification without a full resume cycle. The machine auto-resuspends after `wakeupLinger` ms:

```js
const sus = new Suspendify({
  wakeupLinger: 5_000,
  async wakeup() {
    /* handle notification */
  },
  async suspend() {
    /* ... */
  },
  async resume() {
    /* ... */
  }
})

// Later, while suspended:
sus.wakeup()
```

## How it works

Suspendify is a three-state machine with a `target` and `actual` state:

```
              resume()                    suspend(linger)
  RESUMED <──────────────── SUSPENDED ────────────────── RESUMED
                               ▲
                               │
                           wakeup()
                               │
                            WAKEUP
                    (auto-resuspends after
                       wakeupLinger ms)
```

- **target** is set synchronously by `suspend()`, `resume()`, or `wakeup()`.
- **actual** transitions happen asynchronously inside the internal `_update()` loop.
- Transitions are serialized — only one `_update()` runs at a time.
- During **linger**, the machine sleeps before calling the `suspend` hook. A `resume()` call during linger interrupts the sleep and cancels the suspend.

### Suspend transition order

1. `presuspend` hook fires
2. Linger period begins (if `linger > 0`), with optional `pollLinger` polling
3. If not interrupted: `suspend` hook fires, state becomes `SUSPENDED`
4. If interrupted by `resume()`: `suspendCancelled` hook fires instead

## Usage

```js
const Suspendify = require('suspendify')

const sus = new Suspendify({
  async pollLinger() {
    // optional
    return millisecondsLeftToLinger
  },
  async suspend() {
    // stop your engines
  },
  async resume() {
    // resume your engines
  }
})

// suspend but wait up to 30_000
sus.suspend(30_000)

// resume asap
sus.resume()
```

## API

### `new Suspendify(opts)`

Create a new instance. All options are optional.

| Option             | Type             | Description                                                                                                                  |
| ------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `suspend`          | `async function` | Called when transitioning to suspended state                                                                                 |
| `resume`           | `async function` | Called when transitioning to resumed state                                                                                   |
| `presuspend`       | `async function` | Called before linger + suspend                                                                                               |
| `suspendCancelled` | `async function` | Called when a suspend is aborted mid-transition (e.g., `resume()` during linger)                                             |
| `wakeup`           | `async function` | Called for brief background wakeup                                                                                           |
| `pollLinger`       | `async function` | Return ms remaining; enables adaptive backoff polling during linger. When it returns `0` or a falsy value, linger ends early |
| `wakeupLinger`     | `number`         | Ms to linger after wakeup before auto-resuspending. Default: `3000`                                                          |

### Methods

#### `sus.suspend(linger = 0)`

Returns `Promise`. Sets target to suspended. `linger` is ms to wait before calling the `suspend` hook. Can be called fire-and-forget from synchronous OS lifecycle hooks.

#### `sus.resume()`

Returns `Promise`. Sets target to resumed. Interrupts any active linger sleep immediately.

#### `sus.resuspend(linger = 0)`

Returns `Promise`. Sets target to suspended with a new linger value without incrementing the internal resume counter.

#### `sus.wakeup()`

Returns `Promise`. No-op if not currently targeting suspend. Briefly wakes the machine — fires the `wakeup` hook, then auto-resuspends after `wakeupLinger` ms.

#### `sus.waitForResumed()`

Returns `Promise` that resolves when the machine reaches resumed state. Useful for blocking until resources are ready.

#### `sus.update()`

Returns `Promise`. Manually trigger a state transition evaluation.

### Properties

| Property          | Type               | Description                                                      |
| ----------------- | ------------------ | ---------------------------------------------------------------- |
| `sus.suspended`   | `boolean` (getter) | `true` when fully suspended                                      |
| `sus.resumed`     | `boolean` (getter) | `true` when not suspended                                        |
| `sus.suspending`  | `boolean`          | `true` while a suspend transition is in progress                 |
| `sus.resuming`    | `boolean`          | `true` while a resume transition is in progress                  |
| `sus.waking`      | `boolean`          | `true` while a wakeup transition is in progress                  |
| `sus.interrupted` | `boolean` (getter) | `true` if the current transition's target has changed mid-flight |
| `sus.suspendedAt` | `number`           | Timestamp (`Date.now()`) of last completed suspend               |
| `sus.resumedAt`   | `number`           | Timestamp (`Date.now()`) of last completed resume                |
| `sus.wokenAt`     | `number`           | Timestamp (`Date.now()`) of last completed wakeup                |

## Related modules

- [Hyperswarm](https://github.com/holepunchto/hyperswarm) — `swarm.suspend()` / `swarm.resume()` for the network layer
- [Corestore](https://github.com/holepunchto/corestore) — `store.suspend()` / `store.resume()` for the storage layer
- [suspend-resource](https://github.com/holepunchto/suspend-resource) — base class for resources that need suspend/resume lifecycle
- [autopass](https://github.com/holepunchto/autopass) — public app using the full suspend/resume orchestration pattern
- [pearpass-lib-vault-core](https://github.com/tetherto/pearpass-lib-vault-core) — full Bare runtime lifecycle integration with suspendify

## License

Apache-2.0

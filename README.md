# suspendify

Suspend/resume state machine with linger support.
Made for mobile apps.

```
npm install suspendify
```

## Usage

``` js
const Suspendify = require('suspendify')

const sus = new Suspendify({
  async pollLinger () { // optional
    return millisecondsLeftToLinger
  }
  async suspend () {
    // stop your engines
  },
  async resume () {
    // resume your engines
  }
})

// suspend but wait up to 30_000
sus.suspend(30_000)

// resume asap
sus.resume()
```
## API

#### `sus.suspend(time)`

#### `sus.resume()`

#### `sus.resuspend(time)`

#### `sus.resumedAt()`

#### `sus.suspendedAt()`

#### `sus.suspending`

#### `sus.suspended`

#### `sus.resuming`

#### `sus.resumed`



## License

Apache-2.0

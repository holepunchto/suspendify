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

## License

Apache-2.0

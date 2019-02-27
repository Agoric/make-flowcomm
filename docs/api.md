Calling `makeFlowComm()` returns a collection of objects: `Flow`, `Vow`,
`isVow`. These work as a set: `isVow(obj)` returns `true` for objects created
by `new Vow()` or a related constructor (including the return value of
`.then()` on another Vow). In any given program you should probably only use
one such collection.

The API of Vow is:

* `v = new Vow(getResolverFunc)`: create a new local Vow. The corresponding resolver is given to getResolverFunc, which is invoked before `new Vow()` returns.
* `v2 = v.then(onFulfill, onReject)`: attach callback/errback handlers to the Vow, which will be invoked (on a future turn of the event loop) when the Vow is fulfilled or rejected. `v2` is a new Vow that represents the return value of the handler functions.
* Several methods to perform asychronous operations on the resolved target of
  the Vow. All return a new Vow.
  * `v2 = v.get(name)` is like `v.then(val => val.name)`
  * `v.post(name, args)` is `v.then(val => val[name](...args))`
  * `v.send(name, ...args)` is `v.then(val => val[name](...args))`
  * `v.fcall(...args)` is `v.then(val => val(...args))`
  * `v.put(name, value)` is `v.then(val => val[name] = value)`. Its return Vow always resolves to `undefined`.
  * `v.delete(name)` is `v.then(val => delete val[name])`. The returned Vow resolves to `true`.
These methods are more flexible than `then` because the Vow might forward these calls over the network to another computer. The call can be delivered before the Vow itself resolves to a specific value, enabling "promise pipelining".
* `v2 = v.call(op, name, args)`: the generic form of get/post/send/fcall/put/delete, for use by a syntax rewriter. `v!foo(arg1, arg2)` is rewritten into `Vow.resolve(v).call('send', 'foo', [arg1, arg2])`, `v!foo` becomes `Vow.resolve(v).get('foo')`, etc.
* `v2 = v.fork()`: return a new Vow on a distinct Flow
* `v = Vow.all(answerPs)`: return a new Vow that fires when all of the input Vows have fired successfully, with an array of their results. TODO: is this supposed to reject when any of the input Vows rejects? Our current implementation doesn't do that.
* `v = Vow.join(xP, yP)`: return a new Vow that fires when and if the two input Vows resolve to the same value (using `Object.is()` for comparison).
* `v = Vow.race(answerPs)`: return a new Vow that fires when the first of `answerPs` fulfills or rejects, with the fulfillment or rejection of that promise.
* `v = Vow.resolve(value)`: if `value` is a Vow (of the same species), return that Vow. Otherwise create a Vow which resolves (in a future turn) to `value`.
* `v = Vow.fromFn(fn)`: invokes `fn` on a future turn, returns a new Vow for its result.

Our new extension is:

* `Vow.makeHook() -> { makePresence, makeRemote, shorten }`
* `makeRemote(handler, nextSlotP) -> vow`
* `makePresence(handler) -> { vow, presence }`
* `shorten(v) -> v2`

This "hook" (which needs a better name) is available to anyone with access to
the Vow constructor, but creates a new matched set of `makeRemote,
makePresence, shorten` each time it is called, so the three functions can be
closely held (e.g. by the Vat comms layer).

`makeRemote` constructs a new Vow whose internal "handler" is provided by the
caller. This handler gets to control how the `call` methods (`get/post/send/fcall/put/delete`) are implemented. These all delegate to `v.call(op, args)`, which invokes `handler.call(op, args)` and returns whatever the handler returns.

However the handler does not get control of `then`, which must always return a Vow (even if the handler does not). The handler is not even notified about `then`. The Vow keeps track of the resolution status (and target) internally, independent of the handler. When the Vow is resolved, the handler is deleted when the Vow is resolved.

The `nextSlotP` argument to `makeRemote` is used to resolve/redirect the new Vow to some next target. Internally, `makeRemote` attaches a `.then` to this value, and when it fires, it looks at the resolved value. If that is a promise that it recognizes, it replaces its own handler with the handler of that new value. If not, it waits for the new value to fully settle, then resolves the remotePromise to that new value. TODO: is this correct??

`makePresence` creates a matched pair of a Vow and a Presence object. The internal Vow tables are updated to remember their relationship, and `Vow.resolve(p)` on the presence will return that Vow, and `Vow.then()` on that Vow will yield that presence. The `then` direction could be simulated with a normal Vow, but the `resolve` direction is what requires special access, which is why `makePresence` is internal.

The handler for `makePresence` behaves just like the one for `makeRemote`, and gets control when the various `get/post/send` methods are invoked on the Vow.

`shorten` is still up in the air. In general, it accepts a Vow and either returns the same Vow or some other object, synchronously. If it returns the same Vow, you know the Vow was unresolved. If it returns anything else, you know the Vow was resolved, and it returns some form of resolution.

If vow1 is resolved to vow2, and vow2 is resolved to obj1 (not a Vow), then shortening vow1 should give you obj1.

To limit the danger of this footgun, we can limit `shorten` to only return other Vows of the same type (specifically the ones returned by `makeFar` or `makeRemote`). The purpose of shorten is for the comms layer to send messages to the currently-known "decider" of a remote vow, where messages should be queued, since that's the location with the most knowledge. This forwarding might be achieved by just replacing the handler of one Vow with that of another. If these three methods only work on each other's values, then `Vow.makeHook()` is safe to expose to everybody, because the particular instance of the trio can be closely held by the comms layer.

Alternatively, we could have a single instance of the trio per instance of a Vow system (`Vow`,`Flow`,`isVow`), but give them only to the creator of that system, who can then hold them closely or share them freely. In this case, we don't need `makeHook()`, but we need `makeFlowComm()` to return the same three functions in the return value next to `Vow` and `Flow`.

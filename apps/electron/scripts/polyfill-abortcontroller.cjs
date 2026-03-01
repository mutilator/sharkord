// ensure AbortController exists for environments like Bun that don't define it
if (typeof globalThis.AbortController === 'undefined') {
  class AbortController {
    constructor() {
      this.signal = {
        aborted: false,
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
      };
    }
    abort() {
      this.signal.aborted = true;
    }
  }
  globalThis.AbortController = AbortController;
  globalThis.AbortSignal = AbortController.prototype.signal;
}

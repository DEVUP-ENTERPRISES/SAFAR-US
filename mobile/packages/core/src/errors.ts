/*
 * App-wide crash guards: an uncaught error or a rejected promise is logged and
 * shown as a calm message, never a red screen or a closed app. Each route also
 * has its own ErrorBoundary (see RouteErrorBoundary) so one bad screen cannot
 * take the rest of the app down.
 */
type Reporter = (message: string) => void;

let notify: Reporter = () => undefined;
let installed = false;

export function setErrorNotifier(fn: Reporter) {
  notify = fn;
}

function log(kind: string, err: unknown) {
  if (__DEV__) console.warn(`[${kind}]`, err);
}

export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;

  const errorUtils = (globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: Error, fatal?: boolean) => void; setGlobalHandler: (h: (e: Error, fatal?: boolean) => void) => void } }).ErrorUtils;
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, fatal) => {
      log('uncaught', error);
      notify('Something went wrong. Please try that again.');
      // In development keep the red box; in production a non-fatal error never closes the app.
      if (__DEV__) previous(error, fatal);
    });
  }

  const hermes = (globalThis as unknown as { HermesInternal?: { enablePromiseRejectionTracker?: (o: { allRejections: boolean; onUnhandled: (id: number, e: unknown) => void }) => void } }).HermesInternal;
  hermes?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, error) => log('unhandled promise', error),
  });
}

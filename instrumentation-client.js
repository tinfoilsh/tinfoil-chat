import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  debug: false,
});

// Add global fetch error tracking
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  try {
    const response = await originalFetch.apply(this, args);
    if (!response.ok) {
      Sentry.captureException(new Error(`HTTP error! status: ${response.status}`), {
        extra: {
          url: args[0],
          status: response.status,
          statusText: response.statusText,
        },
      });
    }
    return response;
  } catch (error) {
    Sentry.captureException(error, {
      extra: {
        url: args[0],
        method: args[1]?.method || 'unknown',
      },
    });
    throw error;
  }
};

// This export will instrument router navigations, and is only relevant if you enable tracing.
// `captureRouterTransitionStart` is available from SDK version 9.12.0 onwards
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

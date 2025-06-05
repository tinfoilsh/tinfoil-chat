export function useSubscriptionStatus() {
  return {
    isLoading: false,
    error: null,
    is_subscribed: true,
    chat_subscription_active: true,
    api_subscription_active: true,
  }
}

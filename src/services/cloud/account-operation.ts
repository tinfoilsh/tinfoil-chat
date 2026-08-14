export interface AccountOperationGuard {
  readonly userId: string | null
  assertCurrent(): void
  isCurrent(): boolean
}

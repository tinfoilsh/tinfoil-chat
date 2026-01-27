import { expect, test } from '@playwright/test'

test.describe('Smoke Tests', () => {
  test('app loads in light mode by default', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Light mode is the default (data-theme="light" set in layout.tsx)
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'light')
  })

  test('can toggle between light and dark mode', async ({ page }) => {
    test.skip(
      page.viewportSize()?.width !== undefined &&
        page.viewportSize()!.width < 768,
      'Settings button is hidden on mobile viewports',
    )

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const html = page.locator('html')

    // Starts in light mode
    await expect(html).toHaveAttribute('data-theme', 'light')

    // First open the sidebar (it may be collapsed)
    const sidebarToggle = page.locator('button[aria-label="Expand sidebar"]')
    if (await sidebarToggle.isVisible()) {
      await sidebarToggle.click()
      // Wait for sidebar to open
      await page.waitForTimeout(300)
    }

    // Now click the settings button inside the sidebar
    const settingsButton = page.locator('#settings-button')
    await expect(settingsButton).toBeVisible({ timeout: 10000 })
    await settingsButton.click()

    // Navigate to the General tab where the theme toggle is located
    // There are mobile and desktop tab buttons - only click the visible one
    const generalTab = page
      .locator('button', { hasText: 'General' })
      .filter({ visible: true })
      .first()
    await generalTab.click()

    // Find and click the theme toggle button in the settings modal
    const themeToggle = page.locator('#theme-toggle')
    await expect(themeToggle).toBeVisible({ timeout: 5000 })
    await themeToggle.click()

    // Should now be in dark mode
    await expect(html).toHaveAttribute('data-theme', 'dark')

    // Toggle back to light mode
    await themeToggle.click()
    await expect(html).toHaveAttribute('data-theme', 'light')
  })

  test('app loads and displays welcome screen', async ({ page }) => {
    await page.goto('/')

    // Wait for the app to hydrate
    await page.waitForLoadState('networkidle')

    // Should display the welcome heading (for unauthenticated users)
    const heading = page.locator('h1')
    await expect(heading).toBeVisible({ timeout: 10000 })
    await expect(heading).toContainText('Tinfoil Private Chat')
  })

  test('chat input is present and functional', async ({ page }) => {
    test.skip(
      page.viewportSize()?.width !== undefined &&
        page.viewportSize()!.width < 768,
      'Chat input is hidden on mobile viewports',
    )

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const textarea = page.locator('#chat-input')
    await expect(textarea).toBeVisible({ timeout: 10000 })

    // Should have a valid placeholder (randomly selected from a list)
    const placeholder = await textarea.getAttribute('placeholder')
    const validPlaceholders = [
      "What's on your mind?",
      'Ask me anything...',
      'How can I help you today?',
      "Go ahead, I won't tell anyone...",
      'Your secrets are safe with me...',
    ]
    expect(validPlaceholders).toContain(placeholder)

    // Should be able to type in it
    await textarea.fill('Hello, this is a test message')
    await expect(textarea).toHaveValue('Hello, this is a test message')
  })

  test('document upload button exists', async ({ page }) => {
    test.skip(
      page.viewportSize()?.width !== undefined &&
        page.viewportSize()!.width < 768,
      'Upload button is hidden on mobile viewports',
    )

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const uploadButton = page.locator('#upload-button')
    await expect(uploadButton).toBeVisible({ timeout: 10000 })
  })

  test('send button is present', async ({ page }) => {
    test.skip(
      page.viewportSize()?.width !== undefined &&
        page.viewportSize()!.width < 768,
      'Send button is hidden on mobile viewports',
    )

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const sendButton = page.locator('#send-button')
    await expect(sendButton).toBeVisible({ timeout: 10000 })
  })

  test('page has correct title', async ({ page }) => {
    await page.goto('/')

    // Check page title - adjust based on what your app actually sets
    await expect(page).toHaveTitle(/Tinfoil/i)
  })

  test('no console errors on load', async ({ page }) => {
    const consoleErrors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        // Ignore some common non-critical errors
        const text = msg.text()
        if (
          !text.includes('favicon') &&
          !text.includes('Failed to load resource') &&
          !text.includes('net::ERR_')
        ) {
          consoleErrors.push(text)
        }
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Give some time for any deferred errors
    await page.waitForTimeout(1000)

    // Should have no critical console errors
    expect(consoleErrors).toHaveLength(0)
  })

  test('verification status display is visible', async ({ page }) => {
    test.skip(
      page.viewportSize()?.width !== undefined &&
        page.viewportSize()!.width < 768,
      'Verification button is hidden on mobile viewports',
    )

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const verificationButton = page.locator('#verification-status')
    await expect(verificationButton).toBeVisible({ timeout: 10000 })
  })

  test('shows verifying state initially then transitions to final state', async ({
    page,
  }) => {
    test.skip(
      page.viewportSize()?.width !== undefined &&
        page.viewportSize()!.width < 768,
      'Verification button is hidden on mobile viewports',
    )

    await page.goto('/')

    const verificationButton = page.locator('#verification-status')
    await expect(verificationButton).toBeVisible({ timeout: 10000 })

    // Initially should show a spinner (verifying) OR already be in a final state
    // (depending on how fast the verification completes)
    // The button contains either a spinner, checkmark, or exclamation icon
    const spinnerIcon = verificationButton.locator('.animate-spin')
    const checkmarkIcon = verificationButton.locator('.text-emerald-500')
    const errorIcon = verificationButton.locator('.text-red-500')

    // Wait for either state to be visible initially
    await expect(spinnerIcon.or(checkmarkIcon).or(errorIcon)).toBeVisible({
      timeout: 10000,
    })

    // Eventually should transition to a final state (verified or failed)
    await expect(checkmarkIcon.or(errorIcon)).toBeVisible({ timeout: 15000 })
  })

  test('verification badge shows final state icon', async ({ page }) => {
    test.skip(
      page.viewportSize()?.width !== undefined &&
        page.viewportSize()!.width < 768,
      'Verification button is hidden on mobile viewports',
    )

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const verificationButton = page.locator('#verification-status')
    await expect(verificationButton).toBeVisible({ timeout: 10000 })

    // Wait for verification to complete (success or failure)
    // Success shows emerald checkmark, failure shows red exclamation
    const checkmarkIcon = verificationButton.locator('.text-emerald-500')
    const errorIcon = verificationButton.locator('.text-red-500')
    await expect(checkmarkIcon.or(errorIcon)).toBeVisible({ timeout: 15000 })
  })

  test('clicking verification button opens sidebar', async ({ page }) => {
    test.skip(
      page.viewportSize()?.width !== undefined &&
        page.viewportSize()!.width < 768,
      'Verification button is hidden on mobile viewports',
    )

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const verificationButton = page.locator('#verification-status')
    await expect(verificationButton).toBeVisible({ timeout: 10000 })

    // Wait for verification to complete (success or failure)
    const checkmarkIcon = verificationButton.locator('.text-emerald-500')
    const errorIcon = verificationButton.locator('.text-red-500')
    await expect(checkmarkIcon.or(errorIcon)).toBeVisible({ timeout: 15000 })

    // Click the verification button to open the sidebar
    await verificationButton.click()

    // Verification sidebar should appear (it contains an iframe to verification-center.tinfoil.sh)
    const sidebar = page.locator('iframe[title="Tinfoil Verification Center"]')
    await expect(sidebar).toBeVisible({ timeout: 10000 })
  })

  test('renders properly on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Welcome heading should still be visible
    const heading = page.locator('h1')
    await expect(heading).toBeVisible({ timeout: 10000 })
  })

  test('renders properly on tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Welcome heading should be visible
    const heading = page.locator('h1')
    await expect(heading).toBeVisible({ timeout: 10000 })
  })
})

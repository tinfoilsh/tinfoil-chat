import { expect, test } from '@playwright/test'

test.describe('Smoke Tests', () => {
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
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Chat input should be visible (on desktop)
    const textarea = page.locator('textarea')

    // On desktop, the textarea should be visible
    const viewportSize = page.viewportSize()
    if (viewportSize && viewportSize.width >= 768) {
      await expect(textarea).toBeVisible({ timeout: 10000 })

      // Should have the correct placeholder
      await expect(textarea).toHaveAttribute(
        'placeholder',
        "What's on your mind?",
      )

      // Should be able to type in it
      await textarea.fill('Hello, this is a test message')
      await expect(textarea).toHaveValue('Hello, this is a test message')
    }
  })

  test('document upload button exists', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // On desktop, the upload button should be visible
    const viewportSize = page.viewportSize()
    if (viewportSize && viewportSize.width >= 768) {
      const uploadButton = page.locator('button[title="Upload document"]')
      await expect(uploadButton).toBeVisible({ timeout: 10000 })
    }
  })

  test('send button is present', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // On desktop, the send button should be visible
    const viewportSize = page.viewportSize()
    if (viewportSize && viewportSize.width >= 768) {
      // The send button has a specific class structure
      const sendButton = page.locator('button.rounded-full')
      await expect(sendButton.first()).toBeVisible({ timeout: 10000 })
    }
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
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // The verification status component should be present
    // It contains info about Tinfoil's verification system
    const verificationSection = page.locator('.no-scroll-anchoring')
    await expect(verificationSection).toBeVisible({ timeout: 10000 })
  })

  test('shows verifying state initially then transitions to verified', async ({
    page,
  }) => {
    await page.goto('/')

    // Look for the verification status area
    const verificationArea = page.locator('.no-scroll-anchoring')
    await expect(verificationArea).toBeVisible({ timeout: 10000 })

    // Initially should show "Verifying security..." OR already be verified
    // (depending on how fast the verification completes)
    const verifyingText = verificationArea.getByText('Verifying security...')
    const verifiedText = verificationArea.getByText('Privacy Verified')

    // Wait for either state to be visible initially
    await expect(verifyingText.or(verifiedText)).toBeVisible({ timeout: 10000 })

    // Eventually should show "Privacy Verified" (15s timeout for external verification service)
    await expect(verifiedText).toBeVisible({ timeout: 15000 })
  })

  test('privacy verified badge has correct visual elements', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const verificationArea = page.locator('.no-scroll-anchoring')
    await expect(verificationArea).toBeVisible({ timeout: 10000 })

    // Wait for verification to complete
    const verifiedText = verificationArea.getByText('Privacy Verified')
    await expect(verifiedText).toBeVisible({ timeout: 15000 })

    // The verified text should be green (emerald-500)
    await expect(verifiedText).toHaveClass(/text-emerald-500/)
  })

  test('can expand verification details and see proof button', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const verificationArea = page.locator('.no-scroll-anchoring')

    // Wait for verification to complete
    const verifiedText = verificationArea.getByText('Privacy Verified')
    await expect(verifiedText).toBeVisible({ timeout: 15000 })

    // Click to expand the verification details
    const expandButton = verificationArea.locator('button').first()
    await expandButton.click()

    // Should show the expanded content with privacy explanation
    const privacyExplanation = verificationArea.getByText(
      'This conversation is private',
    )
    await expect(privacyExplanation).toBeVisible({ timeout: 5000 })

    // Should show "See verification proof" button
    const proofButton = verificationArea.getByText('See verification proof')
    await expect(proofButton).toBeVisible({ timeout: 5000 })
  })

  test('verification proof button opens sidebar', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const verificationArea = page.locator('.no-scroll-anchoring')

    // Wait for verification to complete
    const verifiedText = verificationArea.getByText('Privacy Verified')
    await expect(verifiedText).toBeVisible({ timeout: 15000 })

    // Expand the details
    const expandButton = verificationArea.locator('button').first()
    await expandButton.click()

    // Click "See verification proof"
    const proofButton = verificationArea.getByText('See verification proof')
    await expect(proofButton).toBeVisible({ timeout: 5000 })
    await proofButton.click()

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

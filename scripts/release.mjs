import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const MAIN_BRANCH = 'main'
const REMOTE = 'origin'
const REMOTE_MAIN_REF = `refs/remotes/${REMOTE}/${MAIN_BRANCH}`
const PREPARE_COMMAND = 'prepare'
const PUBLISH_COMMAND = 'publish'
const VERSION_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$/

function run(command, args, captureOutput = false) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  }).trim()
}

function readPackageVersion() {
  return JSON.parse(readFileSync('package.json', 'utf8')).version
}

function requireCleanMain() {
  if (run('git', ['status', '--porcelain'], true)) {
    throw new Error(
      'The working tree must be clean before a release operation.',
    )
  }

  const branch = run('git', ['branch', '--show-current'], true)

  if (branch !== MAIN_BRANCH) {
    throw new Error(`Releases must be prepared from ${MAIN_BRANCH}.`)
  }

  run('git', ['pull', '--ff-only', REMOTE, MAIN_BRANCH])

  const headCommit = run('git', ['rev-parse', 'HEAD'], true)
  const remoteMainCommit = run('git', ['rev-parse', REMOTE_MAIN_REF], true)

  if (headCommit !== remoteMainCommit) {
    throw new Error(`Local ${MAIN_BRANCH} must match ${REMOTE}/${MAIN_BRANCH}.`)
  }
}

function requireAvailableTag(releaseTag, allowLocalTagAtHead = false) {
  const localTag = spawnSync(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/tags/${releaseTag}`],
    { encoding: 'utf8' },
  )

  if (localTag.status === 0) {
    if (!allowLocalTagAtHead) {
      throw new Error(`Tag ${releaseTag} already exists locally.`)
    }

    const tagCommit = run(
      'git',
      ['rev-parse', `refs/tags/${releaseTag}^{commit}`],
      true,
    )
    const headCommit = run('git', ['rev-parse', 'HEAD'], true)

    if (tagCommit !== headCommit) {
      throw new Error(`Local tag ${releaseTag} does not point to HEAD.`)
    }
  }

  if (localTag.status !== 0 && localTag.status !== 1) {
    throw new Error(localTag.stderr.trim() || 'Unable to inspect local tags.')
  }

  const remoteTag = spawnSync(
    'git',
    ['ls-remote', '--exit-code', '--tags', REMOTE, `refs/tags/${releaseTag}`],
    { encoding: 'utf8' },
  )

  if (remoteTag.status === 0) {
    throw new Error(`Tag ${releaseTag} already exists on ${REMOTE}.`)
  }

  if (remoteTag.status !== 2) {
    throw new Error(remoteTag.stderr.trim() || 'Unable to inspect remote tags.')
  }

  return localTag.status === 0
}

function prepareRelease(requestedVersion) {
  requireCleanMain()
  run('gh', ['auth', 'status'])

  const normalizedVersion = requestedVersion.replace(/^v/, '')

  if (!VERSION_PATTERN.test(normalizedVersion)) {
    throw new Error(`Invalid release version: ${requestedVersion}.`)
  }

  const releaseTag = `v${normalizedVersion}`
  requireAvailableTag(releaseTag)

  const releaseBranch = `chore/release-${releaseTag}`
  run('git', ['switch', '-c', releaseBranch])

  const npmReleaseTag = run(
    'npm',
    ['version', normalizedVersion, '--no-git-tag-version'],
    true,
  )
  const packageVersion = readPackageVersion()

  if (npmReleaseTag !== releaseTag || packageVersion !== normalizedVersion) {
    throw new Error(`npm returned an unexpected release tag: ${npmReleaseTag}.`)
  }

  run('node', ['scripts/check-release-settings.mjs', releaseTag])
  run('git', ['add', 'package.json', 'package-lock.json'])
  run('git', ['commit', '-m', `chore: prepare release ${releaseTag}`])
  run('git', ['push', '-u', REMOTE, releaseBranch])

  const pullRequestUrl = run(
    'gh',
    [
      'pr',
      'create',
      '--base',
      MAIN_BRANCH,
      '--head',
      releaseBranch,
      '--title',
      `chore: prepare release ${releaseTag}`,
      '--body',
      `## Summary\n- update package versions for ${releaseTag}\n- prepare the matching release tag`,
    ],
    true,
  )

  process.stdout.write(
    `Release PR created: ${pullRequestUrl}\nAfter it merges, run: git switch main && npm run release -- publish ${packageVersion}\n`,
  )
}

function publishRelease(requestedVersion) {
  requireCleanMain()

  const packageVersion = readPackageVersion()
  const normalizedVersion = requestedVersion.replace(/^v/, '')

  if (normalizedVersion !== packageVersion) {
    throw new Error(
      `Requested version ${normalizedVersion} does not match package version ${packageVersion}.`,
    )
  }

  const releaseTag = `v${packageVersion}`
  const localTagExists = requireAvailableTag(releaseTag, true)
  run('node', ['scripts/check-release-settings.mjs', releaseTag])

  if (!localTagExists) {
    run('git', ['tag', '-a', releaseTag, '-m', releaseTag])
  }

  run('git', ['push', REMOTE, `refs/tags/${releaseTag}`])
  process.stdout.write(`Published ${releaseTag}.\n`)
}

function printUsage() {
  process.stdout.write(
    'Usage:\n  npm run release -- prepare <version>\n  npm run release -- publish <version>\n',
  )
}

const [command, requestedVersion] = process.argv.slice(2)

if (command === '--help' || command === '-h') {
  printUsage()
} else if (!requestedVersion) {
  printUsage()
  process.exitCode = 1
} else {
  try {
    if (command === PREPARE_COMMAND) {
      prepareRelease(requestedVersion)
    } else if (command === PUBLISH_COMMAND) {
      publishRelease(requestedVersion)
    } else {
      throw new Error(`Unknown release command: ${command}.`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}

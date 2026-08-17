import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const packageLock = JSON.parse(await readFile('package-lock.json', 'utf8'))
const packageVersion = packageJson.version
const lockVersion = packageLock.packages?.['']?.version

if (
  !packageVersion ||
  packageVersion !== packageLock.version ||
  packageVersion !== lockVersion
) {
  throw new Error('Package release versions are missing or inconsistent.')
}

const releaseRef = process.argv[2]

if (!releaseRef?.startsWith('v')) {
  throw new Error('A release tag starting with v is required.')
}

const releaseVersion = releaseRef.slice(1)
const releaseBaseVersion = releaseVersion.split('-', 1)[0]

if (releaseBaseVersion !== packageVersion) {
  throw new Error(
    `Release tag ${releaseRef} does not match package version ${packageVersion}.`,
  )
}

process.stdout.write(`Release settings are consistent: ${packageVersion}.\n`)

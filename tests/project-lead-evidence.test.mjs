import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Integration tests for scripts/export-project-lead-evidence.ps1.
//
// Every test runs the real generator against an isolated temporary Git
// repository (bare "origin" plus a working clone) and a temporary output root.
// Nothing here touches the project repository, OneDrive, Supabase or Vercel.
// The generator is Windows PowerShell only, so the suite skips elsewhere.

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const script = path.join(repoRoot, 'scripts', 'export-project-lead-evidence.ps1')
const finalFiles = ['VECTOR_EVIDENCE.md', 'PROJECT_STATE.md', 'GOVERNANCE_CONTEXT.md']
const governanceSources = [
  'AGENTS.md',
  'docs/RULE_INDEX.md',
  'docs/governance/AI_OPERATING_MODEL.md',
  'docs/frozen/DB_ENVIRONMENT_GOVERNANCE_V1.md',
  'docs/handover/VECTOR_RESTART_HANDOVER.md',
]
const excludedMarkers = [
  'SECRET_FIXTURE_MARKER',
  'SCMDB_FIXTURE_MARKER',
  'APP_SOURCE_FIXTURE_MARKER',
  'TEST_FIXTURE_MARKER',
  'SQL_FIXTURE_MARKER',
  'PRIVATE_SECURITY_MARKER',
]

const canRun =
  process.platform === 'win32' &&
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'exit 0']).status === 0 &&
  spawnSync('git', ['--version']).status === 0
const skip = canRun ? false : 'requires Windows PowerShell 5.1 and git'

const gitBase = ['-c', 'user.name=VECTOR Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false']

const git = (cwd, args, { buffer = false } = {}) => {
  const result = spawnSync('git', [...gitBase, ...args], {
    cwd,
    encoding: buffer ? 'buffer' : 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout
}

const writeTree = (root, files) => {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, ...relative.split('/'))
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

const commitAll = (cwd, message) => {
  git(cwd, ['add', '-A'])
  git(cwd, ['commit', '-q', '-m', message])
  return git(cwd, ['rev-parse', 'HEAD']).trim()
}

const fixtureSources = {
  'AGENTS.md': '# Agents\n\nAGENTS_FIXTURE_MARKER\n',
  'docs/RULE_INDEX.md': '# Rule Index\n\nRULE_INDEX_FIXTURE_MARKER\n',
  'docs/governance/AI_OPERATING_MODEL.md': '# Operating Model\n\nOPERATING_MODEL_FIXTURE_MARKER\n',
  'docs/frozen/DB_ENVIRONMENT_GOVERNANCE_V1.md': '# DB Environment\n\nDB_ENV_FIXTURE_MARKER\n',
  // The decoy line proves that commit statements inside embedded content are
  // ignored by the consistency check.
  'docs/handover/VECTOR_RESTART_HANDOVER.md':
    '# Handover\n\nSnapshot Commit: 0000000000000000000000000000000000000000\n\nHANDOVER_FIXTURE_MARKER\n',
  'docs/PROJECT_STATE.md':
    '# Project State\n\nState verified through commit: 1111111111111111111111111111111111111111\n\nPROJECT_STATE_FIXTURE_MARKER\n',
}

const fixtureExcluded = {
  '.gitignore': '.env.local\nnode_modules/\n',
  'data/scmdb/latest.json': '{"marker":"SCMDB_FIXTURE_MARKER"}\n',
  'lib/app.ts': '// APP_SOURCE_FIXTURE_MARKER\n',
  'tests/example.test.mjs': '// TEST_FIXTURE_MARKER\n',
  'database/migrations/001_example.sql': '-- SQL_FIXTURE_MARKER\n',
}

const fixtures = []

// Paths deliberately contain spaces: "work tree" and "evidence out".
const createFixture = ({ branch = 'develop', omit = [], sources = fixtureSources } = {}) => {
  const root = mkdtempSync(path.join(tmpdir(), 'vector-evidence-'))
  const origin = path.join(root, 'origin.git')
  const work = path.join(root, 'work tree')
  const out = path.join(root, 'evidence out')
  mkdirSync(work)
  mkdirSync(out)
  git(root, ['init', '-q', '--bare', origin])
  git(work, ['init', '-q'])
  git(work, ['checkout', '-q', '-b', branch])
  git(work, ['remote', 'add', 'origin', origin])
  const files = { ...sources, ...fixtureExcluded }
  for (const relative of omit) delete files[relative]
  writeTree(work, files)
  writeFileSync(path.join(work, '.env.local'), 'SECRET_FIXTURE_MARKER=1\n')
  const sha = commitAll(work, 'fixture: initial state')
  git(work, ['push', '-q', '-u', 'origin', branch])
  for (const dir of [
    'Private_Evidence/Security',
    'Private_Evidence/Backup',
    'Private_Evidence/Recovery',
    'WP_EVIDENCE',
    'Evidence/CURRENT',
    'Evidence/ARCHIVE',
  ]) {
    mkdirSync(path.join(out, ...dir.split('/')), { recursive: true })
  }
  writeTree(out, {
    'VECTOR_PROJECT_LEAD_INSTRUCTIONS.md': '# private operating contract (fixture)\n',
    'Private_Evidence/Security/finding.md': 'PRIVATE_SECURITY_MARKER\n',
    'Private_Evidence/Backup/backup.txt': 'backup\n',
    'Private_Evidence/Recovery/recovery.txt': 'recovery\n',
    'WP_EVIDENCE/wp.txt': 'wp\n',
  })
  const fixture = {
    root,
    origin,
    work,
    out,
    sha,
    evidence: path.join(out, 'Evidence'),
    current: path.join(out, 'Evidence', 'CURRENT'),
    archive: path.join(out, 'Evidence', 'ARCHIVE'),
  }
  fixtures.push(fixture)
  return fixture
}

const runGenerator = (fixture, extra = []) => {
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      '-OutputRoot',
      fixture.out,
      '-RepositoryRoot',
      fixture.work,
      ...extra,
    ],
    { encoding: 'utf8', timeout: 180_000 },
  )
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  return { status: result.status, text }
}

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex')

const snapshotDir = dir => {
  const entries = {}
  const walk = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else entries[path.relative(dir, full).replace(/\\/g, '/')] = sha256(readFileSync(full))
    }
  }
  if (existsSync(dir)) walk(dir)
  return entries
}

// Content hash plus modification time, for a directory tree or a single file.
const snapshotWithTimes = target => {
  if (statSync(target).isFile()) {
    return { [path.basename(target)]: `${sha256(readFileSync(target))}@${statSync(target).mtimeMs}` }
  }
  const entries = snapshotDir(target)
  for (const relative of Object.keys(entries)) {
    entries[relative] += `@${statSync(path.join(target, relative)).mtimeMs}`
  }
  return entries
}

const readCurrent = fixture =>
  Object.fromEntries(finalFiles.map(name => [name, readFileSync(path.join(fixture.current, name), 'utf8')]))

const field = (text, label) => {
  const match = text.match(new RegExp(`^${label}:[ \\t]*(.*)$`, 'm'))
  return match ? match[1].trim() : null
}

// Commit statements of an evidence file, ignoring embedded source content.
const commitStatements = text => {
  const commits = []
  let inside = false
  for (const line of text.split(/\r?\n/)) {
    if (/^----- BEGIN CONTENT .+ -----$/.test(line)) inside = true
    else if (/^----- END CONTENT .+ -----$/.test(line)) inside = false
    else if (!inside) {
      const match = line.match(/^Snapshot Commit:[ \t]*(.*)$/)
      if (match) commits.push(match[1].trim())
    }
  }
  return commits
}

const assertBlocked = (run, pattern) => {
  assert.notEqual(run.status, 0, `expected non-zero exit\n${run.text}`)
  assert.match(run.text, /RESULT: BLOCKED/)
  if (pattern) assert.match(run.text, pattern)
}

const assertPass = run => {
  assert.equal(run.status, 0, run.text)
  assert.match(run.text, /RESULT: PASS/)
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

test.after(() => {
  for (const fixture of fixtures) {
    try {
      rmSync(fixture.root, { recursive: true, force: true })
    } catch {
      // Best effort: a leftover temp directory is not a test failure.
    }
  }
})

// --------------------------------------------------------------------------
// Success path (shared fixture, sequential)
// --------------------------------------------------------------------------

const happy = canRun ? createFixture() : null
let privateBefore = null
let happyFirst = null

test('clean synchronized checkout produces the three consistent files (paths with spaces)', { skip }, () => {
  privateBefore = {
    security: snapshotWithTimes(path.join(happy.out, 'Private_Evidence')),
    wp: snapshotWithTimes(path.join(happy.out, 'WP_EVIDENCE')),
    contract: snapshotWithTimes(path.join(happy.out, 'VECTOR_PROJECT_LEAD_INSTRUCTIONS.md')),
  }
  const run = runGenerator(happy)
  assertPass(run)
  assert.match(run.text, new RegExp(`Snapshot ID: develop:${happy.sha}`))
  assert.deepEqual(readdirSync(happy.current).sort(), [...finalFiles].sort())
  const current = readCurrent(happy)
  const evidence = current['VECTOR_EVIDENCE.md']
  assert.equal(field(evidence, 'Evidence Status'), 'VERIFIED_AT_GENERATION')
  assert.equal(field(evidence, 'Snapshot ID'), `develop:${happy.sha}`)
  assert.equal(field(evidence, 'Branch'), 'develop')
  assert.equal(field(evidence, 'Baseline Ref'), 'origin/develop')
  assert.equal(field(evidence, 'Baseline Ref HEAD'), happy.sha)
  assert.equal(field(evidence, 'Remote Evidence'), 'FRESHLY_FETCHED')
  assert.equal(field(evidence, 'Working Tree'), 'CLEAN')
  assert.match(evidence, /NOT live GitHub access/)
  assert.match(evidence, /OneDrive cloud synchronization happens outside the generator/)
  assert.match(evidence, /Source Path: docs\/PROJECT_STATE\.md/)
  assert.match(evidence, /Generated \(UTC\): \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/)
  for (const source of governanceSources) {
    assert.match(evidence, new RegExp(`^- ${source.replace(/[./]/g, '\\$&')} \\|`, 'm'))
  }
  happyFirst = current
})

test('all commit-specific evidence references one full Snapshot Commit', { skip }, () => {
  const current = readCurrent(happy)
  const statements = [
    ...commitStatements(current['VECTOR_EVIDENCE.md']),
    ...commitStatements(current['GOVERNANCE_CONTEXT.md']),
  ]
  // header + PROJECT_STATE section in VECTOR_EVIDENCE, header + 5 sources in GOVERNANCE_CONTEXT
  assert.equal(statements.length, 2 + 1 + governanceSources.length)
  assert.deepEqual([...new Set(statements)], [happy.sha])
  const context = current['GOVERNANCE_CONTEXT.md']
  for (const source of governanceSources) {
    assert.match(context, new RegExp(`^Repository Path: ${source.replace(/[./]/g, '\\$&')}$`, 'm'))
    assert.ok(context.includes(`----- BEGIN CONTENT ${source} -----`))
    assert.ok(context.includes(`----- END CONTENT ${source} -----`))
  }
  assert.ok(context.includes('HANDOVER_FIXTURE_MARKER'))
  assert.ok(context.includes('OPERATING_MODEL_FIXTURE_MARKER'))
})

test('exported PROJECT_STATE is identical to the repository source at the Snapshot Commit and needs no self SHA', { skip }, () => {
  const exported = readFileSync(path.join(happy.current, 'PROJECT_STATE.md'))
  const source = git(happy.work, ['show', `${happy.sha}:docs/PROJECT_STATE.md`], { buffer: true })
  assert.ok(exported.equals(source), 'exported PROJECT_STATE.md differs from git show at the Snapshot Commit')
  const evidence = readCurrent(happy)['VECTOR_EVIDENCE.md']
  assert.equal(field(evidence, 'Exported PROJECT_STATE SHA256'), sha256(exported))
  assert.ok(!exported.toString('utf8').includes(happy.sha), 'PROJECT_STATE must not be required to contain its own Snapshot Commit')
})

test('excluded source and data areas are not exported and CURRENT holds no operational debris', { skip }, () => {
  const current = readCurrent(happy)
  for (const [name, text] of Object.entries(current)) {
    for (const marker of excludedMarkers) {
      assert.ok(!text.includes(marker), `${name} contains excluded marker ${marker}`)
    }
  }
  assert.deepEqual(readdirSync(happy.current).sort(), [...finalFiles].sort())
  assert.deepEqual(readdirSync(happy.evidence).sort(), ['ARCHIVE', 'CURRENT'])
})

test('Private_Evidence, WP_EVIDENCE and the private contract are not modified', { skip }, () => {
  assert.deepEqual(snapshotWithTimes(path.join(happy.out, 'Private_Evidence')), privateBefore.security)
  assert.deepEqual(snapshotWithTimes(path.join(happy.out, 'WP_EVIDENCE')), privateBefore.wp)
  assert.deepEqual(snapshotWithTimes(path.join(happy.out, 'VECTOR_PROJECT_LEAD_INSTRUCTIONS.md')), privateBefore.contract)
})

test('a rerun on the same commit is idempotent and leaves no staging or previous directories', { skip }, () => {
  const run = runGenerator(happy)
  assertPass(run)
  const current = readCurrent(happy)
  assert.equal(current['PROJECT_STATE.md'], happyFirst['PROJECT_STATE.md'])
  assert.match(current['VECTOR_EVIDENCE.md'], /Status: NONE \(identical Snapshot Commit\)/)
  assert.deepEqual(readdirSync(happy.evidence).sort(), ['ARCHIVE', 'CURRENT'])
  assert.deepEqual(readdirSync(happy.current).sort(), [...finalFiles].sort())
})

test('archive exists only with the explicit switch and an existing archive is never silently overwritten', { skip }, () => {
  assert.deepEqual(readdirSync(happy.archive), [], 'default runs must not archive')

  assertPass(runGenerator(happy, ['-Archive']))
  const archives = readdirSync(happy.archive)
  assert.equal(archives.length, 1)
  assert.match(archives[0], new RegExp(`^\\d{4}-\\d{2}-\\d{2}_develop_${happy.sha.slice(0, 12)}$`))
  const archiveDir = path.join(happy.archive, archives[0])
  assert.deepEqual(snapshotDir(archiveDir), snapshotDir(happy.current))

  // Same commit again: verified and skipped, still exactly one archive.
  const again = runGenerator(happy, ['-Archive'])
  assertPass(again)
  assert.match(again.text, /SKIPPED, valid archive of this commit exists/)
  assert.equal(readdirSync(happy.archive).length, 1)

  // Different content under the same archive name: fail clearly, keep both.
  const tampered = path.join(archiveDir, 'PROJECT_STATE.md')
  writeFileSync(tampered, 'tampered archive content\n')
  const conflict = runGenerator(happy, ['-Archive'])
  assertBlocked(conflict, /archive directory already exists with different content/)
  assert.equal(readFileSync(tampered, 'utf8'), 'tampered archive content\n')
  assert.deepEqual(readdirSync(happy.current).sort(), [...finalFiles].sort())
  assertPass(runGenerator(happy, ['-ValidateOnly']))
})

test('a simulated publication failure restores the previous valid CURRENT set', { skip }, () => {
  const before = snapshotDir(happy.current)
  const run = runGenerator(happy, ['-TestOnlySimulatePublishFailure', 'AfterPreviousMovedAside'])
  assertBlocked(run, /previous CURRENT restored/)
  assert.deepEqual(snapshotDir(happy.current), before)
  assert.deepEqual(readdirSync(happy.evidence).sort(), ['ARCHIVE', 'CURRENT'])
})

test('a locked file inside CURRENT blocks publication and preserves CURRENT', { skip }, async () => {
  const before = snapshotDir(happy.current)
  const locked = path.join(happy.current, 'VECTOR_EVIDENCE.md')
  const ready = path.join(happy.root, 'lock.ready')
  const holder = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$h = [System.IO.File]::Open('${locked.replace(/'/g, "''")}', 'Open', 'Read', 'None'); ` +
        `Set-Content -LiteralPath '${ready.replace(/'/g, "''")}' -Value ok; Start-Sleep -Seconds 120`,
    ],
    { stdio: 'ignore' },
  )
  try {
    const deadline = Date.now() + 20_000
    while (!existsSync(ready) && Date.now() < deadline) await wait(100)
    assert.ok(existsSync(ready), 'lock holder did not start')
    const run = runGenerator(happy)
    assertBlocked(run, /could not move the existing CURRENT aside/)
  } finally {
    holder.kill()
  }
  await wait(300)
  assert.deepEqual(snapshotDir(happy.current), before)
  assert.deepEqual(readdirSync(happy.evidence).sort(), ['ARCHIVE', 'CURRENT'])
})

test('forbidden bypass parameters do not exist', { skip }, () => {
  for (const parameter of ['-Force', '-SkipValidation', '-AllowDirtyWorkingTree']) {
    const run = runGenerator(happy, [parameter])
    assert.notEqual(run.status, 0, `${parameter} must not be accepted`)
    assert.match(run.text, /parameter|Parameter/)
  }
})

test('mismatched governance Snapshot Commits are rejected by validation', { skip }, () => {
  assertPass(runGenerator(happy, ['-ValidateOnly']))
  writeFileSync(path.join(happy.work, 'docs', 'RULE_INDEX.md'), '# Rule Index\n\nsecond revision\n')
  const other = commitAll(happy.work, 'fixture: second commit')
  assert.notEqual(other, happy.sha)
  const contextPath = path.join(happy.current, 'GOVERNANCE_CONTEXT.md')
  const context = readFileSync(contextPath, 'utf8')
  const marker = `Repository Path: docs/RULE_INDEX.md\nSnapshot Commit: ${happy.sha}`
  assert.ok(context.includes(marker))
  writeFileSync(contextPath, context.replace(marker, `Repository Path: docs/RULE_INDEX.md\nSnapshot Commit: ${other}`))
  const run = runGenerator(happy, ['-ValidateOnly'])
  assertBlocked(run, /GOVERNANCE_CONTEXT\.md: Snapshot Commit mismatch/)
})

// --------------------------------------------------------------------------
// Fail-closed paths (fresh fixtures)
// --------------------------------------------------------------------------

test('a dirty working tree blocks and does not overwrite valid CURRENT', { skip }, () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture))
  const before = snapshotDir(fixture.current)
  writeFileSync(path.join(fixture.work, 'docs', 'PROJECT_STATE.md'), 'uncommitted change\n')
  const run = runGenerator(fixture)
  assertBlocked(run, /working tree is not clean/)
  assert.deepEqual(snapshotDir(fixture.current), before)
  assert.deepEqual(readdirSync(fixture.evidence).sort(), ['ARCHIVE', 'CURRENT'])
})

test('local HEAD ahead of the baseline ref blocks', { skip }, () => {
  const fixture = createFixture()
  writeFileSync(path.join(fixture.work, 'AGENTS.md'), '# Agents\n\nlocal only\n')
  commitAll(fixture.work, 'fixture: unpushed commit')
  const run = runGenerator(fixture)
  assertBlocked(run, /does not equal origin\/develop/)
  assert.deepEqual(readdirSync(fixture.current), [])
})

test('a remote baseline ahead of local HEAD is detected by the fetch and blocks', { skip }, () => {
  const fixture = createFixture()
  const other = path.join(fixture.root, 'other clone')
  git(fixture.root, ['clone', '-q', fixture.origin, other])
  git(other, ['checkout', '-q', 'develop'])
  writeFileSync(path.join(other, 'AGENTS.md'), '# Agents\n\nremote change\n')
  commitAll(other, 'fixture: remote commit')
  git(other, ['push', '-q', 'origin', 'develop'])
  const run = runGenerator(fixture)
  assertBlocked(run, /does not equal origin\/develop/)
  assert.match(run.text, /FRESHLY_FETCHED/)
  assert.deepEqual(readdirSync(fixture.current), [])
})

test('the productive default export is rejected from a feature branch', { skip }, () => {
  const fixture = createFixture()
  git(fixture.work, ['checkout', '-q', '-b', 'feat/some-work'])
  const run = runGenerator(fixture)
  assertBlocked(run, /active branch 'feat\/some-work' is not the expected branch 'develop'/)
  assert.deepEqual(readdirSync(fixture.current), [])
})

test('explicit isolated branch and ref parameters keep fail-closed behavior', { skip }, () => {
  const fixture = createFixture({ branch: 'test-main' })
  const params = ['-ExpectedBranch', 'test-main', '-BaselineRef', 'origin/test-main']
  assertBlocked(runGenerator(fixture), /is not the expected branch 'develop'/)
  const run = runGenerator(fixture, params)
  assertPass(run)
  assert.equal(field(readCurrent(fixture)['VECTOR_EVIDENCE.md'], 'Snapshot ID'), `test-main:${fixture.sha}`)
  const before = snapshotDir(fixture.current)
  writeFileSync(path.join(fixture.work, 'AGENTS.md'), '# Agents\n\ndirty\n')
  assertBlocked(runGenerator(fixture, params), /working tree is not clean/)
  assert.deepEqual(snapshotDir(fixture.current), before)
})

test('a missing mandatory source blocks', { skip }, () => {
  const fixture = createFixture({ omit: ['docs/governance/AI_OPERATING_MODEL.md'] })
  const run = runGenerator(fixture)
  assertBlocked(run, /mandatory source 'docs\/governance\/AI_OPERATING_MODEL\.md' is missing/)
  assert.deepEqual(readdirSync(fixture.current), [])
  assert.deepEqual(readdirSync(fixture.evidence).sort(), ['ARCHIVE', 'CURRENT'])
})

test('a source matching a secret pattern is refused', { skip }, () => {
  const fixture = createFixture({
    sources: {
      ...fixtureSources,
      'AGENTS.md': '# Agents\n\n-----BEGIN RSA PRIVATE KEY-----\nnot-a-real-key\n-----END RSA PRIVATE KEY-----\n',
    },
  })
  const run = runGenerator(fixture)
  assertBlocked(run, /matches an excluded secret pattern/)
  assert.deepEqual(readdirSync(fixture.current), [])
})

test('an output root inside the repository is refused', { skip }, () => {
  const fixture = createFixture()
  const inside = path.join(fixture.work, 'evidence')
  mkdirSync(inside)
  const run = runGenerator({ ...fixture, out: inside })
  assertBlocked(run, /OutputRoot must not be inside the repository/)
  rmSync(inside, { recursive: true, force: true })
})

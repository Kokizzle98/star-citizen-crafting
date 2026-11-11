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
  truncateSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
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
const createFixture = ({ branch = 'develop', omit = [], sources = fixtureSources, config = [] } = {}) => {
  const root = mkdtempSync(path.join(tmpdir(), 'vector-evidence-'))
  const origin = path.join(root, 'origin.git')
  const work = path.join(root, 'work tree')
  const out = path.join(root, 'evidence out')
  mkdirSync(work)
  mkdirSync(out)
  git(root, ['init', '-q', '--bare', origin])
  git(work, ['init', '-q'])
  for (const [key, value] of config) git(work, ['config', key, value])
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
  assertBlocked(run, /previous set restored and verified \(Snapshot Commit [0-9a-f]{40}\)/)
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

// --------------------------------------------------------------------------
// Review finding 1: the compared remote-tracking ref must be refreshed
// --------------------------------------------------------------------------

const pushFromOtherClone = (fixture, name, mutate) => {
  const other = path.join(fixture.root, name)
  git(fixture.root, ['clone', '-q', fixture.origin, other])
  git(other, ['checkout', '-q', 'develop'])
  return mutate(other)
}

test('restricted fetch refspec: the exact compared tracking ref is refreshed and a remote ahead blocks', { skip }, () => {
  const fixture = createFixture()
  const remoteSha = pushFromOtherClone(fixture, 'other clone', other => {
    writeFileSync(path.join(other, 'AGENTS.md'), '# Agents\n\nremote change\n')
    const sha = commitAll(other, 'fixture: remote commit')
    git(other, ['push', '-q', 'origin', 'develop'])
    return sha
  })
  // A fetch mapping that does not cover develop, as in a single-branch clone of another branch.
  git(fixture.work, ['config', 'remote.origin.fetch', '+refs/heads/other:refs/remotes/origin/other'])

  // The previous implementation fetched by branch name; that updates FETCH_HEAD only.
  git(fixture.work, ['fetch', '--quiet', 'origin', 'develop'])
  assert.equal(git(fixture.work, ['rev-parse', 'refs/remotes/origin/develop']).trim(), fixture.sha, 'precondition: branch-name fetch leaves the tracking ref stale')
  assert.equal(git(fixture.work, ['rev-parse', 'FETCH_HEAD']).trim(), remoteSha)

  const run = runGenerator(fixture)
  assertBlocked(run, /does not equal origin\/develop/)
  assert.match(run.text, /FRESHLY_FETCHED/)
  assert.equal(git(fixture.work, ['rev-parse', 'refs/remotes/origin/develop']).trim(), remoteSha, 'the compared ref must carry the fetched commit')
  assert.deepEqual(readdirSync(fixture.current), [])
})

test('a force-updated remote branch is mirrored into the tracking ref and blocks', { skip }, () => {
  const fixture = createFixture()
  const rewritten = pushFromOtherClone(fixture, 'other clone', other => {
    writeFileSync(path.join(other, 'AGENTS.md'), '# Agents\n\nrewritten history\n')
    git(other, ['add', '-A'])
    git(other, ['commit', '-q', '--amend', '-m', 'fixture: rewritten initial state'])
    git(other, ['push', '-q', '--force', 'origin', 'develop'])
    return git(other, ['rev-parse', 'HEAD']).trim()
  })
  assert.notEqual(rewritten, fixture.sha)
  const run = runGenerator(fixture)
  assertBlocked(run, /does not equal origin\/develop/)
  assert.match(run.text, /FRESHLY_FETCHED/)
  assert.equal(git(fixture.work, ['rev-parse', 'refs/remotes/origin/develop']).trim(), rewritten)
})

// --------------------------------------------------------------------------
// Review finding 2: embedded policies are verified against their commit-bound sources
// --------------------------------------------------------------------------

// Rewrites GOVERNANCE_CONTEXT.md in `dir` and recomputes the outer SHA256 and
// size declared in VECTOR_EVIDENCE.md, exactly what an attacker with write
// access to the evidence folder would do.
const tamperGovernance = (dir, mutate) => {
  const contextPath = path.join(dir, 'GOVERNANCE_CONTEXT.md')
  const evidencePath = path.join(dir, 'VECTOR_EVIDENCE.md')
  const original = readFileSync(contextPath, 'utf8')
  const mutated = mutate(original)
  assert.notEqual(mutated, original, 'tamper helper must change the file')
  writeFileSync(contextPath, mutated)
  const bytes = readFileSync(contextPath)
  const evidence = readFileSync(evidencePath, 'utf8')
    .replace(/^Exported GOVERNANCE_CONTEXT SHA256: .*$/m, `Exported GOVERNANCE_CONTEXT SHA256: ${sha256(bytes)}`)
    .replace(/^Exported GOVERNANCE_CONTEXT Bytes: .*$/m, `Exported GOVERNANCE_CONTEXT Bytes: ${bytes.length}`)
  writeFileSync(evidencePath, evidence)
}

test('an altered embedded policy body with a recomputed outer checksum is rejected', { skip }, () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture))
  assertPass(runGenerator(fixture, ['-ValidateOnly']))
  tamperGovernance(fixture.current, text => text.replace('DB_ENV_FIXTURE_MARKER', 'DB_ENV_FIXTURE_MARKER altered policy text'))
  const run = runGenerator(fixture, ['-ValidateOnly'])
  assertBlocked(run, /section 'docs\/frozen\/DB_ENVIRONMENT_GOVERNANCE_V1\.md': embedded content differs from the repository source at the Snapshot Commit/)
  // Declared metadata was left untouched, so only the commit-bound comparison can catch this.
  assert.doesNotMatch(run.text, /SHA256 differs from the value declared/)
})

test('incorrect declared blob or hash metadata of an embedded section is rejected', { skip }, () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture))
  const context = readFileSync(path.join(fixture.current, 'GOVERNANCE_CONTEXT.md'), 'utf8')
  const blob = context.match(/^Repository Path: AGENTS\.md\nSnapshot Commit: [0-9a-f]{40}\nGit Blob: ([0-9a-f]{40})$/m)[1]
  tamperGovernance(fixture.current, text => text.replace(`Git Blob: ${blob}`, `Git Blob: ${'0'.repeat(40)}`))
  const blobRun = runGenerator(fixture, ['-ValidateOnly'])
  assertBlocked(blobRun, /section 'AGENTS\.md': declared Git Blob differs from the repository blob/)

  assertPass(runGenerator(fixture))
  tamperGovernance(fixture.current, text => text.replace(/^(Repository Path: docs\/RULE_INDEX\.md\n(?:.*\n){2})SHA256: [0-9a-f]{64}$/m, `$1SHA256: ${'f'.repeat(64)}`))
  const hashRun = runGenerator(fixture, ['-ValidateOnly'])
  assertBlocked(hashRun, /section 'docs\/RULE_INDEX\.md': declared SHA256 differs from the repository blob/)
})

test('an extra unallowlisted, duplicated or reordered governance section is rejected', { skip }, () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture))
  const context = readFileSync(path.join(fixture.current, 'GOVERNANCE_CONTEXT.md'), 'utf8')
  const start = context.indexOf('## Source 1 of 5: AGENTS.md')
  const end = context.indexOf('## Source 2 of 5:')
  // One complete section ending right after its END marker (the blank separator is excluded).
  const first = context.slice(start, end).replace(/\n+$/, '\n')

  // Extra section for a path that is not on the allowlist, with internally consistent metadata.
  const extra = first
    .replace('## Source 1 of 5: AGENTS.md', '## Source 6 of 6: lib/app.ts')
    .replace('Repository Path: AGENTS.md', 'Repository Path: lib/app.ts')
    .replace('BEGIN CONTENT AGENTS.md', 'BEGIN CONTENT lib/app.ts')
    .replace('END CONTENT AGENTS.md', 'END CONTENT lib/app.ts')
  tamperGovernance(fixture.current, text => `${text}\n${extra}`.replace('Source Count: 5', 'Source Count: 6'))
  const extraRun = runGenerator(fixture, ['-ValidateOnly'])
  assertBlocked(extraRun, /section 'lib\/app\.ts': not on the allowlist/)

  assertPass(runGenerator(fixture))
  tamperGovernance(fixture.current, text => `${text}\n${first}`)
  const duplicateRun = runGenerator(fixture, ['-ValidateOnly'])
  assertBlocked(duplicateRun, /heading number 1 does not match position 6|expected 5 source sections, found 6|section 'AGENTS\.md': duplicated/)

  assertPass(runGenerator(fixture))
  tamperGovernance(fixture.current, text => {
    const s2 = text.indexOf('## Source 2 of 5:')
    const s3 = text.indexOf('## Source 3 of 5:')
    const s4 = text.indexOf('## Source 4 of 5:')
    return text.slice(0, s2) + text.slice(s3, s4) + text.slice(s2, s3) + text.slice(s4)
  })
  const orderRun = runGenerator(fixture, ['-ValidateOnly'])
  assertBlocked(orderRun, /heading number 3 does not match position 2|out of allowlist order/)
})

test('archive verification uses the same commit-bound source validation', { skip }, () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture, ['-Archive']))
  const archiveDir = path.join(fixture.archive, readdirSync(fixture.archive)[0])
  tamperGovernance(archiveDir, text => text.replace('HANDOVER_FIXTURE_MARKER', 'HANDOVER_FIXTURE_MARKER altered'))
  const run = runGenerator(fixture, ['-Archive'])
  assertBlocked(run, /archive directory already exists with different content/)
  assert.doesNotMatch(run.text, /SKIPPED, valid archive/)
  assertPass(runGenerator(fixture, ['-ValidateOnly']))
})

// --------------------------------------------------------------------------
// Review finding 3: the fetch timeout bounds the subprocess tree and stream waits
// --------------------------------------------------------------------------

const holderCount = marker =>
  Number(
    spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${marker}*' -and $_.ProcessId -ne $PID }).Count`],
      { encoding: 'utf8' },
    ).stdout.trim(),
  )

test('a remote helper that keeps the redirected streams open cannot stall the export past the fetch timeout', { skip }, async () => {
  const fixture = createFixture()
  const marker = `hold-handles-${path.basename(fixture.root)}`
  const holdScript = path.join(fixture.root, `${marker}.ps1`)
  writeFileSync(holdScript, 'Start-Sleep -Seconds 120\n')
  // git-remote-ext splits the command on spaces; "% " is a literal space.
  const command = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ${holdScript.replace(/\\/g, '/').replace(/ /g, '% ')} %S`
  git(fixture.work, ['config', 'protocol.ext.allow', 'always'])
  git(fixture.work, ['remote', 'set-url', 'origin', `ext::${command}`])
  try {
    const started = Date.now()
    const run = runGenerator(fixture, ['-FetchTimeoutSeconds', '3'])
    const elapsed = Date.now() - started
    assert.ok(elapsed < 60_000, `export took ${elapsed} ms`)
    assertPass(run)
    assert.match(run.text, /Remote Evidence: LOCALLY_CACHED \(fetch timed out\)/)
    assert.match(run.text, /process tree stopped/)
    const evidence = readCurrent(fixture)['VECTOR_EVIDENCE.md']
    assert.equal(field(evidence, 'Remote Evidence'), 'LOCALLY_CACHED (fetch timed out)')
    await wait(500)
    assert.equal(holderCount(marker), 0, 'helper process tree must have been stopped')
  } finally {
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${marker}*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`])
  }
})

// --------------------------------------------------------------------------
// Review finding 4: private paths never reach the exported remote diagnostics
// --------------------------------------------------------------------------

const assertGenericCachedStatus = (fixture, run, privateValues) => {
  assertPass(run)
  const evidence = readCurrent(fixture)['VECTOR_EVIDENCE.md']
  assert.equal(field(evidence, 'Remote Evidence'), 'LOCALLY_CACHED (fetch failed)')
  for (const value of privateValues) {
    assert.ok(!evidence.includes(value), `VECTOR_EVIDENCE.md must not contain ${value}`)
  }
  return evidence
}

test('a failed fetch from a local path containing the username exports only a generic status', { skip }, () => {
  const fixture = createFixture()
  const username = userInfo().username
  const privatePath = path.join('C:\\Users', username, `vector-no-such-remote-${path.basename(fixture.root)}.git`)
  git(fixture.work, ['remote', 'set-url', 'origin', privatePath])
  const run = runGenerator(fixture)
  const evidence = assertGenericCachedStatus(fixture, run, [privatePath, `Users\\${username}`, `Users/${username}`])
  assert.equal(field(evidence, 'Repository'), `local-path:${path.basename(privatePath, '.git')}`)
  assert.match(run.text, /LOCALLY_CACHED \(fetch failed\) \[/)
  assert.ok(!run.text.includes(privatePath), 'console diagnostic must redact the local path')
})

test('a failed fetch from a UNC path exports only a generic status', { skip }, () => {
  const fixture = createFixture()
  const unc = '\\\\localhost\\vector-nonexistent-share\\team\\repo.git'
  git(fixture.work, ['remote', 'set-url', 'origin', unc])
  const run = runGenerator(fixture)
  const evidence = assertGenericCachedStatus(fixture, run, [unc, 'localhost', 'vector-nonexistent-share'])
  assert.equal(field(evidence, 'Repository'), 'local-path:repo')
  assert.ok(!run.text.includes('vector-nonexistent-share'), 'console diagnostic must redact the UNC path')
})

test('a failed fetch from a URL with userinfo exports neither the user nor the secret', { skip }, () => {
  const fixture = createFixture()
  git(fixture.work, ['remote', 'set-url', 'origin', 'https://alice:s3cr3t-token-value@127.0.0.1:1/private/repo.git'])
  const run = runGenerator(fixture)
  const evidence = assertGenericCachedStatus(fixture, run, ['alice', 's3cr3t-token-value', ':1/'])
  assert.equal(field(evidence, 'Repository'), '127.0.0.1/private/repo')
  assert.ok(!run.text.includes('s3cr3t-token-value'), 'console output must not contain the secret')
})

// --------------------------------------------------------------------------
// Review finding 5: post-publication validation failures restore the previous set
// --------------------------------------------------------------------------

const assertRestoredAfterPostValidationFailure = (fixture, run, before, causePattern) => {
  assert.notEqual(run.status, 0, run.text)
  assert.match(run.text, /RESULT: BLOCKED/)
  assert.match(run.text, causePattern)
  assert.match(run.text, /^CURRENT: previous set restored and verified \(Snapshot Commit [0-9a-f]{40}\)$/m)
  assert.doesNotMatch(run.text, /preserved \(/)
  assert.doesNotMatch(run.text, /untouched/)
  assert.deepEqual(snapshotDir(fixture.current), before)
  assert.deepEqual(readdirSync(fixture.current).sort(), [...finalFiles].sort())
  assert.deepEqual(readdirSync(fixture.evidence).sort(), ['ARCHIVE', 'CURRENT'])
  assertPass(runGenerator(fixture, ['-ValidateOnly']))
}

test('an exception thrown during post-publication validation restores and verifies the previous CURRENT', { skip }, () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture))
  const before = snapshotDir(fixture.current)
  const run = runGenerator(fixture, ['-TestOnlySimulatePublishFailure', 'ThrowDuringPostValidation'])
  assertRestoredAfterPostValidationFailure(fixture, run, before, /post-publication validation threw: simulated exception/)
})

test('a published set that fails post-publication validation is replaced by the restored previous CURRENT', { skip }, () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture))
  const before = snapshotDir(fixture.current)
  const run = runGenerator(fixture, ['-TestOnlySimulatePublishFailure', 'CorruptPublishedSet'])
  assertRestoredAfterPostValidationFailure(fixture, run, before, /CAUSE: required file missing: PROJECT_STATE\.md/)
})

test('a post-publication failure on the first export leaves no invalid CURRENT behind and says so', { skip }, () => {
  const fixture = createFixture()
  const run = runGenerator(fixture, ['-TestOnlySimulatePublishFailure', 'ThrowDuringPostValidation'])
  assert.notEqual(run.status, 0, run.text)
  assert.match(run.text, /^CURRENT: restored \(the previous CURRENT was empty\)$/m)
  assert.deepEqual(readdirSync(fixture.current), [])
  assert.deepEqual(readdirSync(fixture.evidence).sort(), ['ARCHIVE', 'CURRENT'])
})

// --------------------------------------------------------------------------
// Second review, helpers: save and restore a CURRENT set between tamper cases
// --------------------------------------------------------------------------

const saveDir = dir => Object.fromEntries(readdirSync(dir).map(name => [name, readFileSync(path.join(dir, name))]))

const restoreDir = (dir, saved) => {
  for (const name of readdirSync(dir)) rmSync(path.join(dir, name), { recursive: true, force: true })
  for (const [name, content] of Object.entries(saved)) writeFileSync(path.join(dir, name), content)
}

// VECTOR_EVIDENCE.md carries no outer checksum of itself, so it is edited directly.
const tamperEvidence = (dir, mutate) => {
  const evidencePath = path.join(dir, 'VECTOR_EVIDENCE.md')
  const original = readFileSync(evidencePath, 'utf8')
  const mutated = mutate(original)
  assert.notEqual(mutated, original, 'tamper helper must change the file')
  writeFileSync(evidencePath, mutated)
}

const runValidate = fixture => runGenerator(fixture, ['-ValidateOnly'])

const insertAfterLine = (text, lineStart, insertion) => {
  const index = text.indexOf(lineStart)
  assert.ok(index >= 0, `line starting with ${lineStart} not found`)
  const end = text.indexOf('\n', index)
  return `${text.slice(0, end + 1)}${insertion}\n${text.slice(end + 1)}`
}

// --------------------------------------------------------------------------
// Second review finding 1: query, fragment, userinfo and port never reach the identity
// --------------------------------------------------------------------------

test('repository identity strips query, fragment, userinfo and port and keeps legal path characters', { skip }, () => {
  const fixture = createFixture()
  const secrets = ['alice', 'tok-userinfo', 'q-secret', 'frag-secret', ':1/']
  const cases = [
    ['https://127.0.0.1:1/team/repo.git?token=q-secret', '127.0.0.1/team/repo'],
    ['https://127.0.0.1:1/team/repo.git#frag-secret', '127.0.0.1/team/repo'],
    ['https://127.0.0.1:1/team/repo.git?token=q-secret#frag-secret', '127.0.0.1/team/repo'],
    ['https://alice:tok-userinfo@127.0.0.1:1/team/repo.git?token=q-secret', '127.0.0.1/team/repo'],
    ['https://127.0.0.1:1/team/my.gitops_tools-v2/repo-name.git?x=1', '127.0.0.1/team/my.gitops_tools-v2/repo-name'],
  ]
  for (const [url, expected] of cases) {
    git(fixture.work, ['remote', 'set-url', 'origin', url])
    const run = runGenerator(fixture)
    assertPass(run)
    const evidence = readCurrent(fixture)['VECTOR_EVIDENCE.md']
    assert.equal(field(evidence, 'Repository'), expected, url)
    assert.equal(field(evidence, 'Remote Evidence'), 'LOCALLY_CACHED (fetch failed)', url)
    for (const secret of secrets) {
      assert.ok(!evidence.includes(secret), `${url}: evidence contains ${secret}`)
      if (secret !== ':1/') assert.ok(!run.text.includes(secret), `${url}: console contains ${secret}`)
    }
  }
})

// --------------------------------------------------------------------------
// Second review finding 5: helper transports are never matched as SCP-style URLs
// --------------------------------------------------------------------------

test('helper transports export only a generic identity while SCP-style URLs stay supported', { skip }, () => {
  const fixture = createFixture()
  git(fixture.work, ['config', 'core.sshCommand', 'cmd /c exit 255'])
  const username = userInfo().username

  git(fixture.work, ['remote', 'set-url', 'origin', 'git@127.0.0.1:owner/repository.git'])
  const scp = runGenerator(fixture)
  assertPass(scp)
  assert.equal(field(readCurrent(fixture)['VECTOR_EVIDENCE.md'], 'Repository'), '127.0.0.1/owner/repository')

  const helpers = [
    [`ext::powershell.exe -File C:/Users/${username}/hold.ps1 %S`, ['powershell', username, 'hold.ps1', 'C:/']],
    ['ext::cmd //\\\\server\\share\\helper.cmd %S', ['server', 'share', 'helper.cmd', 'cmd']],
    ['ext::curl https://host.example/x?token=abc-secret %S', ['curl', 'host.example', 'abc-secret', 'token']],
    ['fd::3', ['fd::', 'fd/']],
  ]
  for (const [url, privateValues] of helpers) {
    git(fixture.work, ['remote', 'set-url', 'origin', url])
    // Some helpers fail immediately, others (fd::3) wait on a descriptor until the bounded fetch timeout.
    const run = runGenerator(fixture, ['-FetchTimeoutSeconds', '3'])
    assertPass(run)
    const evidence = readCurrent(fixture)['VECTOR_EVIDENCE.md']
    assert.equal(field(evidence, 'Repository'), 'other-transport', url)
    assert.match(field(evidence, 'Remote Evidence'), /^LOCALLY_CACHED \(fetch (failed|timed out)\)$/, url)
    for (const value of privateValues) assert.ok(!evidence.includes(value), `${url}: evidence contains ${value}`)
    assert.ok(!run.text.includes('hold.ps1') && !run.text.includes('abc-secret'), `${url}: console leaks helper detail`)
  }
})

// --------------------------------------------------------------------------
// Second review finding 2: duplicated section metadata is rejected
// --------------------------------------------------------------------------

test('duplicated section metadata fields are rejected whether identical or conflicting', { skip }, () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture))
  const saved = saveDir(fixture.current)
  const context = saved['GOVERNANCE_CONTEXT.md'].toString('utf8')
  const sectionStart = context.indexOf('Repository Path: docs/RULE_INDEX.md')
  const sectionText = context.slice(sectionStart, context.indexOf('----- BEGIN CONTENT docs/RULE_INDEX.md -----'))
  const lineOf = label => sectionText.split('\n').find(line => line.startsWith(`${label}: `))
  const conflicting = {
    'Repository Path': 'Repository Path: docs/OTHER.md',
    'Snapshot Commit': `Snapshot Commit: ${'1'.repeat(40)}`,
    'Git Blob': `Git Blob: ${'2'.repeat(40)}`,
    SHA256: `SHA256: ${'3'.repeat(64)}`,
    Bytes: 'Bytes: 1',
  }
  for (const label of ['Repository Path', 'Snapshot Commit', 'Git Blob', 'SHA256', 'Bytes']) {
    const original = lineOf(label)
    assert.ok(original, label)
    // identical duplicate after the original
    restoreDir(fixture.current, saved)
    tamperGovernance(fixture.current, text => text.replace(`${sectionText}`, sectionText.replace(`${original}\n`, `${original}\n${original}\n`)))
    const identical = runValidate(fixture)
    assertBlocked(identical, new RegExp(`section 2 \\('docs/RULE_INDEX\\.md'\\): duplicated field '${label.replace(/[()]/g, '\\$&')}'`))
    // conflicting duplicate inserted before the original
    restoreDir(fixture.current, saved)
    tamperGovernance(fixture.current, text => text.replace(`${sectionText}`, sectionText.replace(`${original}\n`, `${conflicting[label]}\n${original}\n`)))
    const conflict = runValidate(fixture)
    assertBlocked(conflict, new RegExp(`section 2 \\('docs/RULE_INDEX\\.md'\\): duplicated field '${label.replace(/[()]/g, '\\$&')}'`))
  }
  restoreDir(fixture.current, saved)
  assertPass(runValidate(fixture))
})

// --------------------------------------------------------------------------
// Second review finding 3: the complete file must match the generated grammar
// --------------------------------------------------------------------------

test('text outside the generated framing is rejected wherever it appears', { skip }, () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture))
  const saved = saveDir(fixture.current)
  const cases = [
    ['appended prose after the final END marker', text => `${text}Fabricated governance paragraph.\n`, /unexpected text where the blank line after section 5 was expected: 'Fabricated governance paragraph\.'/],
    ['prepended prose', text => `Preamble added by hand.\n${text}`, /unexpected text before the generated header/],
    ['prose between two sections', text => text.replace('\n## Source 3 of 5:', '\nInserted paragraph between sections.\n## Source 3 of 5:'), /unexpected text after section 2 \(expected a section heading or the end of the file\)/],
    ['prose between metadata and BEGIN', text => text.replace('\n----- BEGIN CONTENT AGENTS.md -----', '\nInserted before the content block.\n----- BEGIN CONTENT AGENTS.md -----'), /section 1 \('AGENTS\.md'\): unexpected text between the metadata and BEGIN CONTENT/],
    ['prose inside the metadata block', text => insertAfterLine(text, 'Repository Path: docs/RULE_INDEX.md', 'This policy was reviewed by nobody.'), /section 2 \('docs\/RULE_INDEX\.md'\): unexpected text where a metadata field was expected/],
    ['unknown metadata field', text => insertAfterLine(text, 'Repository Path: docs/RULE_INDEX.md', 'Reviewer: nobody'), /section 2 \('docs\/RULE_INDEX\.md'\): unknown metadata field 'Reviewer'/],
    ['unknown header field', text => insertAfterLine(text, 'Source Count: 5', 'Approved By: nobody'), /header: unknown metadata field 'Approved By'/],
    ['unmatched BEGIN', text => `${text}\n----- BEGIN CONTENT extra.md -----\n`, /unmatched BEGIN CONTENT marker for 'extra\.md'/],
    ['unmatched END', text => `${text}----- END CONTENT AGENTS.md -----\n`, /unmatched END CONTENT marker for 'AGENTS\.md'/],
    ['nested BEGIN', text => text.replace('AGENTS_FIXTURE_MARKER\n', 'AGENTS_FIXTURE_MARKER\n----- BEGIN CONTENT AGENTS.md -----\n'), /section 1 \('AGENTS\.md'\): nested BEGIN CONTENT marker/],
    ['truncated section', text => text.slice(0, text.indexOf('----- END CONTENT docs/RULE_INDEX.md -----')), /section 2 \('docs\/RULE_INDEX\.md'\): not closed, END CONTENT marker missing/],
    ['trailing zero-width content', text => `${text}\u200b\n`, /unexpected text where the blank line after section 5 was expected/],
    ['trailing extra blank lines', text => `${text}\n\n`, /unexpected text after section 5|truncated file/],
    ['carriage returns', text => text.replace(/\n/g, '\r\n'), /contains carriage returns/],
  ]
  for (const [name, mutate, pattern] of cases) {
    restoreDir(fixture.current, saved)
    tamperGovernance(fixture.current, mutate)
    const run = runValidate(fixture)
    assert.notEqual(run.status, 0, `${name}: expected BLOCKED\n${run.text}`)
    assert.match(run.text, pattern, name)
  }
  restoreDir(fixture.current, saved)
  assertPass(runValidate(fixture))
})

// --------------------------------------------------------------------------
// Second review finding 7: the declared Branch is always validated
// --------------------------------------------------------------------------

test('the declared Branch is always read and validated, ExpectedBranchName is only an extra constraint', { skip }, () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture, ['-Archive']))
  const saved = saveDir(fixture.current)
  const cases = [
    ['Branch missing', text => text.replace(/^Branch: .*\n/m, ''), /missing field 'Branch'/],
    ['Branch empty', text => text.replace(/^Branch: .*$/m, 'Branch:'), /Branch is empty/],
    ['Branch duplicated', text => text.replace(/^(Branch: .*)$/m, '$1\n$1'), /duplicated field 'Branch'/],
    ['Branch changed to a feature branch', text => text.replace(/^Branch: develop$/m, 'Branch: feature/x'), /Snapshot ID 'develop:[0-9a-f]{40}' does not equal '<declared Branch>:<Snapshot Commit>' = 'feature\/x:/],
    ['Snapshot ID says feature branch while Branch says develop', text => text.replace(/^Snapshot ID: develop:/m, 'Snapshot ID: feature/x:'), /Snapshot ID 'feature\/x:[0-9a-f]{40}' does not equal/],
    ['Branch with illegal characters', text => text.replace(/^Branch: develop$/m, 'Branch: ../etc'), /is not a valid branch name/],
  ]
  for (const [name, mutate, pattern] of cases) {
    restoreDir(fixture.current, saved)
    tamperEvidence(fixture.current, mutate)
    const run = runValidate(fixture)
    assert.notEqual(run.status, 0, `${name}: expected BLOCKED\n${run.text}`)
    assert.match(run.text, pattern, name)
  }
  restoreDir(fixture.current, saved)
  assertPass(runValidate(fixture))

  // Archive verification runs with ExpectedBranchName and must apply the same rules.
  const archiveDir = path.join(fixture.archive, readdirSync(fixture.archive)[0])
  const savedArchive = saveDir(archiveDir)
  tamperEvidence(archiveDir, text => text.replace(/^Branch: .*\n/m, ''))
  const removed = runGenerator(fixture, ['-Archive'])
  assertBlocked(removed, /archive directory already exists with different content/)
  assert.doesNotMatch(removed.text, /SKIPPED, valid archive/)

  restoreDir(archiveDir, savedArchive)
  tamperEvidence(archiveDir, text => text.replace(/^Branch: develop$/m, 'Branch: feature/x').replace(/^Snapshot ID: develop:/m, 'Snapshot ID: feature/x:'))
  tamperGovernance(archiveDir, text => text.replace(/^Snapshot ID: develop:/m, 'Snapshot ID: feature/x:'))
  const foreign = runGenerator(fixture, ['-Archive'])
  assertBlocked(foreign, /archive directory already exists with different content/)

  restoreDir(archiveDir, savedArchive)
  const valid = runGenerator(fixture, ['-Archive'])
  assertPass(valid)
  assert.match(valid.text, /SKIPPED, valid archive of this commit exists/)
})

// --------------------------------------------------------------------------
// Second review finding 6: a predecessor is trusted only after complete validation
// --------------------------------------------------------------------------

test('an invalid previous CURRENT is never used for the changed-files comparison but does not block the new export', { skip }, () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture))
  const saved = saveDir(fixture.current)
  const unavailable = 'NOT_AVAILABLE (previous CURRENT is not a valid snapshot)'
  const cases = [
    ['missing VECTOR_EVIDENCE.md', dir => rmSync(path.join(dir, 'VECTOR_EVIDENCE.md'))],
    ['missing PROJECT_STATE.md', dir => rmSync(path.join(dir, 'PROJECT_STATE.md'))],
    ['missing GOVERNANCE_CONTEXT.md', dir => rmSync(path.join(dir, 'GOVERNANCE_CONTEXT.md'))],
    ['unexpected fourth file', dir => writeFileSync(path.join(dir, 'NOTES.md'), 'extra\n')],
    ['altered governance body', dir => writeFileSync(path.join(dir, 'GOVERNANCE_CONTEXT.md'), readFileSync(path.join(dir, 'GOVERNANCE_CONTEXT.md'), 'utf8').replace('DB_ENV_FIXTURE_MARKER', 'DB_ENV_FIXTURE_MARKER altered'))],
    ['altered body with recomputed checksum', dir => tamperGovernance(dir, text => text.replace('DB_ENV_FIXTURE_MARKER', 'DB_ENV_FIXTURE_MARKER altered'))],
    ['duplicate section metadata', dir => tamperGovernance(dir, text => text.replace(/^(Git Blob: .*)$/m, '$1\n$1'))],
    ['appended text', dir => tamperGovernance(dir, text => `${text}Appended paragraph.\n`)],
    ['inconsistent Branch', dir => tamperEvidence(dir, text => text.replace(/^Branch: develop$/m, 'Branch: feature/x'))],
    ['inconsistent Snapshot ID', dir => tamperEvidence(dir, text => text.replace(/^Snapshot ID: develop:[0-9a-f]{40}$/m, `Snapshot ID: develop:${'0'.repeat(40)}`))],
    ['invalid commit', dir => tamperEvidence(dir, text => text.replace(new RegExp(fixture.sha, 'g'), 'a'.repeat(40)))],
    ['malformed evidence', dir => writeFileSync(path.join(dir, 'VECTOR_EVIDENCE.md'), Buffer.from([0xff, 0xfe, 0x00, 0x13, 0x37]))],
  ]
  for (const [name, mutate] of cases) {
    restoreDir(fixture.current, saved)
    mutate(fixture.current)
    const run = runGenerator(fixture)
    assertPass(run)
    assert.match(run.text, /Previous CURRENT\s+not a valid snapshot/, name)
    const evidence = readCurrent(fixture)['VECTOR_EVIDENCE.md']
    assert.equal(field(evidence, 'Status'), unavailable, name)
    assert.doesNotMatch(evidence, /^Status: (AVAILABLE|NONE)/m, name)
    assert.deepEqual(readdirSync(fixture.current).sort(), [...finalFiles].sort(), name)
  }

  // A valid predecessor is still used: identical commit, then a real change.
  restoreDir(fixture.current, saved)
  const same = runGenerator(fixture)
  assertPass(same)
  assert.match(same.text, /Previous CURRENT\s+valid snapshot of/)
  assert.equal(field(readCurrent(fixture)['VECTOR_EVIDENCE.md'], 'Status'), 'NONE (identical Snapshot Commit)')
  writeFileSync(path.join(fixture.work, 'docs', 'RULE_INDEX.md'), '# Rule Index\n\nsecond revision\n')
  commitAll(fixture.work, 'fixture: second commit')
  git(fixture.work, ['push', '-q', 'origin', 'develop'])
  const changed = runGenerator(fixture)
  assertPass(changed)
  const evidence = readCurrent(fixture)['VECTOR_EVIDENCE.md']
  assert.equal(field(evidence, 'Status'), 'AVAILABLE')
  assert.equal(field(evidence, 'Previous Snapshot Commit'), fixture.sha)
  assert.match(evidence, /^- docs\/RULE_INDEX\.md$/m)
})

// --------------------------------------------------------------------------
// Second review finding 4: runs on the same output root are serialized
// --------------------------------------------------------------------------

const spawnGenerator = (fixture, extra) => {
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-OutputRoot', fixture.out, '-RepositoryRoot', fixture.work, ...extra])
  const state = { text: '', exit: null }
  child.stdout.on('data', chunk => (state.text += chunk))
  child.stderr.on('data', chunk => (state.text += chunk))
  state.exit = new Promise(resolve => child.on('close', resolve))
  return state
}

const waitFor = async (predicate, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) await wait(100)
  return predicate()
}

test('concurrent exports on the same output root are serialized by an exclusive lock', { skip }, async () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture))
  const before = snapshotDir(fixture.current)

  // Run A holds the lock inside its critical section; run B gives up after 2 s and never touches CURRENT.
  const runA = spawnGenerator(fixture, ['-TestOnlyHoldLockSeconds', '12'])
  assert.ok(await waitFor(() => runA.text.includes('TEST HOOK: holding the output-root lock'), 30_000), runA.text)
  const started = Date.now()
  const runB = runGenerator(fixture, ['-LockTimeoutSeconds', '2'])
  assert.ok(Date.now() - started < 12_000, 'run B must give up within its bounded timeout')
  assertBlocked(runB, /another export holds the lock for this output root \(waited 2 s\); CURRENT was not touched/)
  assert.match(runB.text, /^CURRENT: untouched by this run/m)
  assert.deepEqual(snapshotDir(fixture.current), before)
  assert.deepEqual(readdirSync(fixture.evidence).sort(), ['ARCHIVE', 'CURRENT'])

  // Run A completes normally; its output is the final validated CURRENT.
  assert.equal(await runA.exit, 0, runA.text)
  assert.match(runA.text, /RESULT: PASS/)
  assert.doesNotMatch(runA.text, /restored/)
  assert.deepEqual(readdirSync(fixture.current).sort(), [...finalFiles].sort())
  assertPass(runGenerator(fixture, ['-ValidateOnly']))

  // A waiting run within the default timeout is served after the holder finishes.
  const runC = spawnGenerator(fixture, ['-TestOnlyHoldLockSeconds', '4'])
  assert.ok(await waitFor(() => runC.text.includes('TEST HOOK: holding the output-root lock'), 30_000), runC.text)
  const runD = runGenerator(fixture)
  assertPass(runD)
  assert.equal(await runC.exit, 0, runC.text)
  assert.deepEqual(readdirSync(fixture.current).sort(), [...finalFiles].sort())

  // After every holder exited, a later normal run acquires the lock without any stale lock in the way.
  const later = runGenerator(fixture)
  assertPass(later)
  assert.match(later.text, /Output-root lock\s+ACQUIRED/)
  assertPass(runGenerator(fixture, ['-ValidateOnly']))
})


// --------------------------------------------------------------------------
// Third review finding 1: replacement objects never substitute governance content
// --------------------------------------------------------------------------

test('replacement objects cannot substitute governance content in generated or validated evidence', { skip }, () => {
  const fixture = createFixture()
  const originalBlob = git(fixture.work, ['rev-parse', 'HEAD:AGENTS.md']).trim()
  const replacementPath = path.join(fixture.root, 'replacement.md')
  writeFileSync(replacementPath, '# Agents\n\nREPLACED_POLICY_TEXT\n')
  const replacementBlob = git(fixture.work, ['hash-object', '-w', replacementPath]).trim()
  git(fixture.work, ['replace', originalBlob, replacementBlob])
  // Precondition: an ordinary Git read observes the replacement while the tree still names the original blob.
  assert.match(git(fixture.work, ['cat-file', 'blob', 'HEAD:AGENTS.md']), /REPLACED_POLICY_TEXT/)
  assert.equal(git(fixture.work, ['rev-parse', 'HEAD:AGENTS.md']).trim(), originalBlob)
  const originalBytes = git(fixture.work, ['--no-replace-objects', 'cat-file', 'blob', originalBlob], { buffer: true })
  const replacementBytes = readFileSync(replacementPath)

  assertPass(runGenerator(fixture))
  const context = readCurrent(fixture)['GOVERNANCE_CONTEXT.md']
  assert.ok(context.includes('AGENTS_FIXTURE_MARKER'), 'generator must embed the original object')
  assert.ok(!context.includes('REPLACED_POLICY_TEXT'), 'replacement must not enter generated evidence')
  assert.match(context, new RegExp(`^Repository Path: AGENTS\\.md\\n(?:.*\\n){2}SHA256: ${sha256(originalBytes)}\\nBytes: ${originalBytes.length}$`, 'm'))

  // A set that is consistent with the replacement (body, SHA256, Bytes) but keeps the original
  // blob id would pass if validation honored replacement objects.
  tamperGovernance(fixture.current, text =>
    text
      .replace('AGENTS_FIXTURE_MARKER', 'REPLACED_POLICY_TEXT')
      .replace(`SHA256: ${sha256(originalBytes)}\nBytes: ${originalBytes.length}`, `SHA256: ${sha256(replacementBytes)}\nBytes: ${replacementBytes.length}`),
  )
  assertBlocked(runValidate(fixture), /section 'AGENTS\.md': (declared SHA256 differs|declared Bytes differ|embedded content differs)/)
})

// --------------------------------------------------------------------------
// Third review finding 2: file URIs export only a safe leaf name
// --------------------------------------------------------------------------

test('file URIs export only the safe leaf name without query, fragment, path or username', { skip }, () => {
  const fixture = createFixture()
  const username = userInfo().username
  const cases = [
    ['file:///C:/vector-none/team/repo.git?token=q-secret', 'local-path:repo'],
    ['file:///C:/vector-none/team/repo.git#frag-secret', 'local-path:repo'],
    ['file:///C:/vector-none/team/repo.git?token=q-secret#frag-secret', 'local-path:repo'],
    ['file:///C:/vector-none/team/repo.git?token=%71-secret#%66rag-secret', 'local-path:repo'],
    ['file:///C:/vector-none/team/repo.git%3Ftoken=q-secret', 'local-path:unnamed'],
    [`file:///C:/Users/${username}/vector-none/repo.git?token=q-secret`, 'local-path:repo'],
    ['file://localhost/vector-none-share/team/repo.git?token=q-secret#frag-secret', 'local-path:repo'],
  ]
  for (const [url, expected] of cases) {
    git(fixture.work, ['remote', 'set-url', 'origin', url])
    const run = runGenerator(fixture)
    assertPass(run)
    const evidence = readCurrent(fixture)['VECTOR_EVIDENCE.md']
    assert.equal(field(evidence, 'Repository'), expected, url)
    assert.equal(field(evidence, 'Remote Evidence'), 'LOCALLY_CACHED (fetch failed)', url)
    for (const value of ['q-secret', 'frag-secret', '%71-secret', '%66rag', 'token', 'vector-none', username]) {
      assert.ok(!evidence.includes(value), `${url}: evidence contains ${value}`)
    }
    for (const value of ['q-secret', 'frag-secret', '%71-secret', 'vector-none']) {
      assert.ok(!run.text.includes(value), `${url}: console contains ${value}`)
    }
  }
})

// --------------------------------------------------------------------------
// Third review finding 3: captured stdout and stderr are bounded
// --------------------------------------------------------------------------

test('captured stdout beyond its limit stops the invocation with a controlled failure', { skip }, () => {
  const fixture = createFixture()
  const messagePath = path.join(fixture.root, 'huge-message.txt')
  writeFileSync(messagePath, `fixture: ${'y'.repeat(3 * 1024 * 1024)}\n`)
  writeFileSync(path.join(fixture.work, 'lib', 'app.ts'), '// changed\n')
  git(fixture.work, ['add', '-A'])
  git(fixture.work, ['commit', '-q', '-F', messagePath])
  git(fixture.work, ['push', '-q', 'origin', 'develop'])
  const started = Date.now()
  const run = runGenerator(fixture)
  assert.ok(Date.now() - started < 60_000, 'must return within a bounded interval')
  assertBlocked(run, /git log failed \(exit -3\): stdout exceeded the limit of 2097152 bytes \(process tree stopped\)/)
  assert.ok(!run.text.includes('y'.repeat(1000)), 'oversized output must not reach the console')
  assert.deepEqual(readdirSync(fixture.current), [])
})

test('captured stderr beyond its limit stops the helper tree and the fetch reports a generic failure', { skip }, async () => {
  const fixture = createFixture()
  const marker = `noisy-stderr-${path.basename(fixture.root)}`
  const noisyScript = path.join(fixture.root, `${marker}.ps1`)
  writeFileSync(noisyScript, "[Console]::Error.Write('x' * 300000); [Console]::Error.Flush(); Start-Sleep -Seconds 120\n")
  const command = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ${noisyScript.replace(/\\/g, '/').replace(/ /g, '% ')} %S`
  git(fixture.work, ['config', 'protocol.ext.allow', 'always'])
  git(fixture.work, ['remote', 'set-url', 'origin', `ext::${command}`])
  try {
    const started = Date.now()
    const run = runGenerator(fixture, ['-FetchTimeoutSeconds', '60'])
    const elapsed = Date.now() - started
    assert.ok(elapsed < 45_000, `export took ${elapsed} ms; the output bound, not the 60 s timeout, must end the fetch`)
    assertPass(run)
    assert.match(run.text, /LOCALLY_CACHED \(fetch failed\) \[stderr exceeded the limit of 65536 bytes \(process tree stopped\)\]/)
    const evidence = readCurrent(fixture)['VECTOR_EVIDENCE.md']
    assert.equal(field(evidence, 'Remote Evidence'), 'LOCALLY_CACHED (fetch failed)')
    assert.ok(!run.text.includes('x'.repeat(1000)) && !evidence.includes('x'.repeat(1000)), 'noisy output must not be copied')
    await wait(500)
    assert.equal(holderCount(marker), 0, 'helper process tree must have been stopped')
  } finally {
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${marker}*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`])
  }
})

// --------------------------------------------------------------------------
// Third review finding 4: canonical governance text is LF-normalized
// --------------------------------------------------------------------------

test('governance sources with CRLF, BOM or irregular trailing newlines are embedded in canonical LF form', { skip }, () => {
  const sources = {
    ...fixtureSources,
    'AGENTS.md': '# Agents\r\n\r\nAGENTS_FIXTURE_MARKER\r\n',
    'docs/RULE_INDEX.md': '\uFEFF# Rule Index\r\n\r\nRULE_INDEX_FIXTURE_MARKER\r\n',
    'docs/governance/AI_OPERATING_MODEL.md': '# Operating Model\n\nOPERATING_MODEL_FIXTURE_MARKER',
    'docs/frozen/DB_ENVIRONMENT_GOVERNANCE_V1.md': '# DB Environment\n\nDB_ENV_FIXTURE_MARKER\n\n\n',
  }
  const fixture = createFixture({ sources, config: [['core.autocrlf', 'false']] })
  const raw = git(fixture.work, ['cat-file', 'blob', 'HEAD:AGENTS.md'], { buffer: true })
  assert.ok(raw.includes(Buffer.from('\r\n')), 'precondition: the blob is stored with CRLF')

  assertPass(runGenerator(fixture))
  const contextBytes = readFileSync(path.join(fixture.current, 'GOVERNANCE_CONTEXT.md'))
  assert.ok(!contextBytes.includes(0x0d), 'generated GOVERNANCE_CONTEXT.md must be LF only')
  const context = contextBytes.toString('utf8')
  assert.ok(context.includes('----- BEGIN CONTENT AGENTS.md -----\n# Agents\n\nAGENTS_FIXTURE_MARKER\n----- END CONTENT AGENTS.md -----'))
  assert.ok(context.includes('----- BEGIN CONTENT docs/RULE_INDEX.md -----\n# Rule Index\n\nRULE_INDEX_FIXTURE_MARKER\n----- END CONTENT docs/RULE_INDEX.md -----'))
  assert.ok(context.includes('OPERATING_MODEL_FIXTURE_MARKER\n----- END CONTENT docs/governance/AI_OPERATING_MODEL.md -----'))
  assert.ok(context.includes('DB_ENV_FIXTURE_MARKER\n----- END CONTENT docs/frozen/DB_ENVIRONMENT_GOVERNANCE_V1.md -----'))
  assert.ok(context.includes('HANDOVER_FIXTURE_MARKER\n----- END CONTENT docs/handover/VECTOR_RESTART_HANDOVER.md -----'))
  // Metadata stays bound to the raw blob bytes.
  assert.match(context, new RegExp(`^Repository Path: AGENTS\\.md\\n(?:.*\\n){2}SHA256: ${sha256(raw)}\\nBytes: ${raw.length}$`, 'm'))
  assertPass(runValidate(fixture))

  tamperGovernance(fixture.current, text => text.replace('AGENTS_FIXTURE_MARKER\n----- END', 'AGENTS_FIXTURE_MARKER changed\n----- END'))
  assertBlocked(runValidate(fixture), /section 'AGENTS\.md': embedded content differs/)
})

test('a governance source with a bare carriage return is refused', { skip }, () => {
  const fixture = createFixture({
    sources: { ...fixtureSources, 'AGENTS.md': '# Agents\rAGENTS_FIXTURE_MARKER\n' },
    config: [['core.autocrlf', 'false']],
  })
  assertBlocked(runGenerator(fixture), /mandatory source 'AGENTS\.md' contains a bare carriage return/)
  assert.deepEqual(readdirSync(fixture.current), [])
})

// --------------------------------------------------------------------------
// Third review finding 5: an unreadable predecessor is only unavailable
// --------------------------------------------------------------------------

const principal = () => `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
const icacls = (...args) => spawnSync('icacls', args, { encoding: 'utf8' })
const removeDenies = fixture => {
  for (const name of readdirSync(fixture.evidence)) {
    const dir = path.join(fixture.evidence, name)
    icacls(dir, '/remove:d', principal())
    for (const file of finalFiles) if (existsSync(path.join(dir, file))) icacls(path.join(dir, file), '/remove:d', principal())
  }
}

const assertPublishedWithoutPredecessor = (fixture, run) => {
  assertPass(run)
  assert.match(run.text, /Previous CURRENT\s+not a valid snapshot/)
  assert.match(run.text, /NOTE: previous CURRENT: could not be inspected/)
  const evidence = readCurrent(fixture)['VECTOR_EVIDENCE.md']
  assert.equal(field(evidence, 'Status'), 'NOT_AVAILABLE (previous CURRENT is not a valid snapshot)')
  assert.equal(field(evidence, 'Previous Snapshot Commit'), 'NONE')
  assert.ok(!evidence.includes(fixture.root) && !evidence.includes(tmpdir()), 'no local path in evidence')
  assert.deepEqual(readdirSync(fixture.current).sort(), [...finalFiles].sort())
  assertPass(runValidate(fixture))
}

test('a previous CURRENT that cannot be enumerated makes the comparison unavailable and the export still publishes', { skip }, () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture))
  const deny = icacls(fixture.current, '/deny', `${principal()}:(RD)`)
  assert.equal(deny.status, 0, deny.stdout + deny.stderr)
  let run
  try {
    assert.throws(() => readdirSync(fixture.current), /EPERM|EACCES/, 'precondition: CURRENT cannot be listed')
    run = runGenerator(fixture)
  } finally {
    removeDenies(fixture)
  }
  assertPublishedWithoutPredecessor(fixture, run)
})

test('a previous CURRENT whose evidence cannot be read makes the comparison unavailable and the export still publishes', { skip }, () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture))
  const target = path.join(fixture.current, 'VECTOR_EVIDENCE.md')
  const deny = icacls(target, '/deny', `${principal()}:(R)`)
  assert.equal(deny.status, 0, deny.stdout + deny.stderr)
  let run
  try {
    assert.throws(() => readFileSync(target), /EPERM|EACCES/, 'precondition: the file cannot be read')
    run = runGenerator(fixture)
  } finally {
    removeDenies(fixture)
  }
  assertPublishedWithoutPredecessor(fixture, run)
})

// --------------------------------------------------------------------------
// Third review finding 6: size preflight before any content is read
// --------------------------------------------------------------------------

test('oversized evidence files are rejected from metadata before any content is read', { skip }, () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture))
  const saved = saveDir(fixture.current)
  const grow = (name, size) => truncateSync(path.join(fixture.current, name), size)
  const contentPhase = /SHA256 differs|size differs|missing field|duplicated field|unexpected text|Snapshot|Branch|Evidence Status/
  const cases = [
    ['oversized VECTOR_EVIDENCE.md', () => grow('VECTOR_EVIDENCE.md', 512 * 1024 + 1), /VECTOR_EVIDENCE\.md exceeds the size limit of 524288 bytes/],
    ['oversized PROJECT_STATE.md', () => grow('PROJECT_STATE.md', 512 * 1024 + 1), /PROJECT_STATE\.md exceeds the size limit of 524288 bytes/],
    ['oversized GOVERNANCE_CONTEXT.md', () => grow('GOVERNANCE_CONTEXT.md', 4 * 1024 * 1024 + 1), /GOVERNANCE_CONTEXT\.md exceeds the size limit of 4194304 bytes/],
    [
      'combined size over the total limit',
      () => {
        grow('VECTOR_EVIDENCE.md', 500 * 1024)
        grow('PROJECT_STATE.md', 500 * 1024)
        grow('GOVERNANCE_CONTEXT.md', 3.5 * 1024 * 1024)
      },
      /evidence set exceeds the size limit of 4194304 bytes/,
    ],
  ]
  for (const [name, mutate, pattern] of cases) {
    restoreDir(fixture.current, saved)
    mutate()
    const run = runValidate(fixture)
    assert.notEqual(run.status, 0, `${name}: expected BLOCKED\n${run.text}`)
    assert.match(run.text, pattern, name)
    // Content-phase checks were never reached: no hash, field or grammar problem is reported.
    const causes = run.text.split('\n').filter(line => line.startsWith('CAUSE: ') && !line.includes('validation failed with'))
    assert.ok(causes.every(line => !contentPhase.test(line)), `${name}: content phase was reached\n${run.text}`)
    if (name.startsWith('combined')) assert.doesNotMatch(run.text, /exceeds the size limit of 524288/)
  }
  restoreDir(fixture.current, saved)
  assertPass(runValidate(fixture))
})

test('a near-limit PROJECT_STATE source is still exported and validated', { skip }, () => {
  const big = `# Project State\n\n${'near limit line\n'.repeat(31_000)}`
  const fixture = createFixture({ sources: { ...fixtureSources, 'docs/PROJECT_STATE.md': big } })
  assertPass(runGenerator(fixture))
  assert.ok(statSync(path.join(fixture.current, 'PROJECT_STATE.md')).size > 490_000)
  assertPass(runValidate(fixture))
})

// --------------------------------------------------------------------------
// Third review finding 7: freshness and safety fields are required and consistent
// --------------------------------------------------------------------------

test('required freshness and safety fields are validated exactly once and the timestamps agree', { skip }, () => {
  const fixture = createFixture()
  assertPass(runGenerator(fixture))
  const saved = saveDir(fixture.current)
  const setField = (label, value) => text => text.replace(new RegExp(`^${label}: .*$`, 'm'), `${label.replace(/\\/g, '')}: ${value}`)
  const cases = []
  for (const label of ['Generated \\(UTC\\)', 'Remote Evidence', 'Working Tree', 'Synchronization']) {
    cases.push([`${label} missing`, text => text.replace(new RegExp(`^${label}: .*\\n`, 'm'), ''), new RegExp(`missing field '${label}'`)])
    cases.push([`${label} duplicated`, text => text.replace(new RegExp(`^(${label}: .*)$`, 'm'), '$1\n$1'), new RegExp(`duplicated field '${label}'`)])
  }
  cases.push(['malformed timestamp', setField('Generated \\(UTC\\)', 'yesterday'), /Generated \(UTC\) 'yesterday' is not a canonical UTC timestamp/])
  cases.push(['non-UTC timestamp', setField('Generated \\(UTC\\)', '2026-11-11T10:00:00+01:00'), /is not a canonical UTC timestamp/])
  cases.push(['impossible date', setField('Generated \\(UTC\\)', '2026-13-45T10:00:00Z'), /is not a canonical UTC timestamp/])
  cases.push(['timestamp differs from GOVERNANCE_CONTEXT', setField('Generated \\(UTC\\)', '2000-01-01T00:00:00Z'), /GOVERNANCE_CONTEXT\.md: Generated \(UTC\) differs from VECTOR_EVIDENCE\.md/])
  cases.push(['unsupported Remote Evidence', setField('Remote Evidence', 'LIVE_GITHUB_ACCESS'), /Remote Evidence is not one of the supported status values/])
  cases.push(['Remote Evidence with appended diagnostic', setField('Remote Evidence', 'LOCALLY_CACHED (fetch failed) [D:\\private\\repo]'), /Remote Evidence is not one of the supported status values/])
  cases.push(['dirty Working Tree claim', setField('Working Tree', 'DIRTY'), /Working Tree is 'DIRTY', expected CLEAN/])
  cases.push(['unsynchronized claim', setField('Synchronization', 'LOCAL_HEAD_BEHIND_BASELINE_REF'), /Synchronization is 'LOCAL_HEAD_BEHIND_BASELINE_REF', expected LOCAL_HEAD_EQUALS_BASELINE_REF/])
  cases.push(['Repository with a query', setField('Repository', 'host.example/team/repo?token=abc'), /Repository is not a normalized repository identity/])
  for (const [name, mutate, pattern] of cases) {
    restoreDir(fixture.current, saved)
    tamperEvidence(fixture.current, mutate)
    const run = runValidate(fixture)
    assert.notEqual(run.status, 0, `${name}: expected BLOCKED\n${run.text}`)
    assert.match(run.text, pattern, name)
  }
  restoreDir(fixture.current, saved)
  assertPass(runValidate(fixture))
})
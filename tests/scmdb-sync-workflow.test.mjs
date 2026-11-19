import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { BASE_BRANCH, OBSERVATION_FILE, SYNC_BRANCH, UPSTREAM_REPOSITORY } from '../scripts/scmdb-sync/decide.mjs'

// Static guard for .github/workflows/sync-scmdb-data.yml (MIRROR-WORKFLOW-V2).
// Plain text checks, no YAML parser: the repository has no YAML dependency.

const root = fileURLToPath(new URL('..', import.meta.url))
const WORKFLOWS = path.join(root, '.github', 'workflows')
const SYNC = 'sync-scmdb-data.yml'
const raw = readFileSync(path.join(WORKFLOWS, SYNC), 'utf8')

const withoutComments = text => text.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n')
const code = withoutComments(raw)
// A command and its continuation lines as one line, runs of blanks collapsed.
const flatten = text => text.replace(/\\\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ')
const joined = flatten(code)

/** Step blocks of the single job, in order. */
const steps = code.split(/^ {6}- name: /m).slice(1).map(block => {
  const name = block.split('\n')[0].trim()
  return { name, text: `      - name: ${block}`, joined: flatten(block) }
})
const step = name => {
  const found = steps.find(entry => entry.name === name)
  assert.ok(found, `step "${name}" exists`)
  return found
}
const indexOfStep = name => steps.findIndex(entry => entry.name === name)

const topLevelBlock = (text, key) => {
  const lines = text.split('\n')
  const start = lines.findIndex(line => line === `${key}:`)
  assert.ok(start >= 0, `${key}: exists at top level`)
  const block = []
  for (const line of lines.slice(start + 1)) {
    if (line !== '' && !line.startsWith(' ')) break
    block.push(line)
  }
  return block.filter(line => line.trim() !== '')
}

// --- triggers, rights, concurrency -------------------------------------------------------------

test('triggers: schedule and manual run only; the manual run can force dry-run and defaults to it', () => {
  const triggers = topLevelBlock(code, 'on').join('\n')
  assert.match(triggers, /^ {2}workflow_dispatch:/m)
  assert.match(triggers, /^ {2}schedule:/m)
  assert.match(triggers, /cron: "17 3 \* \* \*"/)
  for (const forbidden of ['push:', 'pull_request', 'pull_request_target', 'workflow_run', 'repository_dispatch', 'create:', 'delete:']) {
    assert.ok(!triggers.includes(forbidden), `no ${forbidden} trigger (no self-triggering, no foreign-event runs)`)
  }
  const input = triggers.slice(triggers.indexOf('force_dry_run:'))
  assert.match(input, /type: boolean/)
  assert.match(input, /default: true/)
})

test('permissions: exactly contents write and pull-requests write, nowhere else', () => {
  assert.deepEqual(topLevelBlock(code, 'permissions').map(line => line.trim()), ['contents: write', 'pull-requests: write'])
  assert.equal((code.match(/^\s*permissions:/gm) ?? []).length, 1, 'no second permissions block (job or step level)')
  assert.doesNotMatch(code, /actions: write|id-token|workflows: |administration|checks: write|statuses: write|packages: write/)
})

test('concurrency: one sync at a time, a running sync is never cancelled', () => {
  const block = topLevelBlock(code, 'concurrency').map(line => line.trim())
  assert.deepEqual(block, ['group: scmdb-full-data-sync', 'cancel-in-progress: false'])
})

test('constants of the workflow match the decision script', () => {
  const env = Object.fromEntries(topLevelBlock(code, 'env').map(line => line.trim().split(/: (.+)/).slice(0, 2)))
  assert.equal(env.SYNC_BRANCH, SYNC_BRANCH)
  assert.equal(env.BASE_BRANCH, BASE_BRANCH)
  assert.equal(env.OBSERVATION_FILE, OBSERVATION_FILE)
  assert.equal(env.UPSTREAM_URL, `https://github.com/${UPSTREAM_REPOSITORY}.git`)
  assert.equal(SYNC_BRANCH, 'automation/scmdb-sync')
  assert.equal(BASE_BRANCH, 'develop')
})

// --- what the workflow must never do -----------------------------------------------------------

test('exactly one git push, and it pushes the sync branch with no force and no refspec tricks', () => {
  const pushes = joined.split('\n').filter(line => /\bgit\b.*\bpush\b/.test(line))
  assert.equal(pushes.length, 1, pushes.join('\n'))
  assert.match(pushes[0].trim(), /^if ! git push origin "\$SYNC_BRANCH"( 2> "\$SYNC_DIR\/push\.err")?; then$/)
  assert.doesNotMatch(joined, /git push[^\n]*(--force|--force-with-lease|--delete|--mirror|--all|--tags|\s-f\b|\s\+|:refs|HEAD:)/)
  assert.doesNotMatch(joined, /\bgit\b[^\n]*\bpush\b[^\n]*\b(develop|main)\b/)
  assert.doesNotMatch(joined, /BASE_BRANCH" *(--force|:)|push[^\n]*BASE_BRANCH/)
})

test('no rebase, no reset, no history rewrite, no merge other than develop into the sync branch', () => {
  assert.doesNotMatch(joined, /\bgit\b[^\n]*\b(rebase|reset|filter-branch|filter-repo|cherry-pick|revert|commit --amend|update-ref|branch -[dDmM]|tag)\b/)
  const merges = joined.split('\n').filter(line => /\bgit\b.*\bmerge\b/.test(line)).map(line => line.trim())
  assert.deepEqual(merges, ['if ! git merge --no-edit "origin/$BASE_BRANCH"; then', 'git merge --abort || true'])
  const prepare = step('Sync-Branch vorbereiten').joined
  assert.ok(prepare.indexOf('git checkout -B "$SYNC_BRANCH"') < prepare.indexOf('git merge --no-edit'), 'the merge happens on the sync branch')
  assert.doesNotMatch(joined, /git checkout[^\n]*\b(main|develop)\b/)
  assert.doesNotMatch(joined, /git checkout -B "\$BASE_BRANCH"/)
})

test('no auto-merge and no merge of any pull request', () => {
  assert.doesNotMatch(joined, /gh pr merge|--auto\b|auto-merge|automerge|enable-auto|--admin|mergePullRequest|enablePullRequestAutoMerge/i)
  assert.doesNotMatch(joined, /gh api[^\n]*(merge|reviews|approve)/i)
  assert.doesNotMatch(joined, /gh pr (review|ready|close|reopen)/)
  const pr = step('Pull Request öffnen oder aktualisieren').joined
  assert.match(pr, /gh pr create --base "\$BASE_BRANCH" --head "\$SYNC_BRANCH"/)
  assert.match(pr, /gh pr edit "\$EXISTING"/)
})

test('no database, deployment or secret access; only the default token', () => {
  assert.doesNotMatch(raw, /supabase|vercel|DATABASE_URL|service_role|POSTGRES|\.env\b/i)
  const secrets = [...code.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map(match => match[1])
  assert.deepEqual(secrets.filter(name => name !== 'GITHUB_TOKEN'), [], 'no secret except the default token')
  const tokens = [...code.matchAll(/\$\{\{\s*([^}]*token[^}]*)\}\}/gi)].map(match => match[1].trim())
  assert.deepEqual([...new Set(tokens)], ['github.token'])
  assert.doesNotMatch(code, /\bPAT\b|personal[-_ ]access|GH_PAT|\bapp-id\b|private-key/i)
})

test('only first-party actions of the existing pinned major versions', () => {
  const uses = [...code.matchAll(/^\s*uses: (\S+)/gm)].map(match => match[1])
  assert.deepEqual([...new Set(uses)].sort(), ['actions/checkout@v4', 'actions/setup-node@v4', 'actions/upload-artifact@v4'])
})

test('public repository boundary: no private path, identifier or token in the workflow or the scripts', () => {
  const files = [path.join(WORKFLOWS, SYNC), ...readdirSync(path.join(root, 'scripts', 'scmdb-sync')).map(name => path.join(root, 'scripts', 'scmdb-sync', name))]
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    assert.doesNotMatch(text, /[A-Za-z]:\\Users\\|OneDrive|\/home\/[a-z]+\/|\.supabase\.(co|com)|eyJ[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_/, file)
  }
})

// --- dry run is the default, publication is gated ----------------------------------------------

test('mode: read from the repository variable and the input, decided by the script, dry-run when unset', () => {
  const mode = step('Werkzeuge sichern und Betriebsart bestimmen')
  assert.match(mode.text, /SCMDB_SYNC_MODE: \$\{\{ vars\.SCMDB_SYNC_MODE \}\}/)
  assert.match(mode.text, /FORCE_DRY_RUN: \$\{\{ inputs\.force_dry_run \}\}/)
  assert.match(mode.joined, /decide\.mjs" mode --variable "\$SCMDB_SYNC_MODE" --force-dry-run "\$FORCE_DRY_RUN"/)
  assert.doesNotMatch(code, /== 'publish'[^\n]*\|\||\|\|[^\n]*== 'publish'/, 'no publish by any other condition')
  assert.doesNotMatch(code, /github\.event_name == 'schedule'/, 'the schedule gets no special path to publication')
})

test('every step that pushes or talks to pull requests runs in publish mode only', () => {
  const touching = steps.filter(entry => /\bgit push\b|\bgh (pr|api)\b/.test(entry.joined))
  assert.deepEqual(touching.map(entry => entry.name), ['Sync-Branch pushen', 'Pull Request öffnen oder aktualisieren'])
  for (const entry of touching) assert.match(entry.text, /if: steps\.mode\.outputs\.mode == 'publish'/, entry.name)
  assert.match(step('Pull Request öffnen oder aktualisieren').text, /if: steps\.mode\.outputs\.mode == 'publish' && steps\.decide\.outputs\.outcome == 'PUBLISH'/)
  for (const entry of steps) {
    if (!touching.includes(entry)) assert.doesNotMatch(entry.joined, /\bgit push\b|\bgh pr\b|GH_TOKEN/, `${entry.name} is read-only toward GitHub`)
  }
})

test('order: sanity checks and the precheck run before anything is committed or pushed; tools are secured before the branch switch', () => {
  const order = [
    'Werkzeuge sichern und Betriebsart bestimmen', 'Sync-Branch vorbereiten', 'Öffentlichen SCMDB_DATA Mirror herunterladen',
    'SCMDB Quelldaten validieren', 'Vollständigen SCMDB Data Mirror übernehmen', 'Lokales Mirror-Metadata erzeugen', 'Crafting-Datensätze prüfen',
    'Domain-Precheck ausführen', 'Entscheidung treffen', 'Ergebnis auf den Sync-Branch anwenden', 'Sync-Branch pushen',
    'Pull Request öffnen oder aktualisieren', 'Ergebnis als Artefakt sichern', 'Gehaltenen Lauf sichtbar machen',
  ].map(indexOfStep)
  assert.ok(order.every(index => index >= 0))
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'steps are in the documented order')
  for (const entry of steps) {
    if (entry.name !== 'Werkzeuge sichern und Betriebsart bestimmen') assert.doesNotMatch(entry.joined, /node scripts\/|node "scripts\//, `${entry.name} uses the secured tools, not the work tree`)
  }
})

test('a held run is recorded first and then fails the job', () => {
  const last = steps.at(-1)
  assert.equal(last.name, 'Gehaltenen Lauf sichtbar machen')
  assert.match(last.text, /if: steps\.decide\.outputs\.outcome == 'HELD'/)
  assert.match(last.joined, /exit 1/)
  assert.ok(indexOfStep(last.name) > indexOfStep('Sync-Branch pushen'), 'observations are pushed before the job fails')
  assert.match(step('Ergebnis als Artefakt sichern').text, /if: always\(\)/)
})

// --- precheck contract and retained checks -----------------------------------------------------

test('upstream: shallow clone, commit SHA of the clone and retrieval time reach the precheck; baseline is origin/develop', () => {
  const clone = step('Öffentlichen SCMDB_DATA Mirror herunterladen').joined
  assert.match(clone, /git clone --depth 1 "\$UPSTREAM_URL" \/tmp\/SCMDB_DATA/)
  assert.match(clone, /SOURCE_SHA="\$\(git -C \/tmp\/SCMDB_DATA rev-parse HEAD \|\| true\)"/)
  assert.match(clone, /SOURCE_RETRIEVED_AT="\$\(date -u /)
  const precheck = step('Domain-Precheck ausführen').joined
  assert.match(precheck, /node "\$TOOLS\/domain-precheck\.mjs"/)
  assert.match(precheck, /--baseline-ref "origin\/\$BASE_BRANCH"/)
  assert.match(precheck, /--candidate-dir data\/scmdb/)
  assert.match(precheck, /--candidate-source-sha "\$SOURCE_SHA"/)
  assert.match(precheck, /--source-retrieved-at "\$SOURCE_RETRIEVED_AT"/)
  assert.match(precheck, /--emit json/)
  // The CLI loads and passes the complete loader result (files, fileNames, unreadable); the workflow does not.
  assert.doesNotMatch(code, /load-files|loadDirectory|loadGitRef|runDomainPrecheck|\.files\b/)
})

test('retained checks stay: source validation, rsync --delete mirror, manifest, crafting sanity checks', () => {
  assert.match(step('SCMDB Quelldaten validieren').text, /latest\.json[\s\S]*game-versions\.json[\s\S]*versions\.json[\s\S]*changelog\.json/)
  assert.match(step('Vollständigen SCMDB Data Mirror übernehmen').joined, /TARGET="data\/scmdb\/"[\s\S]*rsync -av --delete "\$SOURCE" "\$TARGET"/)
  assert.match(step('Lokales Mirror-Metadata erzeugen').text, /local-mirror-manifest\.json/)
  const crafting = step('Crafting-Datensätze prüfen').text
  for (const fragment of ['data.items.length < 100', 'collection.length < 100', 'recoilWeapons === 0', 'fireModesPools[] fehlt', 'Keine crafting_blueprints-Datei gefunden.']) {
    assert.ok(crafting.includes(fragment), fragment)
  }
  for (const name of ['SCMDB Quelldaten validieren', 'Vollständigen SCMDB Data Mirror übernehmen', 'Lokales Mirror-Metadata erzeugen', 'Crafting-Datensätze prüfen']) {
    assert.match(step(name).text, /set -euo pipefail/, `${name} fails the job on error`)
  }
})

test('applying the outcome: the manifest alone never makes a mirror commit, the observation record only grows', () => {
  const apply = step('Ergebnis auf den Sync-Branch anwenden').joined
  assert.match(apply, /git restore --source="origin\/\$BASE_BRANCH" --staged --worktree -- data\/scmdb/)
  assert.match(apply, /grep -v "\$MANIFEST"/)
  assert.match(apply, /git restore --source=HEAD --staged --worktree -- "\$MANIFEST"/)
  assert.match(apply, /decide\.mjs" append --file "\$OBSERVATION_FILE"/)
  assert.match(apply, /git diff --cached --numstat -- "\$OBSERVATION_FILE"/)
  for (const clean of apply.match(/git clean[^\n]*/g) ?? []) assert.match(clean, /-- data\/scmdb$/, 'git clean is limited to the mirror directory')
  assert.doesNotMatch(apply, /git add (-A|\.|--all)(?! -- data\/scmdb)/)
})

test('pull request step: fallback with compare link and text when Actions may not create pull requests', () => {
  const pr = step('Pull Request öffnen oder aktualisieren').joined
  assert.match(pr, /not permitted to create or approve pull requests/)
  assert.match(pr, /compare\/\$BASE_BRANCH\.\.\.\$SYNC_BRANCH\?expand=1/)
  assert.match(pr, /GH_TOKEN: \$\{\{ github\.token \}\}/)
})

// --- the observation path and the sync branch do not wake other workflows -----------------------

const globToRegExp = glob => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*')}$`)
const listItems = (text, key) => {
  const lines = text.split('\n')
  const items = []
  lines.forEach((line, index) => {
    const match = line.match(new RegExp(`^(\\s*)${key}:(.*)$`))
    if (!match) return
    const inline = match[2].trim()
    if (inline.startsWith('[')) {
      items.push(...inline.slice(1, inline.indexOf(']')).split(',').map(item => item.trim().replace(/^["']|["']$/g, '')).filter(Boolean))
      return
    }
    for (const next of lines.slice(index + 1)) {
      const entry = next.match(/^\s*-\s+(.+?)\s*$/)
      if (!entry) { if (next.trim() === '' || next.trim().startsWith('#')) continue; break }
      items.push(entry[1].replace(/^["']|["']$/g, ''))
    }
  })
  return items
}

test('the observation record path matches no path filter of any other workflow', () => {
  assert.ok(!OBSERVATION_FILE.startsWith('data/scmdb/'), 'outside the mirror directory')
  const others = readdirSync(WORKFLOWS).filter(name => name.endsWith('.yml') && name !== SYNC)
  assert.ok(others.length >= 7)
  let checkedFilters = 0
  for (const name of others) {
    for (const glob of listItems(readFileSync(path.join(WORKFLOWS, name), 'utf8'), 'paths')) {
      checkedFilters += 1
      assert.ok(!globToRegExp(glob).test(OBSERVATION_FILE), `${name}: path filter ${glob} would fire on ${OBSERVATION_FILE}`)
    }
  }
  assert.ok(checkedFilters > 10, 'path filters were actually read')
  // Sanity of the matcher: the mirror directory is matched by the filters that guard it.
  assert.ok(globToRegExp('data/scmdb/**').test('data/scmdb/latest.json'))
  assert.ok(!globToRegExp('data/scmdb/**').test('data/scmdb-sync/observations.jsonl'))
})

test('no other workflow runs on a push to the sync branch', () => {
  for (const name of readdirSync(WORKFLOWS).filter(file => file.endsWith('.yml') && file !== SYNC)) {
    for (const glob of listItems(readFileSync(path.join(WORKFLOWS, name), 'utf8'), 'branches')) {
      assert.ok(!globToRegExp(glob).test(SYNC_BRANCH), `${name}: branch filter ${glob} matches ${SYNC_BRANCH}`)
    }
  }
})

#Requires -Version 5.1
<#
.SYNOPSIS
Exports a commit-bound VECTOR Project Lead evidence snapshot from a local Git checkout.

.DESCRIPTION
Produces exactly three files under <OutputRoot>\Evidence\CURRENT:

  VECTOR_EVIDENCE.md     which Git state the snapshot represents
  PROJECT_STATE.md       byte-identical copy of docs/PROJECT_STATE.md at the Snapshot Commit
  GOVERNANCE_CONTEXT.md  allowlisted governance documents embedded verbatim from the Snapshot Commit

The generator is fail-closed. It publishes VERIFIED_AT_GENERATION evidence only when the
expected branch is active, local HEAD equals the resolved baseline ref, the working tree is
clean, every mandatory source exists at the Snapshot Commit and the generated candidate passes
validation. On any failure it prints BLOCKED, exits non-zero and leaves an existing valid
CURRENT set untouched. It never talks to GitHub, OneDrive or any cloud API; OneDrive cloud
synchronization happens outside this script.

Manual: docs/governance/PROJECT_LEAD_EVIDENCE.md

.PARAMETER OutputRoot
Existing private output root. The generator only creates and replaces
<OutputRoot>\Evidence\CURRENT and, with -Archive, one directory under <OutputRoot>\Evidence\ARCHIVE.

.PARAMETER RepositoryRoot
Top level of the Git work tree to export. Defaults to the parent directory of this script.

.PARAMETER ExpectedBranch
Branch that must be active. Default: develop. Change it only for isolated tests.

.PARAMETER BaselineRef
Ref that local HEAD must equal. Default: origin/develop. Change it only for isolated tests.

.PARAMETER Archive
Additionally copy the validated CURRENT set to <OutputRoot>\Evidence\ARCHIVE\<UTC date>_<branch>_<short SHA>.
An existing archive directory is verified and skipped when identical, otherwise the run reports BLOCKED.

.PARAMETER ValidateOnly
Do not generate. Validate the existing CURRENT set against the repository and report PASS or BLOCKED.

.PARAMETER RecentCommitCount
Number of recent commits listed in VECTOR_EVIDENCE.md (1 to 100, default 15).

.PARAMETER FetchTimeoutSeconds
Upper bound for the baseline fetch including its helper processes and output collection
(1 to 600, default 90). A timeout is reported as LOCALLY_CACHED, never as fresh.

.PARAMETER LockTimeoutSeconds
How long to wait for the exclusive output-root lock held by another export (1 to 600, default
30). Runs against the same OutputRoot are serialized; a run that cannot acquire the lock
reports BLOCKED without touching CURRENT.

.PARAMETER TestOnlySimulatePublishFailure
Test hook that injects a failure into the publication state machine: 'AfterPreviousMovedAside'
fails before the candidate is renamed in, 'ThrowDuringPostValidation' throws inside the
post-publication validation, 'CorruptPublishedSet' damages the published set before that
validation. The hook never weakens validation.

.PARAMETER TestOnlyHoldLockSeconds
Test hook that pauses inside the critical section right after the output-root lock was
acquired, to exercise the serialization of concurrent runs. It never weakens validation.

.EXAMPLE
.\scripts\export-project-lead-evidence.ps1 -OutputRoot "D:\Private\VECTOR\ProjectLead"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$OutputRoot,

    [string]$RepositoryRoot,

    [string]$ExpectedBranch = 'develop',

    [string]$BaselineRef = 'origin/develop',

    [switch]$Archive,

    [switch]$ValidateOnly,

    [ValidateRange(1, 100)]
    [int]$RecentCommitCount = 15,

    [ValidateRange(1, 600)]
    [int]$FetchTimeoutSeconds = 90,

    [ValidateRange(1, 600)]
    [int]$LockTimeoutSeconds = 30,

    [ValidateSet('None', 'AfterPreviousMovedAside', 'ThrowDuringPostValidation', 'CorruptPublishedSet')]
    [string]$TestOnlySimulatePublishFailure = 'None',

    [ValidateRange(0, 120)]
    [int]$TestOnlyHoldLockSeconds = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Contract constants
# ---------------------------------------------------------------------------

$script:FormatVersion = '1.0'
$script:GeneratorPath = 'scripts/export-project-lead-evidence.ps1'
$script:ProjectStateSource = 'docs/PROJECT_STATE.md'
$script:GovernanceSources = @(
    'AGENTS.md',
    'docs/RULE_INDEX.md',
    'docs/governance/AI_OPERATING_MODEL.md',
    'docs/frozen/DB_ENVIRONMENT_GOVERNANCE_V1.md',
    'docs/handover/VECTOR_RESTART_HANDOVER.md'
)
$script:FinalFiles = @('VECTOR_EVIDENCE.md', 'PROJECT_STATE.md', 'GOVERNANCE_CONTEXT.md')
$script:StatusVerified = 'VERIFIED_AT_GENERATION'
$script:MaxSourceBytes = 512KB
$script:MaxTotalBytes = 4MB
$script:MaxChangedFiles = 200
$script:RetryCount = 3
$script:RetryDelayMs = 400
$script:GitTimeoutMs = 120000        # every ordinary git invocation is bounded
$script:StreamGraceMs = 10000        # extra time allowed for output collection after exit or kill
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$script:SecretPatterns = @(
    '-----BEGIN [A-Z ]*PRIVATE KEY-----',
    '\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}',
    '\bgh[pousr]_[A-Za-z0-9]{36,}\b',
    '\bgithub_pat_[A-Za-z0-9_]{40,}\b',
    '\bsk-[A-Za-z0-9_-]{20,}\b',
    '\bAKIA[0-9A-Z]{16}\b',
    '\bsbp_[a-f0-9]{40}\b'
)
$script:BeginMarker = '----- BEGIN CONTENT {0} -----'
$script:EndMarker = '----- END CONTENT {0} -----'
$script:MarkerPattern = '^----- (BEGIN|END) CONTENT (.+) -----$'

# Grammar of GOVERNANCE_CONTEXT.md, shared by the generator and the validator. The file is
# LF-separated and consists of: title, blank, header fields in this order, blank, the
# statement lines, then per source: blank, heading, blank, section fields in this order,
# blank, BEGIN marker, body, END marker. The file ends directly after the last END marker.
$script:GovernanceTitle = '# VECTOR Governance Context'
$script:GovernanceHeaderFields = @('Format Version', 'Evidence Kind', 'Snapshot ID', 'Snapshot Commit', 'Generated (UTC)', 'Source Count', 'Generator')
$script:GovernanceStatements = @(
    'This file embeds allowlisted repository governance documents verbatim from the Snapshot Commit.',
    'It is commit-bound evidence generated from a local Git checkout. It is NOT live GitHub access.',
    'OneDrive cloud synchronization happens outside the generator.',
    'Every source section names its repository path and Snapshot Commit. All sections must name the same commit as VECTOR_EVIDENCE.md; otherwise the snapshot is invalid.'
)
$script:GovernanceSectionFields = @('Repository Path', 'Snapshot Commit', 'Git Blob', 'SHA256', 'Bytes')
$script:BranchPattern = '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
$script:TimestampPattern = '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$'

$script:RepoRoot = $null
$script:OutRoot = $null
$script:EvidenceDir = $null
$script:CurrentDir = $null
$script:ArchiveDir = $null
$script:StagingDir = $null
$script:RunId = $null
# Accurate description of the local CURRENT state for the final console line.
# $null means "not touched by this run".
$script:CurrentStatus = $null
$script:Lock = $null

# ---------------------------------------------------------------------------
# Console helpers (local paths may be printed; evidence content never is)
# ---------------------------------------------------------------------------

function Write-Step {
    param([string]$Name, [string]$Result)
    Write-Host ('{0,-32} {1}' -f $Name, $Result)
}

function Stop-Blocked {
    param([string]$Cause)
    throw ('BLOCKED: ' + $Cause)
}

function Get-SafeErrorText {
    # Console-only diagnostic: first non-empty line, URL userinfo, drive paths and UNC paths redacted.
    # Never written into evidence files.
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return '(no detail)' }
    $line = ($Text -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 } | Select-Object -First 1)
    if ($null -eq $line) { return '(no detail)' }
    $line = $line -replace '[A-Za-z][A-Za-z0-9+.-]*://[^\s''"]+', '<url>'
    $line = $line -replace '[A-Za-z][A-Za-z0-9+.-]*::[^''"]*', '<helper-transport>'
    $line = $line -replace '\\\\[^\s''"]+', '<unc-path>'
    $line = $line -replace '[A-Za-z]:[\\/][^\s''"]*', '<local-path>'
    if ($line.Length -gt 200) { $line = $line.Substring(0, 200) + '...' }
    return $line
}

# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------

function ConvertTo-ArgumentString {
    param([string[]]$Arguments)
    $parts = @()
    foreach ($argument in $Arguments) {
        if ($null -eq $argument) { continue }
        if ($argument.Length -eq 0 -or $argument -match '[\s"]') {
            $parts += '"' + ($argument -replace '"', '\"') + '"'
        } else {
            $parts += $argument
        }
    }
    return ($parts -join ' ')
}

function Stop-ProcessTree {
    # Stops the process started by this invocation and every descendant created after it.
    # Descendants are discovered through their parent id and must have been created after the
    # root process, which excludes unrelated processes that merely reuse a process id.
    param([int]$RootProcessId, [DateTime]$NotBefore)
    $all = @()
    try {
        $all = @(Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId, CreationDate -ErrorAction Stop)
    } catch {
        $all = @()
    }
    $descendants = New-Object System.Collections.Generic.List[int]
    $queue = New-Object System.Collections.Generic.Queue[int]
    $queue.Enqueue($RootProcessId)
    while ($queue.Count -gt 0) {
        $parent = $queue.Dequeue()
        foreach ($candidate in $all) {
            if ($candidate.ParentProcessId -ne $parent -or $candidate.ProcessId -eq $parent) { continue }
            if ($descendants.Contains([int]$candidate.ProcessId)) { continue }
            if ($null -ne $candidate.CreationDate -and $candidate.CreationDate -lt $NotBefore.AddSeconds(-2)) { continue }
            $descendants.Add([int]$candidate.ProcessId)
            $queue.Enqueue([int]$candidate.ProcessId)
        }
    }
    # Deepest first, then the root.
    $descendants.Reverse()
    foreach ($id in $descendants) {
        try { Stop-Process -Id $id -Force -ErrorAction Stop } catch { }
    }
    try { Stop-Process -Id $RootProcessId -Force -ErrorAction Stop } catch { }
}

function Invoke-Git {
    # Bounded git invocation: the timeout covers the process, its subprocess tree and the
    # collection of redirected output. A helper that keeps the pipes open after the timeout
    # cannot stall the export; the call then reports a controlled failure.
    param(
        [string[]]$Arguments,
        [int]$TimeoutMs = $script:GitTimeoutMs,
        [string]$WorkingDirectory = $script:RepoRoot
    )
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = 'git'
    $startInfo.Arguments = ConvertTo-ArgumentString $Arguments
    if ($WorkingDirectory) { $startInfo.WorkingDirectory = $WorkingDirectory }
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true
    $startInfo.EnvironmentVariables['GIT_TERMINAL_PROMPT'] = '0'
    $startInfo.EnvironmentVariables['GIT_OPTIONAL_LOCKS'] = '0'
    $startInfo.EnvironmentVariables['GCM_INTERACTIVE'] = 'never'

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $startedAt = [DateTime]::Now
    try { $startedAt = $process.StartTime } catch { }
    $process.StandardInput.Close()
    $errorTask = $process.StandardError.ReadToEndAsync()
    $outputStream = New-Object System.IO.MemoryStream
    $outputTask = $process.StandardOutput.BaseStream.CopyToAsync($outputStream)

    $timedOut = $false
    if (-not $process.WaitForExit($TimeoutMs)) {
        $timedOut = $true
        Stop-ProcessTree -RootProcessId $process.Id -NotBefore $startedAt
        [void]$process.WaitForExit($script:StreamGraceMs)
    }

    $streamsComplete = $false
    try {
        $tasks = [System.Threading.Tasks.Task[]]@($outputTask, $errorTask)
        $streamsComplete = [System.Threading.Tasks.Task]::WaitAll($tasks, $script:StreamGraceMs)
    } catch {
        $streamsComplete = $false
    }
    if (-not $streamsComplete) {
        # Abandon the pipes; a surviving holder must not block the export.
        try { $process.StandardOutput.Dispose() } catch { }
        try { $process.StandardError.Dispose() } catch { }
    }

    $errorText = ''
    if ($errorTask.IsCompleted -and -not $errorTask.IsFaulted -and -not $errorTask.IsCanceled) { $errorText = $errorTask.Result }
    $bytes = $outputStream.ToArray()
    $exitCode = -1
    if ($process.HasExited) { $exitCode = $process.ExitCode }
    $process.Dispose()
    if ($timedOut) {
        $exitCode = -1
        $errorText = 'timeout after ' + $TimeoutMs + ' ms (process tree stopped)'
    } elseif (-not $streamsComplete) {
        $exitCode = -2
        $errorText = 'output collection did not finish within ' + $script:StreamGraceMs + ' ms'
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        TimedOut = $timedOut
        Bytes    = $bytes
        Text     = $script:Utf8NoBom.GetString($bytes)
        Error    = $errorText
    }
}

function Get-GitText {
    param([string[]]$Arguments, [string]$What)
    $result = Invoke-Git -Arguments $Arguments
    if ($result.ExitCode -ne 0) {
        Stop-Blocked ("git {0} failed (exit {1}): {2}" -f $What, $result.ExitCode, (Get-SafeErrorText $result.Error))
    }
    return $result.Text.TrimEnd("`r", "`n")
}

function Test-FullSha {
    param([string]$Value)
    return ($Value -match '^[0-9a-f]{40}$')
}

# ---------------------------------------------------------------------------
# Filesystem helpers
# ---------------------------------------------------------------------------

function Get-NormalizedPath {
    param([string]$Path)
    $full = [System.IO.Path]::GetFullPath($Path) -replace '/', '\'
    return $full.TrimEnd('\').ToLowerInvariant()
}

function Get-Sha256Hex {
    param([byte[]]$Bytes)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return (($sha.ComputeHash($Bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally {
        $sha.Dispose()
    }
}

function Get-FileSha256 {
    param([string]$Path)
    return (Get-Sha256Hex ([System.IO.File]::ReadAllBytes($Path)))
}

function Write-Utf8File {
    param([string]$Path, [string]$Text)
    [System.IO.File]::WriteAllBytes($Path, $script:Utf8NoBom.GetBytes($Text))
}

function Read-Utf8File {
    param([string]$Path)
    $text = $script:Utf8NoBom.GetString([System.IO.File]::ReadAllBytes($Path))
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }
    return $text
}

function Test-TransientIoError {
    param($ErrorRecord)
    $exception = $ErrorRecord.Exception
    while ($null -ne $exception) {
        if ($exception -is [System.IO.IOException] -or $exception -is [System.UnauthorizedAccessException]) { return $true }
        $exception = $exception.InnerException
    }
    return $false
}

function Invoke-WithRetry {
    param([scriptblock]$Action, [string]$What)
    for ($attempt = 1; $attempt -le $script:RetryCount; $attempt++) {
        try {
            & $Action
            return
        } catch {
            if ($attempt -ge $script:RetryCount -or -not (Test-TransientIoError $_)) { throw }
            Start-Sleep -Milliseconds $script:RetryDelayMs
        }
    }
}

function Move-Directory {
    param([string]$Source, [string]$Destination, [string]$What)
    Invoke-WithRetry -What $What -Action { [System.IO.Directory]::Move($Source, $Destination) }
}

function Remove-DirectoryQuietly {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $true }
    try {
        Invoke-WithRetry -What 'remove' -Action { Remove-Item -LiteralPath $Path -Recurse -Force }
        return $true
    } catch {
        Write-Host ('WARNING: could not remove operational directory: ' + $Path)
        return $false
    }
}

function Test-SecretPatterns {
    param([string]$Text, [string]$Label)
    foreach ($pattern in $script:SecretPatterns) {
        if ([regex]::IsMatch($Text, $pattern)) {
            return ("'{0}' matches an excluded secret pattern; refusing to export it" -f $Label)
        }
    }
    return $null
}

function Get-FieldValue {
    param([string]$Text, [string]$Label)
    $match = [regex]::Match($Text, '(?m)^' + [regex]::Escape($Label) + ':[ \t]*(.*)$')
    if (-not $match.Success) { return $null }
    return $match.Groups[1].Value.Trim()
}

function Get-FieldValues {
    param([string]$Text, [string]$Label)
    $values = @()
    foreach ($match in [regex]::Matches($Text, '(?m)^' + [regex]::Escape($Label) + ':[ \t]*(.*)$')) {
        $values += $match.Groups[1].Value.Trim()
    }
    return $values
}

function Get-RepositoryPathIdentity {
    # Repository path component for export: query and fragment removed, surrounding slashes
    # trimmed, a trailing ".git" removed from the last segment only.
    param([string]$Path)
    $clean = $Path
    $cut = $clean.IndexOfAny([char[]]@('?', '#'))
    if ($cut -ge 0) { $clean = $clean.Substring(0, $cut) }
    $clean = $clean.Trim('/')
    if ($clean.EndsWith('.git')) { $clean = $clean.Substring(0, $clean.Length - 4) }
    return $clean.TrimEnd('/')
}

function Get-NormalizedRemoteIdentity {
    # Exported identity of the remote, in this fixed order:
    #   1. helper and double-colon transports (ext::, fd::, ...) -> 'other-transport'
    #   2. local, UNC and file paths -> leaf name only
    #   3. standard URLs -> host and path only (no scheme, userinfo, port, query, fragment)
    #   4. SCP-style user@host:path -> host and path only
    #   5. anything else -> 'other-transport'
    # Credentials, tokens, queries, fragments, absolute paths, usernames and helper command
    # text never reach the evidence.
    param([string]$Url)
    $value = $Url.Trim()
    if ($value -match '^[A-Za-z][A-Za-z0-9+.-]*::') { return 'other-transport' }
    if ($value -match '^[A-Za-z]:[\\/]' -or $value -match '^\\\\' -or $value -match '^file:' -or $value -match '^[\\/]') {
        $leaf = Split-Path -Leaf (($value -replace '^file:/*', '').TrimEnd('\', '/'))
        return 'local-path:' + $leaf
    }
    if ($value -match '^(https?|ssh|git|ftps?)://') {
        $uri = $null
        if (-not [System.Uri]::TryCreate($value, [System.UriKind]::Absolute, [ref]$uri)) { return 'other-transport' }
        if ([string]::IsNullOrEmpty($uri.Host)) { return 'other-transport' }
        $path = Get-RepositoryPathIdentity $uri.AbsolutePath
        if ($path.Length -eq 0) { return $uri.Host }
        return $uri.Host + '/' + $path
    }
    if ($value -match '^(?:[A-Za-z0-9._-]+@)?([A-Za-z0-9.-]+):([^\s:]*)$') {
        $path = Get-RepositoryPathIdentity $Matches[2]
        if ($path.Length -eq 0) { return $Matches[1] }
        return $Matches[1] + '/' + $path
    }
    return 'other-transport'
}

function Enter-OutputRootLock {
    # One exclusive, OS-enforced lock per output root. The name is derived from a hash of the
    # normalized path, so the private path itself never appears anywhere. The mutex is owned by
    # this process only and is released by Exit-OutputRootLock in the main finally block; the
    # operating system releases it if the process dies, so no stale lock can block a later run.
    $hash = Get-Sha256Hex ($script:Utf8NoBom.GetBytes((Get-NormalizedPath $script:OutRoot)))
    $name = 'Global\VECTOR.ProjectLeadEvidence.' + $hash.Substring(0, 32)
    $mutex = $null
    try {
        $mutex = New-Object System.Threading.Mutex($false, $name)
    } catch {
        Stop-Blocked ('could not create the output-root lock: ' + (Get-SafeErrorText $_.Exception.Message))
    }
    $acquired = $false
    try {
        $acquired = $mutex.WaitOne($LockTimeoutSeconds * 1000)
    } catch [System.Threading.AbandonedMutexException] {
        # The previous owner exited without releasing; the OS handed the lock to us.
        $acquired = $true
    }
    if (-not $acquired) {
        $mutex.Dispose()
        Stop-Blocked ('another export holds the lock for this output root (waited ' + $LockTimeoutSeconds + ' s); CURRENT was not touched')
    }
    $script:Lock = $mutex
    Write-Step 'Output-root lock' 'ACQUIRED'
}

function Exit-OutputRootLock {
    if ($null -eq $script:Lock) { return }
    try { $script:Lock.ReleaseMutex() } catch { }
    try { $script:Lock.Dispose() } catch { }
    $script:Lock = $null
}

function ConvertTo-CanonicalSourceText {
    # The one canonical representation of an embedded source: UTF-8 text without a leading BOM
    # and with exactly one trailing LF. The generator writes it and the validator recomputes it
    # from the Git blob at the declared commit.
    param([byte[]]$Bytes)
    $text = $script:Utf8NoBom.GetString($Bytes)
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }
    if (-not $text.EndsWith("`n")) { $text += "`n" }
    return $text
}

# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------

function Initialize-Context {
    $gitVersion = Invoke-Git -Arguments @('--version') -WorkingDirectory $null
    if ($gitVersion.ExitCode -ne 0) { Stop-Blocked 'git is not available on PATH' }

    if (-not (Test-Path -LiteralPath $OutputRoot -PathType Container)) {
        Stop-Blocked ('OutputRoot does not exist or is not a directory: ' + $OutputRoot)
    }
    $script:OutRoot = (Resolve-Path -LiteralPath $OutputRoot).ProviderPath.TrimEnd('\')

    if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
        $candidateRoot = Split-Path -Parent $PSScriptRoot
    } else {
        $candidateRoot = $RepositoryRoot
    }
    if (-not (Test-Path -LiteralPath $candidateRoot -PathType Container)) {
        Stop-Blocked ('RepositoryRoot does not exist: ' + $candidateRoot)
    }
    $script:RepoRoot = (Resolve-Path -LiteralPath $candidateRoot).ProviderPath.TrimEnd('\')

    $topLevel = Invoke-Git -Arguments @('rev-parse', '--show-toplevel')
    if ($topLevel.ExitCode -ne 0) { Stop-Blocked ('RepositoryRoot is not inside a Git work tree: ' + $script:RepoRoot) }
    $topLevelPath = $topLevel.Text.TrimEnd("`r", "`n")
    if ((Get-NormalizedPath $topLevelPath) -ne (Get-NormalizedPath $script:RepoRoot)) {
        Stop-Blocked ('RepositoryRoot must be the top level of the Git work tree (top level is ' + $topLevelPath + ')')
    }

    $normalizedOut = Get-NormalizedPath $script:OutRoot
    $normalizedRepo = Get-NormalizedPath $script:RepoRoot
    if ($normalizedOut -eq $normalizedRepo -or $normalizedOut.StartsWith($normalizedRepo + '\')) {
        Stop-Blocked 'OutputRoot must not be inside the repository'
    }

    $script:EvidenceDir = Join-Path $script:OutRoot 'Evidence'
    $script:CurrentDir = Join-Path $script:EvidenceDir 'CURRENT'
    $script:ArchiveDir = Join-Path $script:EvidenceDir 'ARCHIVE'
    $script:RunId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)

    Write-Host 'VECTOR Project Lead evidence export'
    Write-Host ('Repository root: ' + $script:RepoRoot)
    Write-Host ('Output root:     ' + $script:OutRoot)
}

function Get-SnapshotContext {
    $branchResult = Invoke-Git -Arguments @('symbolic-ref', '--short', '-q', 'HEAD')
    if ($branchResult.ExitCode -ne 0) { Stop-Blocked 'HEAD is detached; productive evidence requires the expected branch to be checked out' }
    $branch = $branchResult.Text.TrimEnd("`r", "`n")
    if ($branch -ne $ExpectedBranch) {
        Stop-Blocked ("active branch '{0}' is not the expected branch '{1}'; CURRENT evidence is exported from '{1}' only" -f $branch, $ExpectedBranch)
    }
    Write-Step 'Branch' ('PASS (' + $branch + ')')

    # Remote freshness. The exported status is generic by design (finding: private paths must
    # never reach VECTOR_EVIDENCE.md); the redacted diagnostic is printed on the console only.
    $remoteEvidence = 'NOT_APPLICABLE (local baseline ref)'
    $remoteDetail = ''
    $repositoryIdentity = 'local checkout (no remote baseline)'
    $baselineLookup = $BaselineRef
    if ($BaselineRef -match '^([^/]+)/(.+)$') {
        $remoteName = $Matches[1]
        $remoteBranch = $Matches[2]
        $remotes = @((Get-GitText -Arguments @('remote') -What 'remote') -split "`r?`n" | Where-Object { $_.Length -gt 0 })
        if ($remotes -contains $remoteName) {
            $remoteUrl = Get-GitText -Arguments @('remote', 'get-url', $remoteName) -What 'remote get-url'
            $repositoryIdentity = Get-NormalizedRemoteIdentity $remoteUrl
            $trackingRef = 'refs/remotes/' + $remoteName + '/' + $remoteBranch
            $baselineLookup = $trackingRef
            # Fetch with an explicit refspec into the exact remote-tracking ref that is compared
            # below, independent of the repository's configured fetch mapping. The forced update
            # mirrors the remote branch; safety comes from the HEAD comparison, never from the ref.
            $refspec = '+refs/heads/' + $remoteBranch + ':' + $trackingRef
            $fetch = Invoke-Git -Arguments @('fetch', '--quiet', '--no-tags', $remoteName, $refspec) -TimeoutMs ($FetchTimeoutSeconds * 1000)
            if ($fetch.ExitCode -eq 0) {
                # Verify that the compared ref really carries what was just fetched.
                $fetched = Invoke-Git -Arguments @('rev-parse', '--verify', '--quiet', 'FETCH_HEAD^{commit}')
                $tracking = Invoke-Git -Arguments @('rev-parse', '--verify', '--quiet', ($trackingRef + '^{commit}'))
                $fetchedSha = $fetched.Text.TrimEnd("`r", "`n")
                $trackingSha = $tracking.Text.TrimEnd("`r", "`n")
                if ($fetched.ExitCode -eq 0 -and $tracking.ExitCode -eq 0 -and (Test-FullSha $fetchedSha) -and $fetchedSha -eq $trackingSha) {
                    $remoteEvidence = 'FRESHLY_FETCHED'
                } else {
                    $remoteEvidence = 'LOCALLY_CACHED (tracking ref not refreshed)'
                    $remoteDetail = 'FETCH_HEAD and ' + $trackingRef + ' differ after fetch'
                }
            } elseif ($fetch.TimedOut) {
                $remoteEvidence = 'LOCALLY_CACHED (fetch timed out)'
                $remoteDetail = Get-SafeErrorText $fetch.Error
            } else {
                $remoteEvidence = 'LOCALLY_CACHED (fetch failed)'
                $remoteDetail = Get-SafeErrorText $fetch.Error
            }
        } else {
            $remoteEvidence = 'NOT_APPLICABLE (configured remote not found)'
            $remoteDetail = "no remote named '" + $remoteName + "'"
        }
    }
    if ($remoteDetail) {
        Write-Step 'Remote evidence' ($remoteEvidence + ' [' + $remoteDetail + ']')
    } else {
        Write-Step 'Remote evidence' $remoteEvidence
    }

    $baselineResult = Invoke-Git -Arguments @('rev-parse', '--verify', '--quiet', ($baselineLookup + '^{commit}'))
    if ($baselineResult.ExitCode -ne 0) { Stop-Blocked ("BaselineRef '{0}' does not resolve to a commit" -f $BaselineRef) }
    $baselineHead = $baselineResult.Text.TrimEnd("`r", "`n")
    $head = Get-GitText -Arguments @('rev-parse', '--verify', 'HEAD^{commit}') -What 'rev-parse HEAD'
    if (-not (Test-FullSha $head) -or -not (Test-FullSha $baselineHead)) { Stop-Blocked 'could not resolve full commit SHAs' }
    if ($head -ne $baselineHead) {
        Stop-Blocked ("local HEAD {0} does not equal {1} {2}; synchronize the checkout first" -f $head, $BaselineRef, $baselineHead)
    }
    Write-Step 'Local HEAD = BaselineRef' ('PASS (' + $head + ')')

    [void](Invoke-Git -Arguments @('update-index', '-q', '--refresh'))
    $status = Invoke-Git -Arguments @('status', '--porcelain=v1', '--untracked-files=all')
    if ($status.ExitCode -ne 0) { Stop-Blocked ('git status failed: ' + (Get-SafeErrorText $status.Error)) }
    $statusLines = @($status.Text -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 })
    if ($statusLines.Count -gt 0) {
        $preview = ($statusLines | Select-Object -First 10) -join '; '
        Stop-Blocked ("working tree is not clean ({0} entries): {1}" -f $statusLines.Count, $preview)
    }
    Write-Step 'Working tree' 'PASS (clean)'

    $logResult = Get-GitText -Arguments @('log', '-n', [string]$RecentCommitCount, '--no-decorate', '--format=%H%x1f%cI%x1f%s', 'HEAD') -What 'log'
    $recentCommits = @()
    foreach ($line in ($logResult -split "`r?`n")) {
        if ($line.Trim().Length -eq 0) { continue }
        $fields = $line -split [char]0x1f
        if ($fields.Count -lt 3) { continue }
        $recentCommits += [pscustomobject]@{ Sha = $fields[0]; Date = $fields[1]; Subject = ($fields[2] -replace '[\r\n]', ' ') }
    }

    $previous = Get-PreviousSnapshot -Head $head

    return [pscustomobject]@{
        Branch             = $branch
        Commit             = $head
        SnapshotId         = ($ExpectedBranch + ':' + $head)
        BaselineRef        = $BaselineRef
        BaselineHead       = $baselineHead
        RemoteEvidence     = $remoteEvidence
        RepositoryIdentity = $repositoryIdentity
        GeneratedUtc       = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
        RecentCommits      = $recentCommits
        Previous           = $previous
    }
}

function Get-PreviousSnapshot {
    # A predecessor is used for the changed-files comparison only after the complete previous
    # three-file set passed the same strict, commit-bound validator as every other evidence
    # set. Anything else (missing files, altered content, thrown errors, foreign branch) makes
    # the comparison NOT_AVAILABLE; it never blocks the creation of the new snapshot.
    param([string]$Head)
    $result = [pscustomobject]@{ Commit = $null; Status = 'NOT_AVAILABLE (no previous CURRENT evidence)'; Files = @(); Truncated = $false }
    if (-not (Test-Path -LiteralPath $script:CurrentDir -PathType Container)) { return $result }
    if (@(Get-ChildItem -LiteralPath $script:CurrentDir -Force).Count -eq 0) { return $result }
    $validation = $null
    try {
        $validation = Test-EvidenceSet -Directory $script:CurrentDir
    } catch {
        $validation = [pscustomobject]@{ Problems = @('validation threw: ' + (Get-SafeErrorText $_.Exception.Message)); Commit = $null; DeclaredBranch = $null }
    }
    if ($validation.Problems.Count -gt 0) {
        Write-Step 'Previous CURRENT' ('not a valid snapshot (' + $validation.Problems.Count + ' problem(s)); comparison NOT_AVAILABLE')
        foreach ($problem in ($validation.Problems | Select-Object -First 5)) { Write-Host ('NOTE: previous CURRENT: ' + $problem) }
        $result.Status = 'NOT_AVAILABLE (previous CURRENT is not a valid snapshot)'
        return $result
    }
    if ($validation.DeclaredBranch -ne $ExpectedBranch) {
        $result.Status = 'NOT_AVAILABLE (previous snapshot belongs to a different branch)'
        return $result
    }
    $commit = $validation.Commit
    Write-Step 'Previous CURRENT' ('valid snapshot of ' + $commit)
    $result.Commit = $commit
    if ($commit -eq $Head) {
        $result.Status = 'NONE (identical Snapshot Commit)'
        return $result
    }
    $exists = Invoke-Git -Arguments @('cat-file', '-e', ($commit + '^{commit}'))
    if ($exists.ExitCode -ne 0) {
        $result.Status = 'NOT_AVAILABLE (previous Snapshot Commit not present in this repository)'
        return $result
    }
    $ancestor = Invoke-Git -Arguments @('merge-base', '--is-ancestor', $commit, $Head)
    if ($ancestor.ExitCode -ne 0) {
        $result.Status = 'NOT_AVAILABLE (previous Snapshot Commit is not an ancestor of the Snapshot Commit)'
        return $result
    }
    $diff = Invoke-Git -Arguments @('diff', '--name-only', $commit, $Head)
    if ($diff.ExitCode -ne 0) {
        $result.Status = 'NOT_AVAILABLE (git diff failed)'
        return $result
    }
    $files = @($diff.Text -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 })
    if ($files.Count -gt $script:MaxChangedFiles) {
        $result.Truncated = $true
        $files = @($files | Select-Object -First $script:MaxChangedFiles)
    }
    $result.Files = $files
    $result.Status = 'AVAILABLE'
    return $result
}

# ---------------------------------------------------------------------------
# Sources (read commit-bound through Git, never from the working tree)
# ---------------------------------------------------------------------------

function Get-CommitSource {
    param([string]$Commit, [string]$RelativePath)
    $spec = $Commit + ':' + $RelativePath
    $exists = Invoke-Git -Arguments @('cat-file', '-e', $spec)
    if ($exists.ExitCode -ne 0) { Stop-Blocked ("mandatory source '{0}' is missing at Snapshot Commit {1}" -f $RelativePath, $Commit) }
    $blobId = Get-GitText -Arguments @('rev-parse', '--verify', $spec) -What ('rev-parse ' + $RelativePath)
    $content = Invoke-Git -Arguments @('cat-file', 'blob', $spec)
    if ($content.ExitCode -ne 0) { Stop-Blocked ("mandatory source '{0}' could not be read at Snapshot Commit" -f $RelativePath) }
    if ($content.Bytes.Length -eq 0) { Stop-Blocked ("mandatory source '{0}' is empty" -f $RelativePath) }
    if ($content.Bytes.Length -gt $script:MaxSourceBytes) {
        Stop-Blocked ("mandatory source '{0}' exceeds the size limit of {1} bytes" -f $RelativePath, $script:MaxSourceBytes)
    }
    $workingTreePath = Join-Path $script:RepoRoot ($RelativePath -replace '/', '\')
    if (-not (Test-Path -LiteralPath $workingTreePath -PathType Leaf)) {
        Stop-Blocked ("mandatory source '{0}' is not readable in the working tree" -f $RelativePath)
    }
    $text = ConvertTo-CanonicalSourceText $content.Bytes
    $secret = Test-SecretPatterns -Text $text -Label $RelativePath
    if ($secret) { Stop-Blocked $secret }
    if ([regex]::IsMatch($text, '(?m)' + $script:MarkerPattern)) {
        Stop-Blocked ("mandatory source '{0}' contains a line shaped like a content marker and cannot be embedded unambiguously" -f $RelativePath)
    }
    return [pscustomobject]@{
        Path   = $RelativePath
        Blob   = $blobId
        Bytes  = $content.Bytes
        Text   = $text
        Sha256 = (Get-Sha256Hex $content.Bytes)
    }
}

function Get-Sources {
    param([string]$Commit)
    $projectState = Get-CommitSource -Commit $Commit -RelativePath $script:ProjectStateSource
    $governance = @()
    $total = $projectState.Bytes.Length
    foreach ($path in $script:GovernanceSources) {
        $source = Get-CommitSource -Commit $Commit -RelativePath $path
        $governance += $source
        $total += $source.Bytes.Length
    }
    if ($total -gt $script:MaxTotalBytes) { Stop-Blocked ('combined source size exceeds the limit of ' + $script:MaxTotalBytes + ' bytes') }
    Write-Step 'Sources' ('PASS (' + (1 + $governance.Count) + ' files, ' + $total + ' bytes)')
    return [pscustomobject]@{ ProjectState = $projectState; Governance = $governance }
}

# ---------------------------------------------------------------------------
# Candidate generation
# ---------------------------------------------------------------------------

function New-GovernanceContextText {
    param($Context, $Governance)
    # Emits exactly the grammar that Get-GovernanceDocument accepts (see the grammar constants).
    $header = @{
        'Format Version'  = $script:FormatVersion
        'Evidence Kind'   = 'GOVERNANCE_CONTEXT'
        'Snapshot ID'     = $Context.SnapshotId
        'Snapshot Commit' = $Context.Commit
        'Generated (UTC)' = $Context.GeneratedUtc
        'Source Count'    = [string]$Governance.Count
        'Generator'       = $script:GeneratorPath
    }
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append($script:GovernanceTitle + "`n`n")
    foreach ($label in $script:GovernanceHeaderFields) { [void]$sb.Append($label + ': ' + $header[$label] + "`n") }
    [void]$sb.Append("`n")
    foreach ($statement in $script:GovernanceStatements) { [void]$sb.Append($statement + "`n") }
    $index = 0
    foreach ($source in $Governance) {
        $index++
        $fields = @{
            'Repository Path' = $source.Path
            'Snapshot Commit' = $Context.Commit
            'Git Blob'        = $source.Blob
            'SHA256'          = $source.Sha256
            'Bytes'           = [string]$source.Bytes.Length
        }
        [void]$sb.Append("`n## Source $index of $($Governance.Count): $($source.Path)`n`n")
        foreach ($label in $script:GovernanceSectionFields) { [void]$sb.Append($label + ': ' + $fields[$label] + "`n") }
        [void]$sb.Append("`n")
        [void]$sb.Append(($script:BeginMarker -f $source.Path) + "`n")
        [void]$sb.Append($source.Text)   # canonical text, already ends with exactly one LF
        [void]$sb.Append(($script:EndMarker -f $source.Path) + "`n")
    }
    return $sb.ToString()
}

function New-EvidenceText {
    param($Context, $Sources, [string]$GovernanceSha256, [int]$GovernanceBytes)
    $ps = $Sources.ProjectState
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append("# VECTOR Evidence`n`n")
    [void]$sb.Append("Format Version: $($script:FormatVersion)`n")
    [void]$sb.Append("Evidence Kind: VECTOR_EVIDENCE`n")
    [void]$sb.Append("Evidence Status: $($script:StatusVerified)`n")
    [void]$sb.Append("Snapshot ID: $($Context.SnapshotId)`n")
    [void]$sb.Append("Snapshot Commit: $($Context.Commit)`n")
    [void]$sb.Append("Repository: $($Context.RepositoryIdentity)`n")
    [void]$sb.Append("Branch: $($Context.Branch)`n")
    [void]$sb.Append("Local HEAD: $($Context.Commit)`n")
    [void]$sb.Append("Baseline Ref: $($Context.BaselineRef)`n")
    [void]$sb.Append("Baseline Ref HEAD: $($Context.BaselineHead)`n")
    [void]$sb.Append("Remote Evidence: $($Context.RemoteEvidence)`n")
    [void]$sb.Append("Synchronization: LOCAL_HEAD_EQUALS_BASELINE_REF`n")
    [void]$sb.Append("Working Tree: CLEAN`n")
    [void]$sb.Append("Generated (UTC): $($Context.GeneratedUtc)`n")
    [void]$sb.Append("Generator: $($script:GeneratorPath) (format $($script:FormatVersion))`n`n")
    [void]$sb.Append("## Statements`n`n")
    [void]$sb.Append("- This is commit-bound evidence generated from a local Git checkout. It is NOT live GitHub access and may be older than the repository.`n")
    [void]$sb.Append("- OneDrive cloud synchronization happens outside the generator. Successful generation guarantees only the local consistency checked by the generator.`n")
    [void]$sb.Append("- The snapshot is valid only when VECTOR_EVIDENCE.md, PROJECT_STATE.md and GOVERNANCE_CONTEXT.md all exist in CURRENT and every commit-specific statement names the Snapshot Commit above.`n")
    [void]$sb.Append("- PROJECT_STATE.md does not contain this Snapshot Commit; its own 'State verified through commit' field is the last commit through which its statements were verified.`n")
    [void]$sb.Append("- Treat any Evidence Status other than $($script:StatusVerified), missing files, inconsistent commits or unclear provenance as a stop condition.`n`n")
    [void]$sb.Append("## Exported PROJECT_STATE`n`n")
    [void]$sb.Append("Source Path: $($ps.Path)`n")
    [void]$sb.Append("Snapshot Commit: $($Context.Commit)`n")
    [void]$sb.Append("Export File: PROJECT_STATE.md`n")
    [void]$sb.Append("Exported PROJECT_STATE Git Blob: $($ps.Blob)`n")
    [void]$sb.Append("Exported PROJECT_STATE SHA256: $($ps.Sha256)`n")
    [void]$sb.Append("Exported PROJECT_STATE Bytes: $($ps.Bytes.Length)`n`n")
    [void]$sb.Append("## Exported GOVERNANCE_CONTEXT`n`n")
    [void]$sb.Append("Export File: GOVERNANCE_CONTEXT.md`n")
    [void]$sb.Append("Exported GOVERNANCE_CONTEXT SHA256: $GovernanceSha256`n")
    [void]$sb.Append("Exported GOVERNANCE_CONTEXT Bytes: $GovernanceBytes`n")
    [void]$sb.Append("Sources (repository path, git blob, SHA256):`n")
    foreach ($source in $Sources.Governance) {
        [void]$sb.Append("- $($source.Path) | $($source.Blob) | $($source.Sha256)`n")
    }
    [void]$sb.Append("`n## Recent Commits`n`n")
    [void]$sb.Append("Bounded history for orientation only (newest first, at most $RecentCommitCount). Only the Snapshot Commit above is commit-specific evidence.`n`n")
    foreach ($commit in $Context.RecentCommits) {
        [void]$sb.Append("- $($commit.Sha) $($commit.Date) $($commit.Subject)`n")
    }
    [void]$sb.Append("`n## Changed Files Since Previous Valid Snapshot`n`n")
    if ($Context.Previous.Commit) {
        [void]$sb.Append("Previous Snapshot Commit: $($Context.Previous.Commit)`n")
    } else {
        [void]$sb.Append("Previous Snapshot Commit: NONE`n")
    }
    [void]$sb.Append("Status: $($Context.Previous.Status)`n")
    if ($Context.Previous.Status -eq 'AVAILABLE') {
        foreach ($file in $Context.Previous.Files) { [void]$sb.Append("- $file`n") }
        if ($Context.Previous.Truncated) { [void]$sb.Append("- ... (list truncated at $($script:MaxChangedFiles) entries)`n") }
    }
    return $sb.ToString()
}

function New-Candidate {
    param($Context, $Sources)
    if (-not (Test-Path -LiteralPath $script:EvidenceDir)) { [void](New-Item -ItemType Directory -Path $script:EvidenceDir) }
    $script:StagingDir = Join-Path $script:EvidenceDir ('.staging-' + $script:RunId)
    [void](New-Item -ItemType Directory -Path $script:StagingDir)

    [System.IO.File]::WriteAllBytes((Join-Path $script:StagingDir 'PROJECT_STATE.md'), $Sources.ProjectState.Bytes)

    $governanceText = New-GovernanceContextText -Context $Context -Governance $Sources.Governance
    $governanceBytes = $script:Utf8NoBom.GetBytes($governanceText)
    [System.IO.File]::WriteAllBytes((Join-Path $script:StagingDir 'GOVERNANCE_CONTEXT.md'), $governanceBytes)

    $evidenceText = New-EvidenceText -Context $Context -Sources $Sources -GovernanceSha256 (Get-Sha256Hex $governanceBytes) -GovernanceBytes $governanceBytes.Length
    Write-Utf8File -Path (Join-Path $script:StagingDir 'VECTOR_EVIDENCE.md') -Text $evidenceText
    Write-Step 'Candidate' ('PASS (' + $script:StagingDir + ')')
}

# ---------------------------------------------------------------------------
# Validation of an evidence set (candidate or published)
# ---------------------------------------------------------------------------

function Get-LinePreview {
    param([string]$Line)
    $preview = $Line
    if ($preview.Length -gt 60) { $preview = $preview.Substring(0, 60) + '...' }
    return $preview
}

function Read-FieldBlock {
    # Reads "Label: value" lines in exactly the given order until a blank line. Every label must
    # appear exactly once: a repeated label is a duplicate (identical or not), a known label at
    # the wrong position is out of order, anything else is unknown or unexpected text.
    param([string[]]$Lines, [ref]$Index, [string[]]$Labels, [string]$Context)
    $problems = @()
    $values = @{}
    $next = 0
    while ($Index.Value -lt $Lines.Count) {
        $line = $Lines[$Index.Value]
        if ($line -eq '') { break }
        if ($line -match $script:MarkerPattern) { break }
        if ($line -notmatch '^([A-Za-z0-9][A-Za-z0-9 ()]*):[ \t]*(.*)$') {
            $problems += ($Context + ": unexpected text where a metadata field was expected: '" + (Get-LinePreview $line) + "'")
            $Index.Value++
            continue
        }
        $label = $Matches[1]
        $value = $Matches[2].Trim()
        if ($next -lt $Labels.Count -and $label -eq $Labels[$next]) {
            $values[$label] = $value
            $next++
        } elseif ($values.ContainsKey($label)) {
            $problems += ($Context + ": duplicated field '" + $label + "'")
        } elseif ($Labels -contains $label) {
            $problems += ($Context + ": field '" + $label + "' out of order")
        } else {
            $problems += ($Context + ": unknown metadata field '" + $label + "'")
        }
        $Index.Value++
    }
    foreach ($label in $Labels) {
        if (-not $values.ContainsKey($label)) { $problems += ($Context + ": missing field '" + $label + "'") }
    }
    return [pscustomobject]@{ Values = $values; Problems = $problems }
}

function Get-GovernanceDocument {
    # Strict sequential parser for the complete GOVERNANCE_CONTEXT.md grammar (see the grammar
    # constants). Every line of the file is consumed and classified; anything outside the
    # generated framing, the fixed metadata and the embedded bodies is an error. Parsing stops
    # at the first structural error, with the collected problems describing it.
    param([string]$Text)
    $problems = @()
    $sections = @()
    $header = @{}
    if ($Text.Contains("`r")) { $problems += 'GOVERNANCE_CONTEXT.md: contains carriage returns; the generated form is LF only' }
    $lines = $Text -split "`n"
    $last = $lines.Count - 1
    $i = 0

    $expectLine = {
        param([string]$Expected, [string]$Description)
        if ($i -gt $last) { $problems += ('GOVERNANCE_CONTEXT.md: truncated file, expected ' + $Description); return $false }
        if ($lines[$i] -ne $Expected) {
            $actual = $lines[$i]
            if ($actual -match $script:MarkerPattern) { $problems += ('GOVERNANCE_CONTEXT.md: unmatched ' + $Matches[1] + " CONTENT marker for '" + $Matches[2] + "' where " + $Description + ' was expected') }
            else { $problems += ('GOVERNANCE_CONTEXT.md: unexpected text where ' + $Description + " was expected: '" + (Get-LinePreview $actual) + "'") }
            return $false
        }
        $i++
        return $true
    }

    if ($lines.Count -lt 3 -or $lines[0] -ne $script:GovernanceTitle) {
        $problems += 'GOVERNANCE_CONTEXT.md: unexpected text before the generated header (title line missing)'
        return [pscustomobject]@{ Problems = $problems; Header = $header; Sections = $sections }
    }
    $i = 1
    if (-not (. $expectLine '' 'the blank line after the title')) { return [pscustomobject]@{ Problems = $problems; Header = $header; Sections = $sections } }
    $block = Read-FieldBlock -Lines $lines -Index ([ref]$i) -Labels $script:GovernanceHeaderFields -Context 'GOVERNANCE_CONTEXT.md header'
    $problems += $block.Problems
    $header = $block.Values
    if ($problems.Count -gt 0) { return [pscustomobject]@{ Problems = $problems; Header = $header; Sections = $sections } }
    if (-not (. $expectLine '' 'the blank line after the header fields')) { return [pscustomobject]@{ Problems = $problems; Header = $header; Sections = $sections } }
    foreach ($statement in $script:GovernanceStatements) {
        if (-not (. $expectLine $statement 'a generated statement line')) { return [pscustomobject]@{ Problems = $problems; Header = $header; Sections = $sections } }
    }

    $position = 0
    while ($true) {
        # End of file: exactly one empty element remains from the trailing LF.
        if ($i -eq $last -and $lines[$i] -eq '') { break }
        if ($i -gt $last) { $problems += 'GOVERNANCE_CONTEXT.md: truncated file after the last section'; break }
        $position++
        $where = if ($position -eq 1) { 'after the statement lines' } else { "after section $($position - 1)" }
        if (-not (. $expectLine '' ('the blank line ' + $where))) { break }
        if ($i -gt $last) { $problems += 'GOVERNANCE_CONTEXT.md: truncated file, expected a section heading'; break }
        $heading = $lines[$i]
        if ($heading -notmatch '^## Source (\d+) of (\d+): (.+)$') {
            if ($heading -match $script:MarkerPattern) { $problems += ('GOVERNANCE_CONTEXT.md: unmatched ' + $Matches[1] + " CONTENT marker for '" + $Matches[2] + "' " + $where) }
            else { $problems += ('GOVERNANCE_CONTEXT.md: unexpected text ' + $where + " (expected a section heading or the end of the file): '" + (Get-LinePreview $heading) + "'") }
            break
        }
        $headingIndex = [int]$Matches[1]
        $headingTotal = [int]$Matches[2]
        $headingPath = $Matches[3]
        $i++
        $context = "GOVERNANCE_CONTEXT.md section $position ('$headingPath')"
        if ($headingIndex -ne $position) { $problems += ($context + ": heading number $headingIndex does not match position $position") }
        if (-not (. $expectLine '' 'the blank line after the section heading')) { break }
        $block = Read-FieldBlock -Lines $lines -Index ([ref]$i) -Labels $script:GovernanceSectionFields -Context $context
        $problems += $block.Problems
        if ($block.Problems.Count -gt 0) { break }
        $fields = $block.Values
        if ($fields['Repository Path'] -ne $headingPath) { $problems += ($context + ": Repository Path '" + $fields['Repository Path'] + "' differs from the heading") }
        if (-not (. $expectLine '' 'the blank line between the metadata and BEGIN CONTENT')) { break }
        if ($i -gt $last) { $problems += ($context + ': truncated before BEGIN CONTENT'); break }
        if ($lines[$i] -ne ($script:BeginMarker -f $headingPath)) {
            if ($lines[$i] -match $script:MarkerPattern) { $problems += ($context + ': ' + $Matches[1] + " CONTENT marker for '" + $Matches[2] + "' does not match the section") }
            else { $problems += ($context + ": unexpected text between the metadata and BEGIN CONTENT: '" + (Get-LinePreview $lines[$i]) + "'") }
            break
        }
        $i++
        $endMarker = $script:EndMarker -f $headingPath
        $body = New-Object System.Collections.Generic.List[string]
        $closed = $false
        while ($i -le $last) {
            $line = $lines[$i]
            if ($line -eq $endMarker) { $closed = $true; $i++; break }
            if ($line -match $script:MarkerPattern) {
                if ($Matches[1] -eq 'BEGIN') { $problems += ($context + ": nested BEGIN CONTENT marker for '" + $Matches[2] + "' inside the body") }
                else { $problems += ($context + ": END CONTENT marker for '" + $Matches[2] + "' does not match the open section") }
                break
            }
            $body.Add($line)
            $i++
        }
        if (-not $closed) {
            if ($problems.Count -eq 0 -or $i -gt $last) { $problems += ($context + ': not closed, END CONTENT marker missing (truncated file)') }
            break
        }
        $sections += [pscustomobject]@{
            Position = $position
            Total    = $headingTotal
            Path     = $headingPath
            Commit   = $fields['Snapshot Commit']
            Blob     = $fields['Git Blob']
            Sha256   = $fields['SHA256'].ToLowerInvariant()
            Bytes    = $fields['Bytes']
            Body     = (($body -join "`n") + "`n")
        }
    }
    return [pscustomobject]@{ Problems = $problems; Header = $header; Sections = $sections }
}

function Test-GovernanceSections {
    # Commit-bound verification of every embedded source: the body must equal the canonical
    # text of the Git blob at the declared commit, and the declared blob id, SHA256 and size must
    # match that blob. The allowlist order and count are enforced exactly.
    param($Parsed, [string]$Commit)
    $problems = @()
    $verifiedBlobs = @()
    $sections = @($Parsed.Sections)
    $expected = $script:GovernanceSources
    if ($sections.Count -ne $expected.Count) {
        $problems += ("GOVERNANCE_CONTEXT.md: expected {0} source sections, found {1}" -f $expected.Count, $sections.Count)
    }
    $seen = @{}
    for ($i = 0; $i -lt $sections.Count; $i++) {
        $section = $sections[$i]
        $label = "GOVERNANCE_CONTEXT.md section '" + $section.Path + "'"
        if ($section.Total -ne $expected.Count) { $problems += ($label + ": heading total $($section.Total) differs from the allowlist size $($expected.Count)") }
        if ($expected -notcontains $section.Path) { $problems += ($label + ': not on the allowlist'); continue }
        if ($seen.ContainsKey($section.Path)) { $problems += ($label + ': duplicated'); continue }
        $seen[$section.Path] = $true
        if ($i -lt $expected.Count -and $expected[$i] -ne $section.Path) { $problems += ($label + ": out of allowlist order (expected '" + $expected[$i] + "' at position " + ($i + 1) + ')') }
        if ($section.Commit -ne $Commit) { $problems += ("GOVERNANCE_CONTEXT.md: Snapshot Commit mismatch: '{0}' in section '{1}' differs from Snapshot Commit {2}" -f $section.Commit, $section.Path, $Commit); continue }
        if (-not (Test-FullSha $Commit)) { continue }
        $spec = $Commit + ':' + $section.Path
        $repoBlob = Invoke-Git -Arguments @('rev-parse', '--verify', '--quiet', $spec)
        if ($repoBlob.ExitCode -ne 0) { $problems += ($label + ': source does not exist at the Snapshot Commit'); continue }
        $repoBlobId = $repoBlob.Text.TrimEnd("`r", "`n")
        if ($section.Blob -ne $repoBlobId) { $problems += ($label + ': declared Git Blob differs from the repository blob at the Snapshot Commit') }
        $content = Invoke-Git -Arguments @('cat-file', 'blob', $spec)
        if ($content.ExitCode -ne 0) { $problems += ($label + ': source could not be read at the Snapshot Commit'); continue }
        if ($section.Sha256 -ne (Get-Sha256Hex $content.Bytes)) { $problems += ($label + ': declared SHA256 differs from the repository blob') }
        if ([string]$section.Bytes -ne [string]$content.Bytes.Length) { $problems += ($label + ': declared Bytes differ from the repository blob') }
        if ($null -eq $section.Body) { $problems += ($label + ': content block missing'); continue }
        if (-not [string]::Equals($section.Body, (ConvertTo-CanonicalSourceText $content.Bytes), [System.StringComparison]::Ordinal)) {
            $problems += ($label + ': embedded content differs from the repository source at the Snapshot Commit')
        }
        $verifiedBlobs += $repoBlobId
    }
    foreach ($path in $expected) {
        if (-not $seen.ContainsKey($path)) { $problems += ("GOVERNANCE_CONTEXT.md: allowlisted source '{0}' is missing" -f $path) }
    }
    return [pscustomobject]@{ Problems = $problems; VerifiedBlobs = $verifiedBlobs }
}

function Test-EvidenceSet {
    param(
        [string]$Directory,
        [string]$ExpectedCommit,
        [string]$ExpectedBranchName
    )
    $problems = @()
    $hashes = @{}
    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) {
        return [pscustomobject]@{ Problems = @('evidence directory does not exist: ' + $Directory); Commit = $null; DeclaredBranch = $null; Hashes = $hashes; Fingerprint = $null }
    }
    $entries = @(Get-ChildItem -LiteralPath $Directory -Force)
    $names = @($entries | ForEach-Object { $_.Name })
    foreach ($required in $script:FinalFiles) {
        if ($names -notcontains $required) { $problems += ('required file missing: ' + $required) }
    }
    foreach ($entry in $entries) {
        if ($entry.PSIsContainer) { $problems += ('unexpected directory in evidence set: ' + $entry.Name) }
        elseif ($script:FinalFiles -notcontains $entry.Name) { $problems += ('unexpected file in evidence set: ' + $entry.Name) }
    }
    if ($problems.Count -gt 0) { return [pscustomobject]@{ Problems = $problems; Commit = $null; DeclaredBranch = $null; Hashes = $hashes; Fingerprint = $null } }

    $evidencePath = Join-Path $Directory 'VECTOR_EVIDENCE.md'
    $projectStatePath = Join-Path $Directory 'PROJECT_STATE.md'
    $governancePath = Join-Path $Directory 'GOVERNANCE_CONTEXT.md'
    $totalBytes = 0
    foreach ($name in $script:FinalFiles) {
        $path = Join-Path $Directory $name
        $hashes[$name] = Get-FileSha256 $path
        $totalBytes += (Get-Item -LiteralPath $path).Length
    }
    if ($totalBytes -gt $script:MaxTotalBytes) { $problems += ('evidence set exceeds the size limit of ' + $script:MaxTotalBytes + ' bytes') }

    $evidenceText = Read-Utf8File $evidencePath
    $governanceText = Read-Utf8File $governancePath
    $projectStateText = Read-Utf8File $projectStatePath

    # Required VECTOR_EVIDENCE.md fields appear exactly once; a missing or repeated field is an error.
    $fieldProblems = New-Object System.Collections.Generic.List[string]
    $unique = {
        param([string]$Label)
        $values = @(Get-FieldValues -Text $evidenceText -Label $Label)
        if ($values.Count -eq 0) { $fieldProblems.Add("VECTOR_EVIDENCE.md: missing field '" + $Label + "'"); return $null }
        if ($values.Count -gt 1) { $fieldProblems.Add("VECTOR_EVIDENCE.md: duplicated field '" + $Label + "'"); return $null }
        return $values[0]
    }
    $status = & $unique 'Evidence Status'
    if ($status -ne $script:StatusVerified) { $problems += ("VECTOR_EVIDENCE.md: Evidence Status is '{0}', expected {1}" -f $status, $script:StatusVerified) }

    # Snapshot Commit appears exactly twice by construction: header and PROJECT_STATE section.
    $evidenceCommits = @(Get-FieldValues -Text $evidenceText -Label 'Snapshot Commit')
    if ($evidenceCommits.Count -ne 2) { $problems += ("VECTOR_EVIDENCE.md: expected exactly 2 Snapshot Commit statements (header and PROJECT_STATE section), found {0}" -f $evidenceCommits.Count) }
    $commit = $ExpectedCommit
    if ([string]::IsNullOrEmpty($commit) -and $evidenceCommits.Count -gt 0) { $commit = $evidenceCommits[0] }
    if (-not (Test-FullSha $commit)) { $problems += ("Snapshot Commit is not a full 40-character SHA: '{0}'" -f $commit) }
    foreach ($value in $evidenceCommits) {
        if ($value -ne $commit) { $problems += ("VECTOR_EVIDENCE.md: Snapshot Commit mismatch: '{0}' differs from Snapshot Commit {1}" -f $value, $commit) }
    }

    # The declared Branch is always read from the file. ExpectedBranchName, when supplied, is
    # an additional constraint and never replaces the declared value.
    $declaredBranch = & $unique 'Branch'
    if ($null -ne $declaredBranch) {
        if ($declaredBranch.Length -eq 0) { $problems += 'VECTOR_EVIDENCE.md: Branch is empty' }
        elseif ($declaredBranch -notmatch $script:BranchPattern -or $declaredBranch.Contains('..')) { $problems += ("VECTOR_EVIDENCE.md: Branch '{0}' is not a valid branch name" -f $declaredBranch) }
        if (-not [string]::IsNullOrEmpty($ExpectedBranchName) -and $declaredBranch -ne $ExpectedBranchName) {
            $problems += ("VECTOR_EVIDENCE.md: declared Branch '{0}' differs from the expected branch '{1}'" -f $declaredBranch, $ExpectedBranchName)
        }
    }
    $snapshotId = & $unique 'Snapshot ID'
    if ($snapshotId -ne ($declaredBranch + ':' + $commit)) { $problems += ("VECTOR_EVIDENCE.md: Snapshot ID '{0}' does not equal '<declared Branch>:<Snapshot Commit>' = '{1}:{2}'" -f $snapshotId, $declaredBranch, $commit) }
    $localHead = & $unique 'Local HEAD'
    if ($localHead -ne $commit) { $problems += 'VECTOR_EVIDENCE.md: Local HEAD differs from Snapshot Commit' }
    $baselineHead = & $unique 'Baseline Ref HEAD'
    if ($baselineHead -ne $commit) { $problems += 'VECTOR_EVIDENCE.md: Baseline Ref HEAD differs from Snapshot Commit' }

    $declaredProjectStateSha = & $unique 'Exported PROJECT_STATE SHA256'
    if ($declaredProjectStateSha -ne $hashes['PROJECT_STATE.md']) { $problems += 'PROJECT_STATE.md: SHA256 differs from the value declared in VECTOR_EVIDENCE.md' }
    $declaredProjectStateBytes = & $unique 'Exported PROJECT_STATE Bytes'
    if ([string]$declaredProjectStateBytes -ne [string](Get-Item -LiteralPath $projectStatePath).Length) { $problems += 'PROJECT_STATE.md: size differs from the value declared in VECTOR_EVIDENCE.md' }
    $declaredGovernanceSha = & $unique 'Exported GOVERNANCE_CONTEXT SHA256'
    if ($declaredGovernanceSha -ne $hashes['GOVERNANCE_CONTEXT.md']) { $problems += 'GOVERNANCE_CONTEXT.md: SHA256 differs from the value declared in VECTOR_EVIDENCE.md' }
    $declaredGovernanceBytes = & $unique 'Exported GOVERNANCE_CONTEXT Bytes'
    if ([string]$declaredGovernanceBytes -ne [string](Get-Item -LiteralPath $governancePath).Length) { $problems += 'GOVERNANCE_CONTEXT.md: size differs from the value declared in VECTOR_EVIDENCE.md' }
    $sourcePath = & $unique 'Source Path'
    if ($sourcePath -ne $script:ProjectStateSource) { $problems += ("VECTOR_EVIDENCE.md: PROJECT_STATE Source Path is '{0}', expected {1}" -f $sourcePath, $script:ProjectStateSource) }

    $declaredBlob = & $unique 'Exported PROJECT_STATE Git Blob'
    $problems += @($fieldProblems)
    $exportedBlob = Invoke-Git -Arguments @('hash-object', '--no-filters', '--', $projectStatePath)
    if ($exportedBlob.ExitCode -ne 0) {
        $problems += 'PROJECT_STATE.md: git hash-object failed'
    } else {
        $exportedBlobId = $exportedBlob.Text.TrimEnd("`r", "`n")
        if ($exportedBlobId -ne $declaredBlob) { $problems += 'PROJECT_STATE.md: git blob differs from the value declared in VECTOR_EVIDENCE.md' }
        if (Test-FullSha $commit) {
            $commitExists = Invoke-Git -Arguments @('cat-file', '-e', ($commit + '^{commit}'))
            if ($commitExists.ExitCode -ne 0) {
                $problems += ('Snapshot Commit is not present in this repository: ' + $commit)
            } else {
                $repoBlob = Invoke-Git -Arguments @('rev-parse', '--verify', '--quiet', ($commit + ':' + $script:ProjectStateSource))
                if ($repoBlob.ExitCode -ne 0) {
                    $problems += ($script:ProjectStateSource + ' does not exist at the Snapshot Commit')
                } elseif ($repoBlob.Text.TrimEnd("`r", "`n") -ne $exportedBlobId) {
                    $problems += 'PROJECT_STATE.md: content differs from ' + $script:ProjectStateSource + ' at the Snapshot Commit'
                }
            }
        }
    }

    $parsed = Get-GovernanceDocument -Text $governanceText
    $problems += $parsed.Problems
    $sources = [pscustomobject]@{ Problems = @(); VerifiedBlobs = @() }
    if ($parsed.Problems.Count -eq 0) {
        $header = $parsed.Header
        if ($header['Format Version'] -ne $script:FormatVersion) { $problems += ("GOVERNANCE_CONTEXT.md: Format Version is '{0}', expected {1}" -f $header['Format Version'], $script:FormatVersion) }
        if ($header['Evidence Kind'] -ne 'GOVERNANCE_CONTEXT') { $problems += ("GOVERNANCE_CONTEXT.md: Evidence Kind is '{0}', expected GOVERNANCE_CONTEXT" -f $header['Evidence Kind']) }
        if ($header['Snapshot Commit'] -ne $commit) { $problems += ("GOVERNANCE_CONTEXT.md: Snapshot Commit mismatch: header '{0}' differs from Snapshot Commit {1}" -f $header['Snapshot Commit'], $commit) }
        if ($header['Snapshot ID'] -ne $snapshotId) { $problems += 'GOVERNANCE_CONTEXT.md: Snapshot ID differs from VECTOR_EVIDENCE.md' }
        if ([string]$header['Source Count'] -ne [string]$script:GovernanceSources.Count) { $problems += ("GOVERNANCE_CONTEXT.md: Source Count is '{0}', expected {1}" -f $header['Source Count'], $script:GovernanceSources.Count) }
        if ($header['Generator'] -ne $script:GeneratorPath) { $problems += ("GOVERNANCE_CONTEXT.md: Generator is '{0}', expected {1}" -f $header['Generator'], $script:GeneratorPath) }
        if ($header['Generated (UTC)'] -notmatch $script:TimestampPattern) { $problems += 'GOVERNANCE_CONTEXT.md: Generated (UTC) is not a UTC timestamp' }
        $sources = Test-GovernanceSections -Parsed $parsed -Commit $commit
        $problems += $sources.Problems
    }

    foreach ($pair in @(@('VECTOR_EVIDENCE.md', $evidenceText), @('PROJECT_STATE.md', $projectStateText), @('GOVERNANCE_CONTEXT.md', $governanceText))) {
        $secret = Test-SecretPatterns -Text $pair[1] -Label $pair[0]
        if ($secret) { $problems += $secret }
    }

    # Commit-bound identity of the snapshot: the commit plus every exported blob, all verified
    # against the repository above. Two generations of the same commit share it even though
    # their timestamps differ. It is only meaningful when Problems is empty.
    $fingerprint = $null
    if ($problems.Count -eq 0) { $fingerprint = $commit + '|' + $declaredBlob + '|' + ($sources.VerifiedBlobs -join ',') }

    return [pscustomobject]@{ Problems = @($problems); Commit = $commit; DeclaredBranch = $declaredBranch; Hashes = $hashes; Fingerprint = $fingerprint }
}

function Assert-ValidationPassed {
    param($Validation, [string]$Label)
    if ($Validation.Problems.Count -eq 0) {
        Write-Step $Label 'PASS'
        return
    }
    foreach ($problem in $Validation.Problems) { Write-Host ('CAUSE: ' + $problem) }
    Stop-Blocked ("{0} failed with {1} problem(s)" -f $Label, $Validation.Problems.Count)
}

function Test-SameHashes {
    param($Left, $Right)
    foreach ($name in $script:FinalFiles) {
        if ($Left[$name] -ne $Right[$name]) { return $false }
    }
    return $true
}

# ---------------------------------------------------------------------------
# Publication (locally fail-closed, with restore of the previous CURRENT)
# ---------------------------------------------------------------------------

function Publish-Candidate {
    param($CandidateValidation)
    $previousDir = $null
    if (Test-Path -LiteralPath $script:CurrentDir) {
        $previousDir = Join-Path $script:EvidenceDir ('.previous-' + $script:RunId)
        try {
            Move-Directory -Source $script:CurrentDir -Destination $previousDir -What 'move previous CURRENT aside'
        } catch {
            [void](Remove-DirectoryQuietly $script:StagingDir)
            $script:CurrentStatus = 'untouched (previous set left in place)'
            Stop-Blocked ('could not move the existing CURRENT aside (it is left untouched): ' + (Get-SafeErrorText $_.Exception.Message))
        }
        $script:CurrentStatus = 'MOVED ASIDE, not yet restored; recovery material at ' + $previousDir
    }

    try {
        if ($TestOnlySimulatePublishFailure -eq 'AfterPreviousMovedAside') {
            throw (New-Object System.IO.IOException 'simulated publication failure (test hook)')
        }
        Move-Directory -Source $script:StagingDir -Destination $script:CurrentDir -What 'publish candidate'
    } catch {
        $publishError = Get-SafeErrorText $_.Exception.Message
        [void](Remove-DirectoryQuietly $script:StagingDir)
        if ($null -eq $previousDir) {
            $script:CurrentStatus = 'not present (no previous set existed)'
            Stop-Blocked ('publication failed, no previous CURRENT existed: ' + $publishError)
        }
        Restore-PreviousCurrent -PreviousDir $previousDir -Reason ('publication failed: ' + $publishError)
    }

    # Post-publication validation. Returned problems and thrown exceptions are both failures
    # and both go through Restore-PreviousCurrent.
    $failure = $null
    try {
        if ($TestOnlySimulatePublishFailure -eq 'CorruptPublishedSet') {
            Remove-Item -LiteralPath (Join-Path $script:CurrentDir 'PROJECT_STATE.md') -Force
        }
        if ($TestOnlySimulatePublishFailure -eq 'ThrowDuringPostValidation') {
            throw (New-Object System.IO.IOException 'simulated exception during post-publication validation (test hook)')
        }
        $published = Test-EvidenceSet -Directory $script:CurrentDir -ExpectedCommit $CandidateValidation.Commit -ExpectedBranchName $ExpectedBranch
        if ($published.Problems.Count -gt 0) {
            foreach ($problem in $published.Problems) { Write-Host ('CAUSE: ' + $problem) }
            $failure = 'published CURRENT failed post-publication validation'
        } elseif (-not (Test-SameHashes $published.Hashes $CandidateValidation.Hashes)) {
            $failure = 'published CURRENT differs from the validated candidate'
        }
    } catch {
        $failure = 'post-publication validation threw: ' + (Get-SafeErrorText $_.Exception.Message)
    }
    if ($null -ne $failure) {
        # Move the unvalidated replacement out of CURRENT first; it is never left as CURRENT.
        $failedDir = Join-Path $script:EvidenceDir ('.failed-' + $script:RunId)
        $replacementMoved = $true
        try { Move-Directory -Source $script:CurrentDir -Destination $failedDir -What 'move failed publication aside' } catch { $replacementMoved = $false }
        if (-not $replacementMoved) {
            $script:CurrentStatus = 'INVALID replacement could not be moved out of CURRENT'
            if ($null -ne $previousDir) { $script:CurrentStatus += '; previous set preserved at ' + $previousDir }
            Stop-Blocked ($failure + '; the invalid replacement is still in CURRENT and must be removed by hand')
        }
        if ($null -eq $previousDir) {
            [void](Remove-DirectoryQuietly $failedDir)
            $script:CurrentStatus = 'not present (no previous set existed; invalid output discarded)'
            Stop-Blocked $failure
        }
        Restore-PreviousCurrent -PreviousDir $previousDir -Reason $failure -DiscardDir $failedDir
    }
    Write-Step 'Published CURRENT' 'PASS'
    $script:CurrentStatus = 'published and validated'

    if ($null -ne $previousDir) { [void](Remove-DirectoryQuietly $previousDir) }
}

function Restore-PreviousCurrent {
    # Single restoration path for every publication failure after the previous CURRENT was moved
    # aside. Restores the previous set, verifies it, discards the failed replacement only after a
    # successful restore, records the exact local state and always ends in Stop-Blocked.
    param([string]$PreviousDir, [string]$Reason, [string]$DiscardDir)
    if (Test-Path -LiteralPath $script:CurrentDir) {
        $script:CurrentStatus = 'UNEXPECTED directory in CURRENT; previous set preserved at ' + $PreviousDir
        Stop-Blocked ($Reason + '; an unexpected CURRENT exists, previous evidence preserved at ' + $PreviousDir)
    }
    try {
        Move-Directory -Source $PreviousDir -Destination $script:CurrentDir -What 'restore previous CURRENT'
    } catch {
        $script:CurrentStatus = 'NOT RESTORED; previous set preserved at ' + $PreviousDir
        if ($DiscardDir) { $script:CurrentStatus += '; failed replacement kept at ' + $DiscardDir }
        Stop-Blocked ($Reason + '; the previous CURRENT could not be restored: ' + (Get-SafeErrorText $_.Exception.Message))
    }
    $verification = 'restored'
    try {
        $entries = @(Get-ChildItem -LiteralPath $script:CurrentDir -Force)
        if ($entries.Count -eq 0) {
            $verification = 'restored (the previous CURRENT was empty)'
        } else {
            $restored = Test-EvidenceSet -Directory $script:CurrentDir
            if ($restored.Problems.Count -eq 0) {
                $verification = 'previous set restored and verified (Snapshot Commit ' + $restored.Commit + ')'
            } else {
                $verification = 'previous set restored but it does NOT validate (' + $restored.Problems.Count + ' problem(s))'
            }
        }
    } catch {
        $verification = 'previous set restored but its verification threw: ' + (Get-SafeErrorText $_.Exception.Message)
    }
    if ($DiscardDir) { [void](Remove-DirectoryQuietly $DiscardDir) }
    $script:CurrentStatus = $verification
    Stop-Blocked ($Reason + '; ' + $verification)
}

function Publish-Archive {
    param($CandidateValidation, [string]$Commit)
    $safeBranch = $ExpectedBranch -replace '[^A-Za-z0-9._-]', '-'
    $name = '{0}_{1}_{2}' -f [DateTime]::UtcNow.ToString('yyyy-MM-dd'), $safeBranch, $Commit.Substring(0, 12)
    $target = Join-Path $script:ArchiveDir $name
    if (-not (Test-Path -LiteralPath $script:ArchiveDir)) { [void](New-Item -ItemType Directory -Path $script:ArchiveDir) }

    if (Test-Path -LiteralPath $target) {
        # Verify-and-skip: an existing archive of the same commit with the same exported
        # blobs is a valid earlier generation (timestamps differ). Anything else is a conflict.
        $existing = Test-EvidenceSet -Directory $target -ExpectedCommit $Commit -ExpectedBranchName $ExpectedBranch
        if ($existing.Problems.Count -eq 0 -and $existing.Fingerprint -eq $CandidateValidation.Fingerprint) {
            Write-Step 'Archive' ('SKIPPED, valid archive of this commit exists (' + $target + ')')
            return $target
        }
        Stop-Blocked ('archive directory already exists with different content and is not overwritten; CURRENT remains valid: ' + $target)
    }

    $staging = Join-Path $script:ArchiveDir ('.staging-' + $script:RunId)
    try {
        [void](New-Item -ItemType Directory -Path $staging)
        foreach ($file in $script:FinalFiles) {
            [System.IO.File]::Copy((Join-Path $script:CurrentDir $file), (Join-Path $staging $file), $false)
        }
        $copied = Test-EvidenceSet -Directory $staging -ExpectedCommit $Commit -ExpectedBranchName $ExpectedBranch
        if ($copied.Problems.Count -gt 0 -or -not (Test-SameHashes $copied.Hashes $CandidateValidation.Hashes)) {
            Stop-Blocked 'archive copy does not match the validated CURRENT set; CURRENT remains valid'
        }
        Move-Directory -Source $staging -Destination $target -What 'publish archive'
    } catch {
        [void](Remove-DirectoryQuietly $staging)
        if ($_.Exception.Message -like 'BLOCKED:*') { throw }
        Stop-Blocked ('archive publication failed; CURRENT remains valid: ' + (Get-SafeErrorText $_.Exception.Message))
    }
    Write-Step 'Archive' ('PASS (' + $target + ')')
    return $target
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

$script:ExitCode = 1
try {
    Initialize-Context

    # Everything that inspects or changes the shared CURRENT and ARCHIVE state runs under the
    # exclusive output-root lock: predecessor inspection, candidate validation, publication,
    # post-publication validation, restoration, archiving and cleanup. Released in finally.
    Enter-OutputRootLock
    if ($TestOnlyHoldLockSeconds -gt 0) {
        Write-Host ('TEST HOOK: holding the output-root lock for ' + $TestOnlyHoldLockSeconds + ' s')
        Start-Sleep -Seconds $TestOnlyHoldLockSeconds
    }

    if ($ValidateOnly) {
        $validation = Test-EvidenceSet -Directory $script:CurrentDir
        Assert-ValidationPassed -Validation $validation -Label 'CURRENT validation'
        Write-Host 'RESULT: PASS'
        Write-Host ('Snapshot Commit: ' + $validation.Commit)
        Write-Host ('CURRENT: ' + $script:CurrentDir)
        $script:ExitCode = 0
    } else {
        $context = Get-SnapshotContext
        $sources = Get-Sources -Commit $context.Commit
        New-Candidate -Context $context -Sources $sources
        $candidateValidation = Test-EvidenceSet -Directory $script:StagingDir -ExpectedCommit $context.Commit -ExpectedBranchName $ExpectedBranch
        if ($candidateValidation.Problems.Count -gt 0) { [void](Remove-DirectoryQuietly $script:StagingDir) }
        Assert-ValidationPassed -Validation $candidateValidation -Label 'Candidate validation'
        Publish-Candidate -CandidateValidation $candidateValidation
        $archivePath = 'not requested'
        if ($Archive) { $archivePath = Publish-Archive -CandidateValidation $candidateValidation -Commit $context.Commit }

        Write-Host 'RESULT: PASS'
        Write-Host ('Evidence Status: ' + $script:StatusVerified)
        Write-Host ('Snapshot ID: ' + $context.SnapshotId)
        Write-Host ('Remote Evidence: ' + $context.RemoteEvidence)
        Write-Host ('CURRENT: ' + $script:CurrentDir)
        Write-Host ('Files: ' + ($script:FinalFiles -join ', '))
        Write-Host ('Archive: ' + $archivePath)
        Write-Host 'Note: only local consistency was verified; OneDrive cloud synchronization is outside this generator.'
        $script:ExitCode = 0
    }
} catch {
    $message = $_.Exception.Message
    if ($message -notlike 'BLOCKED:*') { $message = 'BLOCKED: unexpected error: ' + (Get-SafeErrorText $message) }
    Write-Host 'RESULT: BLOCKED'
    Write-Host ('CAUSE: ' + $message.Substring(9))
    if ($script:StagingDir -and (Test-Path -LiteralPath $script:StagingDir)) { [void](Remove-DirectoryQuietly $script:StagingDir) }
    if ($script:CurrentStatus) {
        Write-Host ('CURRENT: ' + $script:CurrentStatus)
    } elseif ($script:CurrentDir) {
        # The run failed before publication started, so CURRENT was never touched.
        if (Test-Path -LiteralPath $script:CurrentDir) {
            Write-Host ('CURRENT: untouched by this run (' + $script:CurrentDir + ')')
        } else {
            Write-Host 'CURRENT: not present'
        }
    }
    $script:ExitCode = 1
} finally {
    Exit-OutputRootLock
}

exit $script:ExitCode

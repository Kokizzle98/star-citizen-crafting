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

.PARAMETER TestOnlySimulatePublishFailure
Test hook. 'AfterPreviousMovedAside' fails the publication after the previous CURRENT was moved
aside, to exercise the restore path. It never weakens validation.

.EXAMPLE
.\scripts\export-project-lead-evidence.ps1 -OutputRoot "D:\Private\VECTOR\01_Project_Lead"
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

    [ValidateSet('None', 'AfterPreviousMovedAside')]
    [string]$TestOnlySimulatePublishFailure = 'None'
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
$script:FetchTimeoutMs = 90000
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

$script:RepoRoot = $null
$script:OutRoot = $null
$script:EvidenceDir = $null
$script:CurrentDir = $null
$script:ArchiveDir = $null
$script:StagingDir = $null
$script:RunId = $null

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
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return '(no detail)' }
    $line = ($Text -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 } | Select-Object -First 1)
    if ($null -eq $line) { return '(no detail)' }
    $line = $line -replace '://[^/@\s]+@', '://***@'
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

function Invoke-Git {
    param(
        [string[]]$Arguments,
        [int]$TimeoutMs = 0,
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
    $process.StandardInput.Close()
    $errorTask = $process.StandardError.ReadToEndAsync()
    $outputStream = New-Object System.IO.MemoryStream
    $outputTask = $process.StandardOutput.BaseStream.CopyToAsync($outputStream)

    $timedOut = $false
    if ($TimeoutMs -gt 0) {
        if (-not $process.WaitForExit($TimeoutMs)) {
            $timedOut = $true
            try { $process.Kill() } catch { }
            $process.WaitForExit()
        }
    } else {
        $process.WaitForExit()
    }
    [void]$outputTask.Wait()
    $errorText = $errorTask.Result
    $bytes = $outputStream.ToArray()
    $exitCode = $process.ExitCode
    $process.Dispose()
    if ($timedOut) { $exitCode = -1; $errorText = 'timeout after ' + $TimeoutMs + ' ms' }

    return [pscustomobject]@{
        ExitCode = $exitCode
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

function Get-NormalizedRemoteIdentity {
    param([string]$Url)
    $value = $Url.Trim()
    if ($value -match '^[A-Za-z]:[\\/]' -or $value -match '^\\\\' -or $value -match '^file:') {
        return 'local-path:' + (Split-Path -Leaf ($value -replace '^file:/*', ''))
    }
    $value = $value -replace '^[A-Za-z][A-Za-z0-9+.-]*://', ''
    $value = $value -replace '^[^@/]+@', ''
    $value = $value -replace ':', '/'
    $value = $value -replace '\.git$', ''
    return $value.TrimEnd('/')
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

    $remoteEvidence = 'NOT_APPLICABLE (local baseline ref)'
    $repositoryIdentity = 'local checkout (no remote baseline)'
    if ($BaselineRef -match '^([^/]+)/(.+)$') {
        $remoteName = $Matches[1]
        $remoteBranch = $Matches[2]
        $remotes = @((Get-GitText -Arguments @('remote') -What 'remote') -split "`r?`n" | Where-Object { $_.Length -gt 0 })
        if ($remotes -contains $remoteName) {
            $remoteUrl = Get-GitText -Arguments @('remote', 'get-url', $remoteName) -What 'remote get-url'
            $repositoryIdentity = Get-NormalizedRemoteIdentity $remoteUrl
            $fetch = Invoke-Git -Arguments @('fetch', '--quiet', $remoteName, $remoteBranch) -TimeoutMs $script:FetchTimeoutMs
            if ($fetch.ExitCode -eq 0) {
                $remoteEvidence = 'FRESHLY_FETCHED'
            } else {
                $remoteEvidence = 'LOCALLY_CACHED (fetch failed: ' + (Get-SafeErrorText $fetch.Error) + ')'
            }
        } else {
            $remoteEvidence = ("NOT_APPLICABLE (no remote named '{0}')" -f $remoteName)
        }
    }
    Write-Step 'Remote evidence' $remoteEvidence

    $baselineResult = Invoke-Git -Arguments @('rev-parse', '--verify', '--quiet', ($BaselineRef + '^{commit}'))
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
    param([string]$Head)
    $result = [pscustomobject]@{ Commit = $null; Status = 'NOT_AVAILABLE (no previous valid CURRENT evidence)'; Files = @(); Truncated = $false }
    $previousEvidence = Join-Path $script:CurrentDir 'VECTOR_EVIDENCE.md'
    if (-not (Test-Path -LiteralPath $previousEvidence -PathType Leaf)) { return $result }
    try {
        $text = Read-Utf8File $previousEvidence
    } catch {
        $result.Status = 'NOT_AVAILABLE (previous VECTOR_EVIDENCE.md unreadable)'
        return $result
    }
    $status = Get-FieldValue -Text $text -Label 'Evidence Status'
    $commit = Get-FieldValue -Text $text -Label 'Snapshot Commit'
    if ($status -ne $script:StatusVerified -or -not (Test-FullSha $commit)) {
        $result.Status = 'NOT_AVAILABLE (previous CURRENT evidence is not a verified snapshot)'
        return $result
    }
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
    $text = $script:Utf8NoBom.GetString($content.Bytes)
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }
    $secret = Test-SecretPatterns -Text $text -Label $RelativePath
    if ($secret) { Stop-Blocked $secret }
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
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append("# VECTOR Governance Context`n`n")
    [void]$sb.Append("Format Version: $($script:FormatVersion)`n")
    [void]$sb.Append("Evidence Kind: GOVERNANCE_CONTEXT`n")
    [void]$sb.Append("Snapshot ID: $($Context.SnapshotId)`n")
    [void]$sb.Append("Snapshot Commit: $($Context.Commit)`n")
    [void]$sb.Append("Generated (UTC): $($Context.GeneratedUtc)`n")
    [void]$sb.Append("Source Count: $($Governance.Count)`n")
    [void]$sb.Append("Generator: $($script:GeneratorPath)`n`n")
    [void]$sb.Append("This file embeds allowlisted repository governance documents verbatim from the Snapshot Commit.`n")
    [void]$sb.Append("It is commit-bound evidence generated from a local Git checkout. It is NOT live GitHub access.`n")
    [void]$sb.Append("OneDrive cloud synchronization happens outside the generator.`n")
    [void]$sb.Append("Every source section names its repository path and Snapshot Commit. All sections must name the same commit as VECTOR_EVIDENCE.md; otherwise the snapshot is invalid.`n")
    $index = 0
    foreach ($source in $Governance) {
        $index++
        [void]$sb.Append("`n## Source $index of $($Governance.Count): $($source.Path)`n`n")
        [void]$sb.Append("Repository Path: $($source.Path)`n")
        [void]$sb.Append("Snapshot Commit: $($Context.Commit)`n")
        [void]$sb.Append("Git Blob: $($source.Blob)`n")
        [void]$sb.Append("SHA256: $($source.Sha256)`n")
        [void]$sb.Append("Bytes: $($source.Bytes.Length)`n`n")
        [void]$sb.Append(($script:BeginMarker -f $source.Path) + "`n")
        [void]$sb.Append($source.Text)
        if (-not $source.Text.EndsWith("`n")) { [void]$sb.Append("`n") }
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

function Get-GovernanceHeaders {
    param([string]$Text)
    $problems = @()
    $commits = @()
    $paths = @()
    $blobs = @()
    $openPath = $null
    $lines = $Text -split "`r?`n"
    foreach ($line in $lines) {
        if ($line -match '^----- BEGIN CONTENT (.+) -----$') {
            if ($null -ne $openPath) { $problems += "GOVERNANCE_CONTEXT.md: nested BEGIN CONTENT for '$($Matches[1])'" }
            $openPath = $Matches[1]
            continue
        }
        if ($line -match '^----- END CONTENT (.+) -----$') {
            if ($openPath -ne $Matches[1]) { $problems += "GOVERNANCE_CONTEXT.md: END CONTENT for '$($Matches[1])' does not match the open section" }
            $openPath = $null
            continue
        }
        if ($null -ne $openPath) { continue }
        if ($line -match '^Snapshot Commit:[ \t]*(.*)$') { $commits += $Matches[1].Trim() }
        if ($line -match '^Repository Path:[ \t]*(.*)$') { $paths += $Matches[1].Trim() }
        if ($line -match '^Git Blob:[ \t]*(.*)$') { $blobs += $Matches[1].Trim() }
    }
    if ($null -ne $openPath) { $problems += "GOVERNANCE_CONTEXT.md: section '$openPath' is not closed" }
    return [pscustomobject]@{ Problems = $problems; Commits = $commits; Paths = $paths; Blobs = $blobs }
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
        return [pscustomobject]@{ Problems = @('evidence directory does not exist: ' + $Directory); Commit = $null; Hashes = $hashes; Fingerprint = $null }
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
    if ($problems.Count -gt 0) { return [pscustomobject]@{ Problems = $problems; Commit = $null; Hashes = $hashes; Fingerprint = $null } }

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

    $status = Get-FieldValue -Text $evidenceText -Label 'Evidence Status'
    if ($status -ne $script:StatusVerified) { $problems += ("VECTOR_EVIDENCE.md: Evidence Status is '{0}', expected {1}" -f $status, $script:StatusVerified) }

    $evidenceCommits = @(Get-FieldValues -Text $evidenceText -Label 'Snapshot Commit')
    if ($evidenceCommits.Count -eq 0) { $problems += 'VECTOR_EVIDENCE.md: no Snapshot Commit' }
    $commit = $ExpectedCommit
    if ([string]::IsNullOrEmpty($commit) -and $evidenceCommits.Count -gt 0) { $commit = $evidenceCommits[0] }
    if (-not (Test-FullSha $commit)) { $problems += ("Snapshot Commit is not a full 40-character SHA: '{0}'" -f $commit) }
    foreach ($value in $evidenceCommits) {
        if ($value -ne $commit) { $problems += ("VECTOR_EVIDENCE.md: Snapshot Commit mismatch: '{0}' differs from Snapshot Commit {1}" -f $value, $commit) }
    }

    $branch = $ExpectedBranchName
    if ([string]::IsNullOrEmpty($branch)) { $branch = Get-FieldValue -Text $evidenceText -Label 'Branch' }
    $snapshotId = Get-FieldValue -Text $evidenceText -Label 'Snapshot ID'
    if ($snapshotId -ne ($branch + ':' + $commit)) { $problems += ("VECTOR_EVIDENCE.md: Snapshot ID '{0}' does not equal '{1}:{2}'" -f $snapshotId, $branch, $commit) }
    $localHead = Get-FieldValue -Text $evidenceText -Label 'Local HEAD'
    if ($localHead -ne $commit) { $problems += 'VECTOR_EVIDENCE.md: Local HEAD differs from Snapshot Commit' }
    $baselineHead = Get-FieldValue -Text $evidenceText -Label 'Baseline Ref HEAD'
    if ($baselineHead -ne $commit) { $problems += 'VECTOR_EVIDENCE.md: Baseline Ref HEAD differs from Snapshot Commit' }

    $declaredProjectStateSha = Get-FieldValue -Text $evidenceText -Label 'Exported PROJECT_STATE SHA256'
    if ($declaredProjectStateSha -ne $hashes['PROJECT_STATE.md']) { $problems += 'PROJECT_STATE.md: SHA256 differs from the value declared in VECTOR_EVIDENCE.md' }
    $declaredGovernanceSha = Get-FieldValue -Text $evidenceText -Label 'Exported GOVERNANCE_CONTEXT SHA256'
    if ($declaredGovernanceSha -ne $hashes['GOVERNANCE_CONTEXT.md']) { $problems += 'GOVERNANCE_CONTEXT.md: SHA256 differs from the value declared in VECTOR_EVIDENCE.md' }
    $sourcePath = Get-FieldValue -Text $evidenceText -Label 'Source Path'
    if ($sourcePath -ne $script:ProjectStateSource) { $problems += ("VECTOR_EVIDENCE.md: PROJECT_STATE Source Path is '{0}', expected {1}" -f $sourcePath, $script:ProjectStateSource) }

    $declaredBlob = Get-FieldValue -Text $evidenceText -Label 'Exported PROJECT_STATE Git Blob'
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

    $headers = Get-GovernanceHeaders -Text $governanceText
    $problems += $headers.Problems
    if ($headers.Commits.Count -eq 0) { $problems += 'GOVERNANCE_CONTEXT.md: no Snapshot Commit' }
    foreach ($value in $headers.Commits) {
        if ($value -ne $commit) { $problems += ("GOVERNANCE_CONTEXT.md: Snapshot Commit mismatch: '{0}' differs from Snapshot Commit {1}" -f $value, $commit) }
    }
    $expectedSections = $script:GovernanceSources.Count
    if ($headers.Commits.Count -ne ($expectedSections + 1)) {
        $problems += ("GOVERNANCE_CONTEXT.md: expected {0} Snapshot Commit statements (header plus {1} sources), found {2}" -f ($expectedSections + 1), $expectedSections, $headers.Commits.Count)
    }
    $declaredCount = Get-FieldValue -Text $governanceText -Label 'Source Count'
    if ([string]$declaredCount -ne [string]$expectedSections) { $problems += ("GOVERNANCE_CONTEXT.md: Source Count is '{0}', expected {1}" -f $declaredCount, $expectedSections) }
    foreach ($path in $headers.Paths) {
        if ($script:GovernanceSources -notcontains $path) { $problems += ("GOVERNANCE_CONTEXT.md: source '{0}' is not on the allowlist" -f $path) }
    }
    foreach ($path in $script:GovernanceSources) {
        if ($headers.Paths -notcontains $path) { $problems += ("GOVERNANCE_CONTEXT.md: allowlisted source '{0}' is missing" -f $path) }
    }
    $governanceSnapshotId = Get-FieldValue -Text $governanceText -Label 'Snapshot ID'
    if ($governanceSnapshotId -ne $snapshotId) { $problems += 'GOVERNANCE_CONTEXT.md: Snapshot ID differs from VECTOR_EVIDENCE.md' }

    foreach ($pair in @(@('VECTOR_EVIDENCE.md', $evidenceText), @('PROJECT_STATE.md', $projectStateText), @('GOVERNANCE_CONTEXT.md', $governanceText))) {
        $secret = Test-SecretPatterns -Text $pair[1] -Label $pair[0]
        if ($secret) { $problems += $secret }
    }

    # Commit-bound identity of the snapshot: the commit plus every exported blob.
    # Two generations of the same commit share it even though their timestamps differ.
    $fingerprint = $commit + '|' + $declaredBlob + '|' + ($headers.Blobs -join ',')

    return [pscustomobject]@{ Problems = @($problems); Commit = $commit; Hashes = $hashes; Fingerprint = $fingerprint }
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
            Stop-Blocked ('could not move the existing CURRENT aside (it is left untouched): ' + (Get-SafeErrorText $_.Exception.Message))
        }
    }

    try {
        if ($TestOnlySimulatePublishFailure -eq 'AfterPreviousMovedAside') {
            throw (New-Object System.IO.IOException 'simulated publication failure (test hook)')
        }
        Move-Directory -Source $script:StagingDir -Destination $script:CurrentDir -What 'publish candidate'
    } catch {
        $publishError = Get-SafeErrorText $_.Exception.Message
        [void](Remove-DirectoryQuietly $script:StagingDir)
        if ($null -eq $previousDir) { Stop-Blocked ('publication failed, no previous CURRENT existed: ' + $publishError) }
        if (Test-Path -LiteralPath $script:CurrentDir) {
            Stop-Blocked ('publication failed and an unexpected CURRENT exists; previous evidence preserved at ' + $previousDir + ': ' + $publishError)
        }
        try {
            Move-Directory -Source $previousDir -Destination $script:CurrentDir -What 'restore previous CURRENT'
        } catch {
            Stop-Blocked ('publication failed and the previous CURRENT could not be restored; recovery material at ' + $previousDir + ': ' + $publishError)
        }
        Stop-Blocked ('publication failed; previous CURRENT restored: ' + $publishError)
    }

    $published = Test-EvidenceSet -Directory $script:CurrentDir -ExpectedCommit $CandidateValidation.Commit -ExpectedBranchName $ExpectedBranch
    $consistent = ($published.Problems.Count -eq 0) -and (Test-SameHashes $published.Hashes $CandidateValidation.Hashes)
    if (-not $consistent) {
        foreach ($problem in $published.Problems) { Write-Host ('CAUSE: ' + $problem) }
        $failedDir = Join-Path $script:EvidenceDir ('.failed-' + $script:RunId)
        try { Move-Directory -Source $script:CurrentDir -Destination $failedDir -What 'move failed publication aside' } catch { }
        if ($null -ne $previousDir -and -not (Test-Path -LiteralPath $script:CurrentDir)) {
            try { Move-Directory -Source $previousDir -Destination $script:CurrentDir -What 'restore previous CURRENT' } catch { }
        }
        Stop-Blocked ('published CURRENT failed post-publication validation; failed output kept at ' + $failedDir)
    }
    Write-Step 'Published CURRENT' 'PASS'

    if ($null -ne $previousDir) { [void](Remove-DirectoryQuietly $previousDir) }
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
    if ($script:CurrentDir) {
        if (Test-Path -LiteralPath $script:CurrentDir) {
            Write-Host ('CURRENT: preserved (' + $script:CurrentDir + ')')
        } else {
            Write-Host 'CURRENT: not present'
        }
    }
    $script:ExitCode = 1
}

exit $script:ExitCode

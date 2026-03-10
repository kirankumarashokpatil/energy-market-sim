<#
.SYNOPSIS
  Run E2E tests for GridForge.
  Starts Vite dev server + Gun relay, runs the E2E test, then cleans up.

.PARAMETER Test
  Which test to run: "multiplayer" or "comprehensive" (default: "comprehensive")

.PARAMETER Watch
  Set to show browser windows (non-headless mode). Default: headless.

.EXAMPLE
  .\run_e2e.ps1                          # comprehensive test, headless
  .\run_e2e.ps1 -Test multiplayer        # multiplayer test, headless
  .\run_e2e.ps1 -Watch                   # comprehensive test, visible browsers
  .\run_e2e.ps1 -Test multiplayer -Watch # multiplayer, visible
#>

param(
    [ValidateSet("comprehensive", "multiplayer")]
    [string]$Test = "comprehensive",
    [switch]$Watch
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

$headlessValue = if ($Watch) { "false" } else { "true" }

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  GridForge E2E Test Runner" -ForegroundColor Cyan
Write-Host "  Test: $Test  |  Headless: $headlessValue" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# ── Track background jobs ─────────────────────────────────────────────────────
$script:bgJobs = @()

function Cleanup {
    Write-Host ""
    Write-Host "[Cleanup] Shutting down background processes..." -ForegroundColor Yellow

    foreach ($job in $script:bgJobs) {
        if ($job -and (Get-Job -Id $job.Id -ErrorAction SilentlyContinue)) {
            Stop-Job -Id $job.Id -ErrorAction SilentlyContinue
            Remove-Job -Id $job.Id -Force -ErrorAction SilentlyContinue
            Write-Host "[Cleanup] Stopped job: $($job.Name)"
        }
    }

    # Kill any node processes on our ports
    try {
        $portProcs = Get-NetTCPConnection -LocalPort 5173, 8765 -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($procId in $portProcs) {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -eq "node") {
                Write-Host "[Cleanup] Killing node process on port (PID $procId)..."
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
        }
    }
    catch {}

    Write-Host "[Cleanup] Done." -ForegroundColor Green
}

try {
    # ── 1. Check port availability ────────────────────────────────────────────
    Write-Host "[1/4] Checking port availability..." -ForegroundColor White

    $port5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
    $port8765 = Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue

    $viteAlreadyRunning = [bool]$port5173
    $relayAlreadyRunning = [bool]$port8765

    if ($viteAlreadyRunning) {
        Write-Host "  Port 5173 in use — assuming Vite is already running." -ForegroundColor Yellow
    }
    if ($relayAlreadyRunning) {
        Write-Host "  Port 8765 in use — assuming Gun relay is already running." -ForegroundColor Yellow
    }

    # ── 2. Start Gun relay ────────────────────────────────────────────────────
    if (-not $relayAlreadyRunning) {
        Write-Host "[2/4] Starting Gun relay server..." -ForegroundColor White
        $relayJob = Start-Job -Name "GunRelay" -ScriptBlock {
            param($dir)
            Set-Location $dir
            & node gun-relay.cjs 2>&1
        } -ArgumentList $ProjectRoot
        $script:bgJobs += $relayJob

        # Wait for relay to bind
        $relayReady = $false
        for ($i = 0; $i -lt 20; $i++) {
            Start-Sleep -Milliseconds 500
            if (Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue) {
                $relayReady = $true
                break
            }
        }
        if ($relayReady) {
            Write-Host "  Gun relay started on port 8765" -ForegroundColor Green
        }
        else {
            $relayOutput = Receive-Job $relayJob -ErrorAction SilentlyContinue
            Write-Host "  Relay output: $relayOutput" -ForegroundColor Red
            throw "Gun relay failed to start within 10 seconds."
        }
    }
    else {
        Write-Host "[2/4] Gun relay already running, skipping." -ForegroundColor DarkGray
    }

    # ── 3. Start Vite dev server ──────────────────────────────────────────────
    if (-not $viteAlreadyRunning) {
        Write-Host "[3/4] Starting Vite dev server..." -ForegroundColor White
        $viteJob = Start-Job -Name "ViteDev" -ScriptBlock {
            param($dir)
            Set-Location $dir
            & npx vite --port 5173 2>&1
        } -ArgumentList $ProjectRoot
        $script:bgJobs += $viteJob

        # Wait for Vite to accept connections
        $viteReady = $false
        for ($i = 0; $i -lt 40; $i++) {
            Start-Sleep -Milliseconds 1000
            try {
                $null = Invoke-WebRequest -Uri "http://localhost:5173" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
                $viteReady = $true
                break
            }
            catch {}
        }
        if ($viteReady) {
            Write-Host "  Vite dev server started on port 5173" -ForegroundColor Green
        }
        else {
            $viteOutput = Receive-Job $viteJob -ErrorAction SilentlyContinue
            Write-Host "  Vite output: $viteOutput" -ForegroundColor Red
            throw "Vite dev server failed to start within 40 seconds."
        }
    }
    else {
        Write-Host "[3/4] Vite dev server already running, skipping." -ForegroundColor DarkGray
    }

    # ── 4. Run the E2E test ───────────────────────────────────────────────────
    Write-Host "[4/4] Running E2E test: $Test..." -ForegroundColor White
    Write-Host ""

    # Set environment
    $env:GRIDFORGE_URL = "http://localhost:5173"
    $env:HEADLESS = $headlessValue

    # Select test file
    if ($Test -eq "multiplayer") {
        $testFile = Join-Path $ProjectRoot "test\e2e\full-multiplayer.test.cjs"
    }
    else {
        $testFile = Join-Path $ProjectRoot "test\e2e\gridforge-comprehensive.test.cjs"
    }

    # Run with node — using & operator to stream output live
    & node $testFile
    $exitCode = $LASTEXITCODE

    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "=================================================" -ForegroundColor Green
        Write-Host "  E2E TEST PASSED" -ForegroundColor Green
        Write-Host "=================================================" -ForegroundColor Green
    }
    else {
        Write-Host "=================================================" -ForegroundColor Red
        Write-Host "  E2E TEST FAILED (exit code $exitCode)" -ForegroundColor Red
        Write-Host "=================================================" -ForegroundColor Red
    }
}
catch {
    Write-Host ""
    Write-Host "ERROR: $_" -ForegroundColor Red
}
finally {
    Cleanup
}

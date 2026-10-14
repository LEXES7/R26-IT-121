# Wake the deployed stack before a demo.
#
# Every app runs at min-replicas 0, which costs nothing while nobody is using
# it and means the first request after an idle spell waits for a container to
# start. GraphSAGE is the slow one: it reads a 516 MB serving bundle off the
# Azure Files share before it can answer. Run this a few minutes ahead and the
# first click in the console is as fast as the tenth.
#
#   powershell -ExecutionPolicy Bypass -File scripts\warm-deployment.ps1
#
# The temporal detector is woken differently. Its window holds the last 32
# transactions and it answers 503 until it has them, so warming it means
# sending traffic through the pipeline rather than pinging a health endpoint —
# hence the repeated /analyze calls below.

$ErrorActionPreference = "Continue"

$web = "https://web.bravedune-c12a41a0.southeastasia.azurecontainerapps.io"
$api = "https://fusion-api.bravedune-c12a41a0.southeastasia.azurecontainerapps.io"

function Hit([string]$label, [string]$url, [int]$timeout = 180) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $timeout
        "{0,-26} {1}  {2:N1}s" -f $label, $r.StatusCode, $sw.Elapsed.TotalSeconds
    } catch {
        "{0,-26} FAILED  {1:N1}s  {2}" -f $label, $sw.Elapsed.TotalSeconds, $_.Exception.Message
    }
}

Write-Host "=== waking the front door ==="
Hit "web"                "$web/"
Hit "fusion-api /health" "$api/health"

Write-Host "`n=== waking the detectors through the pipeline ==="
# The detectors have internal ingress, so they cannot be reached from here
# directly. /analyze calls all three, which starts all three.
$sample = $null
try { $sample = Invoke-RestMethod -Uri "$api/analyze/sample-transaction" -TimeoutSec 180 } catch {}

if (-not $sample) {
    Write-Host "could not fetch a sample transaction - is the backend up?"
    exit 1
}

$body = $sample | ConvertTo-Json -Depth 10
for ($i = 1; $i -le 35; $i++) {
    try {
        $r = Invoke-RestMethod -Uri "$api/analyze" -Method Post -Body $body `
             -ContentType "application/json" -TimeoutSec 240
        $used = $r.modalities_used
        if ($i % 5 -eq 0 -or $used -eq 3) {
            "  call {0,-3} modalities={1}  graph={2} behav={3} temporal={4}" -f `
                $i, $used, $r.graph_available, $r.behavioral_available, $r.temporal_available
        }
        if ($used -eq 3) { Write-Host "`nall three detectors live after $i calls"; break }
    } catch {
        "  call {0,-3} failed: {1}" -f $i, $_.Exception.Message
    }
}

Write-Host "`nReady. Open $web"
Write-Host "Start the live monitor only while you are demonstrating - it polls"
Write-Host "the database continuously and that is what spends the Neon free tier."

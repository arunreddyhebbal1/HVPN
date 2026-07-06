$root = "C:\Users\arunr\Projects\substation-analytics-dashboard"
$errLog = Join-Path $root "data\consolidation_run_optimized.err.log"
$outLog = Join-Path $root "data\consolidation_run_optimized.log"
$status = Join-Path $root "data\consolidation_monitor_agent.txt"
$start = Get-Date
function Get-ConsolidationProcs {
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match 'consolidate_by_substation' }
}
function Get-TreeCount {
  $procs = Get-ConsolidationProcs
  $roots = $procs | Where-Object { $_.ParentProcessId -eq 0 -or -not ($procs.ProcessId -contains $_.ParentProcessId) }
  if ($roots.Count -eq 0 -and $procs.Count -gt 0) { return 1 }
  return @($roots).Count
}
$lastLogWrite = (Get-Item $errLog -ErrorAction SilentlyContinue).LastWriteTime
while ($true) {
  $now = Get-Date
  $procs = Get-ConsolidationProcs
  $treeCount = Get-TreeCount
  $errTail = if (Test-Path $errLog) { Get-Content $errLog -Tail 3 } else { @() }
  $outTail = if (Test-Path $outLog) { Get-Content $outLog -Tail 15 } else { @() }
  $complete = ($outTail -join "`n") -match 'Run complete:'
  $alive = $procs.Count -gt 0
  $logWrite = (Get-Item $errLog -ErrorAction SilentlyContinue).LastWriteTime
  $stallMin = if ($logWrite) { ($now - $logWrite).TotalMinutes } else { 9999 }
  $line = "[{0}] trees={1} procs={2} stall_min={3:n1} alive={4}" -f $now.ToString('yyyy-MM-dd HH:mm:ss'), $treeCount, $procs.Count, $stallMin, $alive
  $line | Add-Content $status
  $errTail | ForEach-Object { "  $_" } | Add-Content $status
  if ($treeCount -gt 1) {
    "FAILED: duplicate process trees detected ($treeCount)" | Add-Content $status
    break
  }
  if ($complete -or ((-not $alive) -and (Test-Path $outLog))) {
    $outAll = Get-Content $outLog -Raw -ErrorAction SilentlyContinue
    if ($outAll -match 'Run complete:') {
      "COMPLETED: process exit/alive=$alive complete_in_log=true runtime=$([math]::Round(($now-$start).TotalHours,2))h" | Add-Content $status
      Get-Content $outLog -Tail 30 | Add-Content $status
      break
    }
    if (-not $alive) {
      $exitCode = $null
      "FAILED: process exited without Run complete in stdout log" | Add-Content $status
      Get-Content $outLog -Tail 30 -ErrorAction SilentlyContinue | Add-Content $status
      break
    }
  }
  if ($alive -and $stallMin -ge 120) {
    "FAILED: stalled ${stallMin}m with process alive" | Add-Content $status
    break
  }
  Start-Sleep -Seconds 300
}

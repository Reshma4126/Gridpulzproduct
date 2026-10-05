$files = @("frontend/dashboard.html","frontend/operator-dashboard.html","frontend/scheduler.html","frontend/user-dashboard.html","frontend/charge-now.html")
$currentIds = New-Object System.Collections.Generic.List[string]
foreach($f in $files){
    $currentIds.Add("--- $f ---")
    if (Test-Path $f) {
        $content = Get-Content $f -Raw
        $found = [regex]::Matches($content,'id="([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
        foreach($id in $found) { $currentIds.Add($id) }
    }
}
$baselineIds = Get-Content baseline_ids.txt
$diffIds = Compare-Object -ReferenceObject $baselineIds -DifferenceObject $currentIds
$removedIds = $diffIds | Where-Object { $_.SideIndicator -eq '<=' } | Select-Object -ExpandProperty InputObject

Write-Host "--- REMOVED IDS ---"
if ($removedIds) { $removedIds } else { Write-Host "None" }

$currentHashes = New-Object System.Collections.Generic.List[string]
if (Test-Path "frontend/js") {
    Get-ChildItem -Path frontend/js -Filter *.js | ForEach-Object {
        $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
        $currentHashes.Add("$($_.Name):$hash")
    }
}
$baselineHashes = Get-Content baseline_js_hashes.txt
$hashDiff = Compare-Object -ReferenceObject $baselineHashes -DifferenceObject $currentHashes

Write-Host "`n--- JS HASH COMPARISON ---"
if ($hashDiff) { 
    $hashDiff | ForEach-Object { 
        if ($_.SideIndicator -eq '<=') { "REMOVED/CHANGED: $($_.InputObject)" }
        else { "ADDED/NEW: $($_.InputObject)" }
    }
} else { Write-Host "All hashes match." }

Write-Host "`n--- SUMMARY ---"
if (-not $removedIds -and -not $hashDiff) { Write-Host "PASS" } else { Write-Host "FAIL" }

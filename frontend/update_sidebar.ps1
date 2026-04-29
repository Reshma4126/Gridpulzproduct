$newSidebar = $(@'
<aside class="gp-sidebar" id="main-sidebar">
    <div class="gp-sidebar__logo-zone">
        <div class="gp-sidebar__logo-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M13 2L4 14h7l-1 8 9-10h-7l1-10z"/>
            </svg>
        </div>
        <div class="gp-sidebar__brand">GridPulz</div>
    </div>
    <nav class="gp-sidebar__nav">
        <a href="user-dashboard.html" class="gp-sidebar__nav-item" data-page="dashboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            <span>Dashboard</span>
        </a>
        <a href="charge-now.html" class="gp-sidebar__nav-item" data-page="charge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2L4 14h7l-1 8 9-10h-7l1-10z"/></svg>
            <span>Charge Now</span>
        </a>
        <a href="prebook.html" class="gp-sidebar__nav-item" data-page="prebook">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>
            <span>Prebook</span>
        </a>
        <a href="station-map.html" class="gp-sidebar__nav-item" data-page="map">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>Station Map</span>
        </a>
        <a href="my-bookings.html" class="gp-sidebar__nav-item" data-page="bookings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <span>My Bookings</span>
        </a>
        <a href="settings.html" class="gp-sidebar__nav-item" data-page="settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m5.08 5.08l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m5.08-5.08l4.24-4.24"/></svg>
            <span>Settings</span>
        </a>
    </nav>
    <button class="gp-sidebar__logout" id="logout-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14l5-5-5-5m5 5H9"/></svg>
        <span>Logout</span>
    </button>
</aside>
'@)

$files = "charge-now.html", "prebook.html", "settings.html", "my-bookings.html", "station-map.html"

foreach ($f in $files) {
    if (Test-Path $f) {
        $lines = Get-Content $f
        $startIndex = -1
        $endIndex = -1
        
        for ($i = 0; $i -lt $lines.Length; $i++) {
            if ($lines[$i] -match '<aside\s+(class="[^"]*")?\s*id="(sidebar|main-sidebar)"') {
                $startIndex = $i
            }
            if ($startIndex -ne -1 -and $lines[$i] -match '</aside>') {
                $endIndex = $i
                break
            }
        }
        
        if ($startIndex -ne -1 -and $endIndex -ne -1) {
            # Replace the range
            $newLines = $lines[0..($startIndex-1)]
            $newLines += $newSidebar
            
            # Find the main content tag after <!-- MAIN CONTENT -->
            $foundMainContent = $false
            for ($i = $endIndex + 1; $i -lt $lines.Length; $i++) {
                if ($lines[$i] -match '<!--\s*============\s*MAIN CONTENT\s*============\s*-->' -or $lines[$i] -match '<!--\s*MAIN CONTENT\s*-->') {
                    $foundMainContent = $true
                } elseif ($foundMainContent -and $lines[$i] -match '<(main|div)') {
                    if ($lines[$i] -notmatch 'style="margin-left: 68px;"') {
                        $lines[$i] = $lines[$i] -replace '(<(main|div)[^>]*)', '$1 style="margin-left: 68px;"'
                    }
                    break
                }
            }
            
            $newLines += $lines[($endIndex+1)..($lines.Length-1)]
            $newLines | Set-Content $f -Encoding UTF8
            "Updated $f"
        } else {
            "Could not find sidebar in $f"
        }
    } else {
        "File not found: $f"
    }
}

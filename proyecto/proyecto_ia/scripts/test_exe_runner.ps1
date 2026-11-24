$proc = Start-Process -FilePath "c:\Users\omar\Desktop\proyecto_ia\GeoPhotoAI.exe" -PassThru
Start-Sleep -Seconds 2

$found = $false
for ($port = 8080; $port -le 8085; $port++) {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$port/index.html" -UseBasicParsing -TimeoutSec 3
        if ($resp.StatusCode -eq 200 -and $resp.Content -match "GeoPhoto AI") {
            Write-Host "SUCCESS: GeoPhotoAI.exe is serving index.html on port $port with HTTP 200!"
            $found = $true
            break
        }
    } catch {
        # continue checking
    }
}

if (-not $found) {
    Write-Host "FAILED: Could not reach GeoPhotoAI.exe on ports 8080-8085"
}

# Clean up test process
if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

# Also cleanup any leftover msedge test instances with our specific profile
Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*GeoPhotoAI_AppProfile*" } | Stop-Process -Force -ErrorAction SilentlyContinue

$ErrorActionPreference = "Stop"

$rootDir = (Get-Item $PSScriptRoot).Parent.FullName
$portableDir = Join-Path $rootDir "GeoPhotoAI_Portable"
$zipPath = Join-Path $rootDir "GeoPhotoAI_Portable.zip"

Write-Host "Creating portable package in: $portableDir"

# Remove existing portable dir and zip if present
if (Test-Path $portableDir) {
    Remove-Item -Path $portableDir -Recurse -Force
}
if (Test-Path $zipPath) {
    Remove-Item -Path $zipPath -Force
}

# Create folder structure
New-Item -ItemType Directory -Path $portableDir | Out-Null

# Copy main files
Copy-Item (Join-Path $rootDir "GeoPhotoAI.exe") -Destination $portableDir
Copy-Item (Join-Path $rootDir "Iniciar_GeoPhotoAI.bat") -Destination $portableDir
Copy-Item (Join-Path $rootDir "LEEME_INSTRUCCIONES.txt") -Destination $portableDir
if (Test-Path (Join-Path $rootDir "app.ico")) {
    Copy-Item (Join-Path $rootDir "app.ico") -Destination $portableDir
}

# Copy app directory
Copy-Item (Join-Path $rootDir "app") -Destination (Join-Path $portableDir "app") -Recurse

# Copy plantillas_ejemplo directory
if (Test-Path (Join-Path $rootDir "plantillas_ejemplo")) {
    Copy-Item (Join-Path $rootDir "plantillas_ejemplo") -Destination (Join-Path $portableDir "plantillas_ejemplo") -Recurse
}

Write-Host "Creating ZIP archive: $zipPath"
Compress-Archive -Path "$portableDir\*" -DestinationPath $zipPath -Force

$zipItem = Get-Item $zipPath
$zipSizeMb = [Math]::Round($zipItem.Length / 1MB, 2)
Write-Host "Portable ZIP created successfully: $zipPath ($zipSizeMb MB)"

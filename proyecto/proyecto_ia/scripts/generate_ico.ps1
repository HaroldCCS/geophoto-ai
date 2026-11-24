Add-Type -AssemblyName System.Drawing
$rootDir = (Get-Item $PSScriptRoot).Parent.FullName
$imgPath = Join-Path $rootDir "app\icons\icon-192.png"
$icoPath = Join-Path $rootDir "app.ico"

if (Test-Path $imgPath) {
    $bmp = [System.Drawing.Bitmap]::FromFile($imgPath)
    $hIcon = $bmp.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($hIcon)
    $fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
    $icon.Save($fs)
    $fs.Close()
    $icon.Dispose()
    $bmp.Dispose()
    Write-Host "app.ico created successfully at: $icoPath"
} else {
    Write-Host "Image not found: $imgPath"
}

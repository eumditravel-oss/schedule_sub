# f:\Schedule\scripts\crop_logo.ps1
Add-Type -AssemblyName System.Drawing

$srcPath = "f:\Schedule\public\logo3.png"
$destPath = "f:\Schedule\public\logo3-mobile-cropped.png"

$img = [System.Drawing.Bitmap]::FromFile($srcPath)
$width = $img.Width
$height = $img.Height

Write-Host "Original Image Dimensions: $width x $height"

$minX = $width
$maxX = 0
$minY = $height
$maxY = 0

for ($y = 0; $y -lt $height; $y++) {
    for ($x = 0; $x -lt $width; $x++) {
        $pixel = $img.GetPixel($x, $y)
        
        # Check if non-white and not fully transparent
        # White threshold: R > 245, G > 245, B > 245
        $isWhite = ($pixel.R -gt 242) -and ($pixel.G -gt 242) -and ($pixel.B -gt 242)
        $isTransparent = ($pixel.A -lt 10)

        if (-not $isWhite -and -not $isTransparent) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

Write-Host "Bounding Box: Left=$minX, Top=$minY, Right=$maxX, Bottom=$maxY"

# Add safety padding (6~10px)
$pad = 8
$cropX = [Math]::Max(0, $minX - $pad)
$cropY = [Math]::Max(0, $minY - $pad)
$cropW = [Math]::Min($width - $cropX, ($maxX - $minX + 1) + ($pad * 2))
$cropH = [Math]::Min($height - $cropY, ($maxY - $minY + 1) + ($pad * 2))

Write-Host "Cropping rect: X=$cropX, Y=$cropY, Width=$cropW, Height=$cropH"

$cropRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
$croppedBmp = New-Object System.Drawing.Bitmap($cropW, $cropH)
$graphics = [System.Drawing.Graphics]::FromImage($croppedBmp)
$graphics.Clear([System.Drawing.Color]::Transparent)

$graphics.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $cropW, $cropH)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)

$croppedBmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)

$croppedBmp.Dispose()
$graphics.Dispose()
$img.Dispose()

Write-Host "Cropped logo saved to $destPath"

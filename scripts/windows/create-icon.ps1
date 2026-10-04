<#
  Regenerate the Windows ICO from the existing branding PNG. Small sizes use
  32-bit bitmap frames (with transparency masks); the 256px frame retains the
  original PNG. No icon-conversion download is needed when packaging the app.
#>
[CmdletBinding()]
param(
  [string]$Source = (Join-Path $PSScriptRoot '../../desktop/assets/icon.png'),
  [string]$Destination = (Join-Path $PSScriptRoot '../../desktop/assets/icon.ico')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$image = [System.Drawing.Image]::FromFile([IO.Path]::GetFullPath($Source))
$frames = @()
try {
  if ($image.Width -ne 256 -or $image.Height -ne 256) {
    throw 'The branding PNG must be 256x256.'
  }
  foreach ($size in @(16, 24, 32, 48, 64, 128)) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $stream = [IO.MemoryStream]::new()
    $writer = [IO.BinaryWriter]::new($stream)
    try {
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($image, [System.Drawing.Rectangle]::new(0, 0, $size, $size))
      # BITMAPINFOHEADER: doubled height includes the color bitmap and AND mask.
      $writer.Write([uint32]40)
      $writer.Write([int32]$size)
      $writer.Write([int32]($size * 2))
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]0)
      $writer.Write([uint32]($size * $size * 4))
      $writer.Write([int32]0)
      $writer.Write([int32]0)
      $writer.Write([uint32]0)
      $writer.Write([uint32]0)
      $maskStride = [int]([Math]::Ceiling($size / 32.0) * 4)
      $mask = [byte[]]::new($maskStride * $size)
      for ($y = $size - 1; $y -ge 0; $y--) {
        for ($x = 0; $x -lt $size; $x++) {
          $pixel = $bitmap.GetPixel($x, $y)
          $writer.Write([byte]$pixel.B)
          $writer.Write([byte]$pixel.G)
          $writer.Write([byte]$pixel.R)
          $writer.Write([byte]$pixel.A)
          if ($pixel.A -eq 0) {
            $index = ($size - 1 - $y) * $maskStride + [int][Math]::Floor($x / 8.0)
            $mask[$index] = $mask[$index] -bor (1 -shl (7 - ($x % 8)))
          }
        }
      }
      $writer.Write($mask)
      $frames += [pscustomobject]@{ Size = $size; Bytes = $stream.ToArray() }
    } finally {
      $writer.Dispose()
      $stream.Dispose()
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
} finally { $image.Dispose() }
$frames += [pscustomobject]@{ Size = 256; Bytes = [IO.File]::ReadAllBytes([IO.Path]::GetFullPath($Source)) }

$output = [IO.MemoryStream]::new()
$writer = [IO.BinaryWriter]::new($output)
try {
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]$frames.Count)
  $offset = 6 + 16 * $frames.Count
  foreach ($frame in $frames) {
    $dimension = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
    $writer.Write([byte]$dimension)
    $writer.Write([byte]$dimension)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$frame.Bytes.Length)
    $writer.Write([uint32]$offset)
    $offset += $frame.Bytes.Length
  }
  foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
  [IO.File]::WriteAllBytes([IO.Path]::GetFullPath($Destination), $output.ToArray())
} finally {
  $writer.Dispose()
  $output.Dispose()
}

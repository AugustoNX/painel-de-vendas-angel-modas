<#
.SYNOPSIS
  Servidor estático local para abrir o painel no navegador.

.DESCRIPTION
  Os módulos ES do painel não carregam via file:// (bloqueio de CORS), então é
  preciso servir a pasta por HTTP. Este script usa apenas o .NET embutido no
  Windows, sem exigir Node ou Python.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools/serve.ps1 -Port 8080
#>

param([int]$Port = 8080)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Painel em http://localhost:$Port/  (Ctrl+C para parar)"

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
    if (-not $path) { $path = 'index.html' }

    $full = [IO.Path]::GetFullPath((Join-Path $root $path))
    # SPA: qualquer rota desconhecida cai no index, igual ao rewrite do Hosting.
    if (-not $full.StartsWith($root) -or -not (Test-Path $full -PathType Leaf)) {
      $full = Join-Path $root 'index.html'
    }

    $ext = [IO.Path]::GetExtension($full).ToLower()
    $bytes = [IO.File]::ReadAllBytes($full)
    $context.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
    $context.Response.Headers.Add('Cache-Control', 'no-store')
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.OutputStream.Close()

    Write-Output "$($context.Request.HttpMethod) /$path -> $([IO.Path]::GetFileName($full))"
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}

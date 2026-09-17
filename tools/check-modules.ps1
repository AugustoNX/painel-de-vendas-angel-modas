<#
.SYNOPSIS
  Verificação estática leve do front-end, sem depender de Node.

.DESCRIPTION
  Confere três coisas que quebram o painel em silêncio:
    1. caminhos de import que não existem;
    2. símbolos importados que o módulo de destino não exporta;
    3. data-action usado nos templates sem handler registrado.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools/check-modules.ps1
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$jsDir = Join-Path $root 'js'

$files = Get-ChildItem -Path $jsDir -Recurse -Filter *.js
$sources = @{}
foreach ($file in $files) { $sources[$file.FullName] = Get-Content $file.FullName -Raw }

function Get-Exports([string]$source) {
  $names = [System.Collections.Generic.HashSet[string]]::new()
  foreach ($m in [regex]::Matches($source, 'export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)')) {
    [void]$names.Add($m.Groups[1].Value)
  }
  foreach ($m in [regex]::Matches($source, 'export\s*\{([^}]*)\}')) {
    foreach ($piece in $m.Groups[1].Value -split ',') {
      $clean = $piece.Trim()
      if ($clean) { [void]$names.Add(($clean -split '\s+as\s+')[-1].Trim()) }
    }
  }
  return $names
}

$exports = @{}
foreach ($path in $sources.Keys) { $exports[$path] = Get-Exports $sources[$path] }

$problems = New-Object System.Collections.Generic.List[string]
$importRe = [regex]'(?s)import\s+(?:([^''"]+?)\s+from\s+)?[''"]([^''"]+)[''"]'

foreach ($path in $sources.Keys) {
  $relSource = $path.Replace("$root\", '').Replace('\', '/')
  foreach ($m in $importRe.Matches($sources[$path])) {
    $target = $m.Groups[2].Value
    if (-not $target.StartsWith('.')) { continue }

    $resolved = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $path) $target))
    if (-not (Test-Path $resolved -PathType Leaf)) {
      $problems.Add("${relSource}: import inexistente -> $target")
      continue
    }

    $clause = $m.Groups[1].Value
    $braces = [regex]::Match($clause, '\{([^}]*)\}')
    if (-not $braces.Success) { continue }

    $relTarget = $resolved.Replace("$root\", '').Replace('\', '/')
    foreach ($piece in $braces.Groups[1].Value -split ',') {
      $name = ($piece.Trim() -split '\s+as\s+')[0].Trim()
      if (-not $name) { continue }
      if (-not $exports[$resolved].Contains($name)) {
        $problems.Add("${relSource}: '$name' não é exportado por $relTarget")
      }
    }
  }
}

# Ações declaradas nos templates x handlers registrados
$declared = [System.Collections.Generic.HashSet[string]]::new()
$allSource = ($sources.Values -join "`n") + "`n" + (Get-Content (Join-Path $root 'index.html') -Raw)
foreach ($m in [regex]::Matches($allSource, 'data-(?:input-|change-|enter-)?action=["'']([A-Za-z_$][\w$]*)["'']')) {
  [void]$declared.Add($m.Groups[1].Value)
}

$registered = [System.Collections.Generic.HashSet[string]]::new()
foreach ($source in $sources.Values) {
  foreach ($block in [regex]::Matches($source, '(?s)on(?:Click|Input|Change)\s*\(\s*\{(.*?)\n\}\s*\)')) {
    foreach ($m in [regex]::Matches($block.Groups[1].Value, '(?m)^\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(')) {
      [void]$registered.Add($m.Groups[1].Value)
    }
  }
}

foreach ($name in ($declared | Where-Object { -not $registered.Contains($_) } | Sort-Object)) {
  $problems.Add("ação '$name' usada no template mas sem handler registrado")
}
foreach ($name in ($registered | Where-Object { -not $declared.Contains($_) } | Sort-Object)) {
  $problems.Add("aviso: handler '$name' registrado mas nunca usado no template")
}

if ($problems.Count -gt 0) {
  Write-Output "$($problems.Count) ponto(s) de atencao:`n"
  $problems | ForEach-Object { Write-Output " - $_" }
  exit 1
}

Write-Output "OK: $($sources.Count) modulos, imports e acoes consistentes."

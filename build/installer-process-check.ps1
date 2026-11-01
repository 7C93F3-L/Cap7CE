# Read-only preflight shared by installation and removal. Never terminate the app.
$ErrorActionPreference = 'Stop'
try {
    $prefix = [IO.Path]::GetFullPath($env:CAP7CE_INSTALL_APP).TrimEnd('\') + '\'
    $owners = @(Get-CimInstance Win32_Process -Filter "Name LIKE 'Cap7CE%' OR Name='node.exe'")
    foreach ($owner in $owners) {
        if (!$owner.ExecutablePath) { exit 2 }
        if ($owner.ExecutablePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { exit 2 }
    }
    exit 0
} catch { exit 2 }

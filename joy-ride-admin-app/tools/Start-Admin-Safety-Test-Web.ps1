param([Parameter(Mandatory=$true)][string]$ExportFolder)
& {
    $ErrorActionPreference = 'Stop'
    $previous = [Environment]::GetEnvironmentVariable('JR_SAFETY_WEB_MAPS_KEY', 'Process')
    $secret = $null
    $pointer = [IntPtr]::Zero
    try {
        if (-not (Test-Path -LiteralPath (Join-Path $ExportFolder 'web-receipt.json') -PathType Leaf)) { throw 'Verified export required.' }
        Write-Output 'Use only the WEBSITE-restricted JoyRide Admin Safety Test Web Maps key.'
        Write-Output 'Required referrers: http://localhost:8081 and http://localhost:8081/*'
        Write-Output 'Required API restriction: Maps JavaScript API only.'
        $secret = Read-Host 'Paste WEB Safety Test Maps key (input hidden)' -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $value = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)).Trim()
        if ($value -cnotmatch '^AIza[0-9A-Za-z_-]{35}$') { throw 'Unexpected key format.' }
        [Environment]::SetEnvironmentVariable('JR_SAFETY_WEB_MAPS_KEY', $value, 'Process')
        $value = $null
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $pointer = [IntPtr]::Zero
        $secret.Dispose()
        $secret = $null
        & node (Join-Path $PSScriptRoot 'serve-admin-safety-web.cjs') $ExportFolder
    } catch {
        Write-Output 'STOP: Repository Safety Test web launcher. Raw details withheld.'
    } finally {
        $value = $null
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        if ($secret) { $secret.Dispose() }
        [Environment]::SetEnvironmentVariable('JR_SAFETY_WEB_MAPS_KEY', $previous, 'Process')
    }
}

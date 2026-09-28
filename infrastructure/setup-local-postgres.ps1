$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$api = Join-Path $project 'apps\api'
$envPath = Join-Path $api '.env'

if (!(Test-Path -LiteralPath (Join-Path $project 'node_modules\typescript\bin\tsc'))) {
    throw 'Install project dependencies with pnpm first.'
}

if (!(Test-Path -LiteralPath $envPath)) {
    Write-Host 'Enter the postgres password you chose during PostgreSQL installation.'
    Write-Host 'The password stays on this computer and will not be displayed.'
    $securePassword = Read-Host 'PostgreSQL administrator password' -AsSecureString
    $credential = New-Object System.Management.Automation.PSCredential('postgres', $securePassword)
    try {
        $env:SHOWHUNT_POSTGRES_ADMIN_PASSWORD = $credential.GetNetworkCredential().Password
        & node (Join-Path $api 'scripts\setup-local-db.mjs') $project
        if ($LASTEXITCODE -ne 0) { throw 'Database setup did not complete. See the message above.' }
    } finally {
        Remove-Item Env:SHOWHUNT_POSTGRES_ADMIN_PASSWORD -ErrorAction SilentlyContinue
        $credential = $null
        $securePassword = $null
    }
} else {
    Write-Host 'Using existing API .env; credentials will not be replaced.'
}

Push-Location $api
try {
    & node --env-file=.env scripts/migrate.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Migration failed.' }
    & node --env-file=.env scripts/migrate.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Migration replay failed.' }
    & node (Join-Path $project 'node_modules\typescript\bin\tsc') --project tsconfig.json
    if ($LASTEXITCODE -ne 0) { throw 'API build failed.' }
    $previousReady = $env:EXPECT_DB_READY
    try {
        $env:EXPECT_DB_READY = 'true'
        & node --env-file=.env scripts/smoke.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Database readiness smoke test failed.' }
    } finally {
        if ($null -eq $previousReady) { Remove-Item Env:EXPECT_DB_READY -ErrorAction SilentlyContinue }
        else { $env:EXPECT_DB_READY = $previousReady }
    }
    Write-Host 'SUCCESS: Database configured, migrations replay safely, and API readiness passes.' -ForegroundColor Green
} finally {
    Pop-Location
}

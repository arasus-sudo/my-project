param(
    [string]$ResourceGroup = "rg-innoira",
    [string]$Location = "eastus",
    [string]$StaticWebAppName = "innoira-app",
    [string]$BackendUrl = "https://innoira-api.azurewebsites.net"
)

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Innoira Suite - Frontend Deployment    ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 1. Create Static Web App ──
Write-Host "▶ [1/4] Creating Static Web App..." -ForegroundColor Yellow
az staticwebapp create --name $StaticWebAppName --resource-group $ResourceGroup --location $Location --output table
if ($LASTEXITCODE -ne 0) { Write-Host "✗ Failed to create Static Web App. Trying existing..." }

# ── 2. Build frontend ──
Write-Host "▶ [2/4] Installing dependencies and building..." -ForegroundColor Yellow
$frontendPath = "D:\SUITEOFAGETNS\frontend"
Set-Location $frontendPath

# Install deps if node_modules missing
if (-not (Test-Path "node_modules")) {
    npm install --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) { Write-Host "✗ npm install failed"; exit 1 }
}

# Inject backend URL
$env:REACT_APP_BACKEND_URL = $BackendUrl

# Build
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "✗ Build failed"; exit 1 }

# ── 3. Deploy via ZIP ──
Write-Host "▶ [3/4] Zipping build artifacts..." -ForegroundColor Yellow
$zipPath = "$env:TEMP\frontend-build.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Write-Host "▶ Deploying to Static Web App..." -ForegroundColor Yellow
az staticwebapp deploy --name $StaticWebAppName --resource-group $ResourceGroup --source-path "$frontendPath\build" --output table

# ── 4. Configure ──
Write-Host "▶ [4/4] Configuring env vars..." -ForegroundColor Yellow
az staticwebapp appsettings set --name $StaticWebAppName --resource-group $ResourceGroup `
    --setting-names "REACT_APP_BACKEND_URL=$BackendUrl" --output table 2>$null

# ── Done ──
$defaultHost = az staticwebapp show --name $StaticWebAppName --resource-group $ResourceGroup --query "defaultHostname" -o tsv

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   ✅ FRONTEND DEPLOYMENT COMPLETE        ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════╣" -ForegroundColor Green
if ($defaultHost) {
    Write-Host "║  URL: https://$defaultHost" -ForegroundColor Green
}
Write-Host "║  API: $BackendUrl" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "After deployment, set CORS on backend:" -ForegroundColor Cyan
if ($defaultHost) {
    Write-Host "  az webapp config appsettings set --name innoira-api --resource-group rg-innoira --settings CORS_ORIGINS=""https://$defaultHost""" -ForegroundColor Gray
}
Write-Host ""
Write-Host "Then open your browser and test:" -ForegroundColor Cyan
if ($defaultHost) {
    Write-Host "  https://$defaultHost" -ForegroundColor White
}

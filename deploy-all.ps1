param(
    [string]$ResourceGroup = "rg-innoira",
    [string]$Location = "eastus",
    [string]$WebAppName = "innoira-api",
    [string]$StaticWebAppName = "innoira-app"
)

Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Innoira Suite - Full Azure Deployment (Backend + Frontend) ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date

# ── Step 1: Deploy Backend ──
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host "  PHASE 1: BACKEND DEPLOYMENT" -ForegroundColor Magenta
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host ""
& "D:\SUITEOFAGETNS\deploy.ps1" -ResourceGroup $ResourceGroup -Location $Location -WebAppName $WebAppName
if ($LASTEXITCODE -ne 0) { Write-Host "✗ Backend deployment failed"; exit 1 }

# ── Step 2: Deploy Frontend ──
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host "  PHASE 2: FRONTEND DEPLOYMENT" -ForegroundColor Magenta
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host ""
$backendUrl = "https://$WebAppName.azurewebsites.net"
& "D:\SUITEOFAGETNS\deploy-frontend.ps1" -ResourceGroup $ResourceGroup -Location $Location -StaticWebAppName $StaticWebAppName -BackendUrl $backendUrl
if ($LASTEXITCODE -ne 0) { Write-Host "✗ Frontend deployment failed"; exit 1 }

# ── Step 3: Set CORS ──
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host "  PHASE 3: CONFIGURE CORS & VERIFY" -ForegroundColor Magenta
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host ""

$defaultHost = az staticwebapp show --name $StaticWebAppName --resource-group $ResourceGroup --query "defaultHostname" -o tsv
$frontendUrl = "https://$defaultHost"
$corsOrigins = "$frontendUrl,http://localhost:3000"

Write-Host "▶ Setting CORS to allow: $corsOrigins" -ForegroundColor Yellow
az webapp config appsettings set --name $WebAppName --resource-group $ResourceGroup `
    --settings "CORS_ORIGINS=$corsOrigins" "FRONTEND_URL=$frontendUrl" --output table

Write-Host "▶ Verifying backend..." -ForegroundColor Yellow
try {
    $resp = Invoke-WebRequest -Uri "$backendUrl/docs" -UseBasicParsing -TimeoutSec 10
    Write-Host "  ✓ Backend API docs: $backendUrl/docs ($($resp.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "  ⚠ Backend not responding yet. Check: $backendUrl/docs" -ForegroundColor Yellow
}

Write-Host ""

# ── Summary ──
$elapsed = (Get-Date) - $startTime
Write-Host "╔════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   ✅ FULL DEPLOYMENT COMPLETE                  ║" -ForegroundColor Green
Write-Host "╠════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Duration: $($elapsed.Minutes)m $($elapsed.Seconds)s              ║" -ForegroundColor Green
Write-Host "╠════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Backend API:  $backendUrl" -ForegroundColor Green
Write-Host "║  API Docs:     $backendUrl/docs" -ForegroundColor Green
Write-Host "║  Frontend:     $frontendUrl" -ForegroundColor Green
Write-Host "╠════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Resource Group: $ResourceGroup" -ForegroundColor Gray
Write-Host "║  Location:       $Location" -ForegroundColor Gray
Write-Host "╚════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "To redeploy backend only:" -ForegroundColor Cyan
Write-Host "  .\deploy.ps1" -ForegroundColor White
Write-Host "To redeploy frontend only:" -ForegroundColor Cyan
Write-Host "  .\deploy-frontend.ps1" -ForegroundColor White

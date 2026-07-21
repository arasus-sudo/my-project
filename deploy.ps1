param(
    [string]$ResourceGroup = "rg-innoira",
    [string]$Location = "eastus",
    [string]$WebAppName = "innoira-api",
    [string]$PlanName = "asp-innoira"
)

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Innoira Suite - Azure Deployment      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 1. Create Resource Group ──
Write-Host "▶ [1/6] Creating resource group..." -ForegroundColor Yellow
az group create --name $ResourceGroup --location $Location --output table
if ($LASTEXITCODE -ne 0) { Write-Host "✗ Failed"; exit 1 }

# ── 2. Create App Service Plan ──
Write-Host "▶ [2/6] Creating App Service Plan..." -ForegroundColor Yellow
az appservice plan create --name $PlanName --resource-group $ResourceGroup --location $Location --is-linux --sku B1 --output table
if ($LASTEXITCODE -ne 0) { Write-Host "✗ Failed"; exit 1 }

# ── 3. Create Web App ──
Write-Host "▶ [3/6] Creating Web App..." -ForegroundColor Yellow
az webapp create --name $WebAppName --resource-group $ResourceGroup --plan $PlanName --runtime "PYTHON:3.11" --output table
if ($LASTEXITCODE -ne 0) { Write-Host "✗ Failed"; exit 1 }

# ── 4. Set Startup & Config ──
Write-Host "▶ [4/6] Configuring startup command..." -ForegroundColor Yellow
az webapp config set --name $WebAppName --resource-group $ResourceGroup --startup-file "gunicorn --bind=0.0.0.0:8000 --workers=2 --timeout=120 server:app" --output table

Write-Host "▶ Setting Python version..." -ForegroundColor Yellow
az webapp config set --name $WebAppName --resource-group $ResourceGroup --linux-fx-version "PYTHON|3.11" --output table

# ── 5. Deploy Backend ──
Write-Host "▶ [5/6] Zipping and deploying backend..." -ForegroundColor Yellow
$zipPath = "$env:TEMP\backend-deploy.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
python -c "
import zipfile, os
z = zipfile.ZipFile('$zipPath', 'w', zipfile.ZIP_DEFLATED)
for r, dirs, fs in os.walk('D:/SUITEOFAGETNS/backend'):
    dirs[:] = [d for d in dirs if d != '__pycache__']
    for f in fs:
        path = os.path.join(r, f)
        arcname = os.path.relpath(path, 'D:/SUITEOFAGETNS/backend').replace('\\', '/')
        z.write(path, arcname)
z.close()
"
az webapp deploy --resource-group $ResourceGroup --name $WebAppName --src-path $zipPath --type zip
Remove-Item $zipPath -Force
if ($LASTEXITCODE -ne 0) { Write-Host "✗ Failed"; exit 1 }

# ── 6. Prompt for env vars ──
Write-Host ""
Write-Host "▶ [6/6] Configure environment variables" -ForegroundColor Yellow
Write-Host "Enter your API keys (leave blank to skip):" -ForegroundColor Gray

$mongodb = Read-Host "MONGODB_URI (e.g. mongodb+srv://user:pass@cluster.mongodb.net/innoira)"
$anthropic = Read-Host "ANTHROPIC_API_KEY"
$prospeo = Read-Host "PROSPEO_API_KEY"
$icypeasKey = Read-Host "ICYPEAS_API_KEY"
$icypeasSecret = Read-Host "ICYPEAS_API_SECRET"
$jwt = if ((Read-Host "Auto-generate JWT_SECRET? (y/n)") -eq "y") { openssl rand -hex 32 } else { Read-Host "JWT_SECRET" }

$settings = @()
if ($mongodb) { $settings += "MONGODB_URI=$mongodb" }
if ($anthropic) { $settings += "ANTHROPIC_API_KEY=$anthropic" }
if ($prospeo) { $settings += "PROSPEO_API_KEY=$prospeo" }
if ($icypeasKey) { $settings += "ICYPEAS_API_KEY=$icypeasKey" }
if ($icypeasSecret) { $settings += "ICYPEAS_API_SECRET=$icypeasSecret" }
if ($jwt) { $settings += "JWT_SECRET=$jwt" }
$settings += "PORT=8000"
$settings += "PYTHONPATH=/home/site/wwwroot"

if ($settings.Count -gt 0) {
    Write-Host "Setting app configuration..." -ForegroundColor Yellow
    az webapp config appsettings set --name $WebAppName --resource-group $ResourceGroup --settings $settings --output table
}

# ── Done ──
Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   ✅ DEPLOYMENT COMPLETE                 ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  URL: https://$WebAppName.azurewebsites.net" -ForegroundColor Green
Write-Host "║  Docs: https://$WebAppName.azurewebsites.net/docs" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "To verify:" -ForegroundColor Cyan
Write-Host "  curl https://$WebAppName.azurewebsites.net/api/health" -ForegroundColor Gray

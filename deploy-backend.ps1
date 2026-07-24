param(
    [string]$ResourceGroup = "rg-innoira",
    [string]$WebAppName = "innoira-api"
)

Write-Host "▶ Zipping backend..." -ForegroundColor Yellow
$zipPath = "$env:TEMP\backend-deploy.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

python -c @"
import zipfile, os, re
exclude_ext = {'.log', '.txt', '.zip', '.err'}
exclude_files = {'deploy.zip', 'backend-deploy.zip'}
zp = os.environ['TEMP'] + '\\backend-deploy.zip'
z = zipfile.ZipFile(re.sub(r'\\', '/', zp), 'w', zipfile.ZIP_DEFLATED)
for r, dirs, fs in os.walk('D:/SUITEOFAGETNS/backend'):
    dirs[:] = [d for d in dirs if d not in ('__pycache__', '.git', '.venv', 'venv')]
    for f in fs:
        if f in exclude_files: continue
        _, ext = os.path.splitext(f)
        if ext.lower() in exclude_ext: continue
        path = os.path.join(r, f)
        arcname = os.path.relpath(path, 'D:/SUITEOFAGETNS/backend').replace('\\', '/')
        z.write(path, arcname)
z.close()
print('Zip created:', zp)
"@
az webapp config appsettings set --name $WebAppName --resource-group $ResourceGroup --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true --output table 2>$null

Write-Host "▶ Deploying to Azure..." -ForegroundColor Yellow
& "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" webapp deploy `
    --resource-group $ResourceGroup --name $WebAppName `
    --src-path $zipPath --type zip

Write-Host "✅ Backend deployed" -ForegroundColor Green

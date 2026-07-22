param(
    [string]$ResourceGroup = "rg-innoira",
    [string]$WebAppName = "innoira-api"
)

Write-Host "▶ Zipping backend..." -ForegroundColor Yellow
$zipPath = "$env:TEMP\backend-deploy.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

python -c @"
import zipfile, os, re
zp = os.environ['TEMP'] + '\\backend-deploy.zip'
# Use forward slashes in the ZIP so Linux can extract subdirectories
z = zipfile.ZipFile(re.sub(r'\\', '/', zp), 'w', zipfile.ZIP_DEFLATED)
for r, dirs, fs in os.walk('D:/SUITEOFAGETNS/backend'):
    dirs[:] = [d for d in dirs if d != '__pycache__']
    for f in fs:
        path = os.path.join(r, f)
        arcname = os.path.relpath(path, 'D:/SUITEOFAGETNS/backend').replace('\\', '/')
        z.write(path, arcname)
z.close()
print('Zip created:', zp)
"@

Write-Host "▶ Deploying to Azure..." -ForegroundColor Yellow
& "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" webapp deploy `
    --resource-group $ResourceGroup --name $WebAppName `
    --src-path $zipPath --type zip

Write-Host "✅ Backend deployed" -ForegroundColor Green

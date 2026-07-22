import zipfile, os
src = r'D:\SUITEOFAGETNS\backend'
dst = os.path.join(src, 'deploy.zip')
skip = {'__pycache__', 'venv', '.venv', '.git', 'node_modules', '.vscode'}
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
    for r, ds, fs in os.walk(src):
        ds[:] = [d for d in ds if d not in skip]
        for f in fs:
            abspath = os.path.join(r, f)
            arcname = os.path.relpath(abspath, src).replace('\\', '/')
            z.write(abspath, arcname)
print(f'Done: {os.path.getsize(dst)/1024/1024:.1f} MB')

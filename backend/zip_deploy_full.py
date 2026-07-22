import zipfile, os, sys

src = sys.argv[1]
dst = sys.argv[2]

EXCLUDE = {'__pycache__', '.git', 'node_modules', '__pypackages__'}

z = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
for r, dirs, fs in os.walk(src):
    dirs[:] = [d for d in dirs if d not in EXCLUDE]
    for f in fs:
        path = os.path.join(r, f)
        arcname = os.path.relpath(path, src).replace('\\', '/')
        z.write(path, arcname)
z.close()
print(f"Created {dst} ({os.path.getsize(dst)} bytes)")

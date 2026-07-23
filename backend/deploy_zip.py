import zipfile, os

src = r"D:\SUITEOFAGETNS\backend"
dst = os.environ["TEMP"] + r"\deploy.zip"
skip_dirs = {"__pycache__", "venv", ".git", ".mypy_cache", ".pytest_cache"}
skip_exts = {".pyc", ".log"}

z = zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED)
for r, dirs, fs in os.walk(src):
    dirs[:] = [d for d in dirs if d not in skip_dirs and not d.startswith(".")]
    for f in fs:
        ext = os.path.splitext(f)[1]
        if ext in skip_exts:
            continue
        # Keep .txt files (like requirements.txt) but exclude huge log files
        if ext == ".txt" and f != "requirements.txt":
            continue
        path = os.path.join(r, f)
        arcname = os.path.relpath(path, src).replace("\\", "/")
        z.write(path, arcname)
z.close()
print(f"Created: {dst} ({os.path.getsize(dst) / 1024 / 1024:.1f} MB)")

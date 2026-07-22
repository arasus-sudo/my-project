import tarfile, os, sys
t = tarfile.open('/tmp/packages.tar', 'r')
seen = set()
for m in t.getmembers():
    if m.name.startswith('./antenv/'):
        newname = m.name[9:]
        if newname in seen:
            continue
        seen.add(newname)
        m.name = newname
        t.extract(m, '/home/site/wwwroot/antenv')
t.close()
print("done extracting", len(seen), "items")

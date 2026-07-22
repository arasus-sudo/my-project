import json
with open("gh_runs.json") as f:
    data = json.load(f)
runs = data.get("workflow_runs", [])
for r in runs[:5]:
    msg = (r.get("head_commit") or {}).get("message", "")[:80]
    print(f"{r['name']}#{r['run_number']}: {r['conclusion']}")
    print(f"  {msg}")
    print(f"  {r['html_url']}")
    print()

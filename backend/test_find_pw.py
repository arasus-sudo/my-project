import httpx
c = httpx.Client(timeout=10)
pws = ["test123", "Test1234!", "Restore@123", "Restore123", "test1234", "TempPw@98765", "Demo@1234", "password123", "admin123", "test12345", "test@1234"]
for pw in pws:
    r = c.post("http://localhost:8001/api/auth/login", json={"email":"test@test.com","password":pw}, timeout=10)
    if r.status_code == 200:
        print(f"FOUND: {pw}")
        break
    print(f"  {pw}: {r.status_code}")
c.close()

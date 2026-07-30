import asyncio, os
os.environ["MONGO_URL"] = "mongodb://localhost:27017"
os.environ["DB_NAME"] = "pitch_eq"
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    campaigns = await db.campaigns.count_documents({})
    users = await db.users.count_documents({})
    sends = await db.send_queue.count_documents({})
    print(f"campaigns: {campaigns}, users: {users}, send_queue total: {sends}")
    tick_rows = await db.tick_health.find({}).to_list(100)
    for t in tick_rows:
        e = t.get("last_error")
        print(f"  tick: {t.get('tick_id')} | last_run: {t.get('last_run_at')} | success: {t.get('last_success_at')} | errors: {t.get('error_count')} | last_error: {e}")
    # list pending send_queue items
    pending = await db.send_queue.find({"status": "pending"}).to_list(20)
    for p in pending:
        print(f"  queue: {p.get('id')} status={p.get('status')} send_at={p.get('send_at')} campaign={p.get('campaign_id')} lead={p.get('lead_id')} attempts={p.get('attempts')}")
    failed = await db.send_queue.find({"status": "failed"}).to_list(20)
    for p in failed:
        print(f"  FAILED: {p.get('id')} send_at={p.get('send_at')} error={p.get('error')} attempts={p.get('attempts')}")
if __name__ == "__main__":
    asyncio.run(main())

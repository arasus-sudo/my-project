"""Accounting EQ — Double-entry ledger, invoicing, AP bills, financial reports.

Enforced balanced journal entries. Mocked-first: runs without real bank/ERP.
Integrates with Proposal EQ for invoice generation.
"""

import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from server import db, now_iso, new_id, current_user, _audit
from billing import charge_credits

log = logging.getLogger(__name__)

accounting_router = APIRouter(prefix="/accounting-eq")

PAGE_SIZE = 25

# ---- Helpers ----
def _fmt_d(val):
    """Format a number to 2 decimal places."""
    if val is None:
        return 0.0
    return float(Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

# ---- Account Types ----
ASSET = "asset"
LIABILITY = "liability"
EQUITY = "equity"
REVENUE = "revenue"
EXPENSE = "expense"

DEBIT_NORMAL_TYPES = {ASSET, EXPENSE}
CREDIT_NORMAL_TYPES = {LIABILITY, EQUITY, REVENUE}


# ---- Authenticated Routes ----

# ── Chart of Accounts ──
@accounting_router.get("/accounts")
async def list_accounts(
    account_type: Optional[str] = None,
    category: Optional[str] = None,
    user=Depends(current_user),
):
    query = {"workspace_id": user["workspace_id"]}
    if account_type:
        query["account_type"] = account_type
    if category:
        query["category"] = category
    items = await db.coa_accounts.find(query, {"_id": 0}) \
        .sort("code", 1).to_list(500)
    return items

@accounting_router.post("/accounts")
async def create_account(body: dict, user=Depends(current_user)):
    at = body.get("account_type", ASSET)
    if at not in (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE):
        raise HTTPException(400, "Invalid account type")
    
    account = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "code": body.get("code", ""),
        "name": body.get("name", ""),
        "description": body.get("description", ""),
        "account_type": at,
        "category": body.get("category", ""),
        "normal_balance": "debit" if at in DEBIT_NORMAL_TYPES else "credit",
        "currency": body.get("currency", "USD"),
        "is_active": True,
        "balance": 0.0,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.coa_accounts.insert_one(account)
    return account

@accounting_router.put("/accounts/{aid}")
async def update_account(aid: str, body: dict, user=Depends(current_user)):
    await db.coa_accounts.update_one(
        {"id": aid, "workspace_id": user["workspace_id"]},
        {"$set": {**body, "updated_at": now_iso()}}
    )
    return {"ok": True}

@accounting_router.delete("/accounts/{aid}")
async def delete_account(aid: str, user=Depends(current_user)):
    # Check no journal lines reference this account
    exists = await db.journal_entries.find_one({
        "workspace_id": user["workspace_id"],
        "lines.account_id": aid,
    })
    if exists:
        raise HTTPException(400, "Cannot delete account with journal entries")
    await db.coa_accounts.delete_one({"id": aid, "workspace_id": user["workspace_id"]})
    return {"ok": True}

# ── Journal Entries ──
@accounting_router.get("/journal-entries")
async def list_journal_entries(
    page: int = Query(1, ge=1),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    account_id: Optional[str] = None,
    user=Depends(current_user),
):
    query = {"workspace_id": user["workspace_id"]}
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        query["date"] = {**query.get("date", {}), "$lte": end_date}
    if account_id:
        query["lines.account_id"] = account_id

    total = await db.journal_entries.count_documents(query)
    items = await db.journal_entries.find(query, {"_id": 0}) \
        .sort("date", -1) \
        .skip((page - 1) * PAGE_SIZE) \
        .to_list(PAGE_SIZE)
    
    # Batch-fetch all referenced account names (fixes N+1 per line)
    all_aids = list(set(
        line.get("account_id") for item in items for line in item.get("lines", [])
    ))
    acct_cursor = db.coa_accounts.find(
        {"id": {"$in": all_aids}}, {"_id": 0, "id": 1, "name": 1, "code": 1}
    ) if all_aids else []
    acct_map = {
        a["id"]: f"{a.get('code', '')} - {a.get('name', '')}"
        async for a in acct_cursor
    }
    for item in items:
        for line in item.get("lines", []):
            line["account_name"] = acct_map.get(line.get("account_id", ""), "")
    
    return {"items": items, "total": total, "page": page, "page_size": PAGE_SIZE}

@accounting_router.post("/journal-entries")
async def create_journal_entry(body: dict, user=Depends(current_user)):
    lines = body.get("lines", [])
    if not lines or len(lines) < 2:
        raise HTTPException(400, "Journal entry must have at least 2 lines")
    
    # Validate and compute totals
    total_debit = Decimal("0")
    total_credit = Decimal("0")
    validated = []
    
    for line in lines:
        aid = line.get("account_id")
        account = await db.coa_accounts.find_one(
            {"id": aid, "workspace_id": user["workspace_id"]}, {"_id": 0}
        )
        if not account:
            raise HTTPException(400, f"Account {aid} not found")
        
        debit = Decimal(str(line.get("debit", 0)))
        credit = Decimal(str(line.get("credit", 0)))
        
        if debit > 0 and credit > 0:
            raise HTTPException(400, "Line cannot have both debit and credit")
        if debit == 0 and credit == 0:
            raise HTTPException(400, "Line must have debit or credit amount")
        
        total_debit += debit
        total_credit += credit
        
        validated.append({
            "account_id": aid,
            "account_code": account.get("code", ""),
            "account_name": account.get("name", ""),
            "debit": float(debit),
            "credit": float(credit),
            "memo": line.get("memo", ""),
        })
    
    if total_debit != total_credit:
        raise HTTPException(400, f"Journal entry not balanced: debits={total_debit} credits={total_credit}")
    
    entry = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "date": body.get("date", now_iso()[:10]),
        "memo": body.get("memo", ""),
        "reference": body.get("reference", ""),
        "lines": validated,
        "total": float(total_debit),
        "created_by": user.get("id", ""),
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.journal_entries.insert_one(entry)
    
    # Update account balances
    for line in validated:
        norm = "debit" if line["debit"] > 0 else "credit"
        amount = float(line["debit"] or line["credit"])
        acct = await db.coa_accounts.find_one({"id": line["account_id"]})
        if acct:
            bal = float(acct.get("balance", 0))
            if norm == acct.get("normal_balance", "debit"):
                bal += amount
            else:
                bal -= amount
            await db.coa_accounts.update_one(
                {"id": line["account_id"]},
                {"$set": {"balance": _fmt_d(bal), "updated_at": now_iso()}}
            )
    
    await _audit(user, "accounting.journal.create", {"entry_id": entry["id"], "total": float(total_debit)})
    return entry

# ── Customers ──
@accounting_router.get("/customers")
async def list_customers(user=Depends(current_user)):
    items = await db.accounting_customers.find(
        {"workspace_id": user["workspace_id"]}, {"_id": 0}
    ).sort("name", 1).to_list(500)
    return items

@accounting_router.post("/customers")
async def create_customer(body: dict, user=Depends(current_user)):
    c = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "name": body.get("name", ""),
        "email": body.get("email", ""),
        "phone": body.get("phone", ""),
        "address": body.get("address", ""),
        "currency": body.get("currency", "USD"),
        "payment_terms": body.get("payment_terms", "net30"),
        "notes": body.get("notes", ""),
        "total_billed": 0.0,
        "total_paid": 0.0,
        "balance": 0.0,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.accounting_customers.insert_one(c)
    return c

@accounting_router.put("/customers/{cid}")
async def update_customer(cid: str, body: dict, user=Depends(current_user)):
    await db.accounting_customers.update_one(
        {"id": cid, "workspace_id": user["workspace_id"]},
        {"$set": {**body, "updated_at": now_iso()}}
    )
    return {"ok": True}

# ── AR Invoices ──
@accounting_router.get("/invoices")
async def list_invoices(
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    user=Depends(current_user),
):
    query = {"workspace_id": user["workspace_id"]}
    if status:
        query["status"] = status
    if customer_id:
        query["customer_id"] = customer_id
    total = await db.accounting_invoices.count_documents(query)
    items = await db.accounting_invoices.find(query, {"_id": 0}) \
        .sort("date", -1) \
        .skip((page - 1) * PAGE_SIZE) \
        .to_list(PAGE_SIZE)
    return {"items": items, "total": total, "page": page, "page_size": PAGE_SIZE}

@accounting_router.post("/invoices")
async def create_invoice(body: dict, user=Depends(current_user)):
    lines = body.get("lines", [])
    if not lines:
        raise HTTPException(400, "Invoice must have at least 1 line")
    
    subtotal = sum(l.get("quantity", 0) * l.get("unit_price", 0) for l in lines)
    tax_rate = float(body.get("tax_rate", 0))
    tax_amount = _fmt_d(subtotal * tax_rate / 100)
    total = _fmt_d(subtotal + tax_amount)
    
    inv = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "invoice_number": body.get("invoice_number", f"INV-{new_id()[:8].upper()}"),
        "customer_id": body.get("customer_id"),
        "date": body.get("date", now_iso()[:10]),
        "due_date": body.get("due_date", ""),
        "lines": [{
            "description": l.get("description", ""),
            "quantity": l.get("quantity", 1),
            "unit_price": l.get("unit_price", 0),
            "amount": _fmt_d(l.get("quantity", 1) * l.get("unit_price", 0)),
        } for l in lines],
        "subtotal": _fmt_d(subtotal),
        "tax_rate": tax_rate,
        "tax_amount": tax_amount,
        "total": total,
        "amount_paid": 0.0,
        "balance_due": total,
        "currency": body.get("currency", "USD"),
        "status": "draft",
        "notes": body.get("notes", ""),
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.accounting_invoices.insert_one(inv)
    return inv

@accounting_router.put("/invoices/{iid}")
async def update_invoice(iid: str, body: dict, user=Depends(current_user)):
    inv = await db.accounting_invoices.find_one(
        {"id": iid, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not inv:
        raise HTTPException(404, "Invoice not found")
    
    if body.get("status") == "sent" and inv["status"] == "draft":
        # Post to AR account
        ar_acct = await db.coa_accounts.find_one({
            "workspace_id": user["workspace_id"],
            "account_type": ASSET,
            "category": "accounts_receivable",
        })
        rev_acct = await db.coa_accounts.find_one({
            "workspace_id": user["workspace_id"],
            "account_type": REVENUE,
        })
        
        if ar_acct and rev_acct:
            je_lines = [
                {"account_id": ar_acct["id"], "debit": inv["total"], "credit": 0, "memo": f"Invoice {inv.get('invoice_number', '')}"},
                {"account_id": rev_acct["id"], "debit": 0, "credit": inv["total"], "memo": f"Invoice {inv.get('invoice_number', '')}"},
            ]
            entry = {
                "id": new_id(), "workspace_id": user["workspace_id"],
                "date": now_iso()[:10],
                "memo": f"Auto-posting invoice {inv.get('invoice_number', '')}",
                "reference": inv.get("invoice_number", ""),
                "lines": je_lines,
                "total": inv["total"],
                "created_by": user.get("id", ""),
                "created_at": now_iso(), "updated_at": now_iso(),
            }
            await db.journal_entries.insert_one(entry)
            
            # Update AR balance
            ar_bal = float(ar_acct.get("balance", 0)) + inv["total"]
            await db.coa_accounts.update_one(
                {"id": ar_acct["id"]},
                {"$set": {"balance": _fmt_d(ar_bal), "updated_at": now_iso()}}
            )
            rev_bal = float(rev_acct.get("balance", 0)) + inv["total"]
            await db.coa_accounts.update_one(
                {"id": rev_acct["id"]},
                {"$set": {"balance": _fmt_d(rev_bal), "updated_at": now_iso()}}
            )
        
        # Update customer balance
        if inv.get("customer_id"):
            cust = await db.accounting_customers.find_one({"id": inv["customer_id"]})
            if cust:
                await db.accounting_customers.update_one(
                    {"id": inv["customer_id"]},
                    {"$set": {
                        "total_billed": _fmt_d(float(cust.get("total_billed", 0)) + inv["total"]),
                        "balance": _fmt_d(float(cust.get("balance", 0)) + inv["total"]),
                    }}
                )
    
    if body.get("status") in ("paid", "partially_paid"):
        paid_amt = body.get("amount_paid", 0)
        new_paid = _fmt_d(float(inv.get("amount_paid", 0)) + paid_amt)
        new_balance = _fmt_d(inv["total"] - new_paid)
        body["amount_paid"] = new_paid
        body["balance_due"] = new_balance
        
        # Post payment to bank
        bank_acct = await db.coa_accounts.find_one({
            "workspace_id": user["workspace_id"],
            "account_type": ASSET,
            "category": "cash_and_bank",
        })
        if bank_acct:
            ar_acct = await db.coa_accounts.find_one({
                "workspace_id": user["workspace_id"],
                "account_type": ASSET,
                "category": "accounts_receivable",
            })
            if ar_acct:
                je_lines = [
                    {"account_id": bank_acct["id"], "debit": paid_amt, "credit": 0, "memo": f"Payment for {inv.get('invoice_number', '')}"},
                    {"account_id": ar_acct["id"], "debit": 0, "credit": paid_amt, "memo": f"Payment for {inv.get('invoice_number', '')}"},
                ]
                entry = {
                    "id": new_id(), "workspace_id": user["workspace_id"],
                    "date": now_iso()[:10],
                    "memo": f"Payment received on {inv.get('invoice_number', '')}",
                    "reference": inv.get("invoice_number", ""),
                    "lines": je_lines,
                    "total": paid_amt,
                    "created_by": user.get("id", ""),
                    "created_at": now_iso(), "updated_at": now_iso(),
                }
                await db.journal_entries.insert_one(entry)
                
                bank_bal = float(bank_acct.get("balance", 0)) + paid_amt
                await db.coa_accounts.update_one(
                    {"id": bank_acct["id"]},
                    {"$set": {"balance": _fmt_d(bank_bal), "updated_at": now_iso()}}
                )
                ar_bal = float(ar_acct.get("balance", 0)) - paid_amt
                await db.coa_accounts.update_one(
                    {"id": ar_acct["id"]},
                    {"$set": {"balance": _fmt_d(ar_bal), "updated_at": now_iso()}}
                )
        
        # Update customer
        if inv.get("customer_id"):
            cust = await db.accounting_customers.find_one({"id": inv["customer_id"]})
            if cust:
                await db.accounting_customers.update_one(
                    {"id": inv["customer_id"]},
                    {"$set": {
                        "total_paid": _fmt_d(float(cust.get("total_paid", 0)) + paid_amt),
                        "balance": _fmt_d(float(cust.get("balance", 0)) - paid_amt),
                    }}
                )
        
        if new_balance <= 0:
            body["status"] = "paid"
    
    await db.accounting_invoices.update_one(
        {"id": iid},
        {"$set": {**body, "updated_at": now_iso()}}
    )
    return {"ok": True}

# ── AP Bills ──
@accounting_router.get("/bills")
async def list_bills(status: Optional[str] = None, user=Depends(current_user)):
    query = {"workspace_id": user["workspace_id"]}
    if status:
        query["status"] = status
    items = await db.accounting_bills.find(query, {"_id": 0}) \
        .sort("date", -1).to_list(200)
    return items

@accounting_router.post("/bills")
async def create_bill(body: dict, user=Depends(current_user)):
    lines = body.get("lines", [])
    if not lines:
        raise HTTPException(400, "Bill must have at least 1 line")
    
    subtotal = sum(l.get("quantity", 1) * l.get("unit_price", 0) for l in lines)
    total = _fmt_d(subtotal)
    
    bill = {
        "id": new_id(), "workspace_id": user["workspace_id"],
        "bill_number": body.get("bill_number", f"BILL-{new_id()[:8].upper()}"),
        "vendor_name": body.get("vendor_name", ""),
        "vendor_email": body.get("vendor_email", ""),
        "date": body.get("date", now_iso()[:10]),
        "due_date": body.get("due_date", ""),
        "lines": [{
            "description": l.get("description", ""),
            "quantity": l.get("quantity", 1),
            "unit_price": l.get("unit_price", 0),
            "amount": _fmt_d(l.get("quantity", 1) * l.get("unit_price", 0)),
        } for l in lines],
        "total": total,
        "amount_paid": 0.0,
        "balance_due": total,
        "status": "unpaid",
        "notes": body.get("notes", ""),
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.accounting_bills.insert_one(bill)
    return bill

@accounting_router.put("/bills/{bid}")
async def update_bill(bid: str, body: dict, user=Depends(current_user)):
    bill = await db.accounting_bills.find_one(
        {"id": bid, "workspace_id": user["workspace_id"]}, {"_id": 0}
    )
    if not bill:
        raise HTTPException(404, "Bill not found")
    
    if body.get("status") == "paid":
        paid_amt = bill["total"]
        
        # Post expense + payment
        exp_acct = await db.coa_accounts.find_one({
            "workspace_id": user["workspace_id"],
            "account_type": EXPENSE,
        })
        bank_acct = await db.coa_accounts.find_one({
            "workspace_id": user["workspace_id"],
            "account_type": ASSET,
            "category": "cash_and_bank",
        })
        
        if exp_acct and bank_acct:
            je_lines = [
                {"account_id": exp_acct["id"], "debit": paid_amt, "credit": 0, "memo": f"Bill {bill.get('bill_number', '')}"},
                {"account_id": bank_acct["id"], "debit": 0, "credit": paid_amt, "memo": f"Bill {bill.get('bill_number', '')}"},
            ]
            entry = {
                "id": new_id(), "workspace_id": user["workspace_id"],
                "date": now_iso()[:10],
                "memo": f"Auto-posting bill payment {bill.get('bill_number', '')}",
                "reference": bill.get("bill_number", ""),
                "lines": je_lines,
                "total": paid_amt,
                "created_by": user.get("id", ""),
                "created_at": now_iso(), "updated_at": now_iso(),
            }
            await db.journal_entries.insert_one(entry)
            
            exp_bal = float(exp_acct.get("balance", 0)) + paid_amt
            await db.coa_accounts.update_one(
                {"id": exp_acct["id"]},
                {"$set": {"balance": _fmt_d(exp_bal), "updated_at": now_iso()}}
            )
            bank_bal = float(bank_acct.get("balance", 0)) - paid_amt
            await db.coa_accounts.update_one(
                {"id": bank_acct["id"]},
                {"$set": {"balance": _fmt_d(bank_bal), "updated_at": now_iso()}}
            )
        
        body["amount_paid"] = paid_amt
        body["balance_due"] = 0
    
    await db.accounting_bills.update_one(
        {"id": bid},
        {"$set": {**body, "updated_at": now_iso()}}
    )
    return {"ok": True}

# ── Financial Reports ──
@accounting_router.get("/reports/trial-balance")
async def trial_balance(user=Depends(current_user)):
    accounts = await db.coa_accounts.find(
        {"workspace_id": user["workspace_id"], "is_active": True},
        {"_id": 0}
    ).to_list(500)
    
    rows = []
    for acct in accounts:
        bal = float(acct.get("balance", 0))
        norm = acct.get("normal_balance", "debit")
        rows.append({
            "code": acct.get("code", ""),
            "name": acct.get("name", ""),
            "account_type": acct.get("account_type", ""),
            "debit": bal if norm == "debit" else 0.0,
            "credit": bal if norm == "credit" else 0.0,
        })
    
    total_d = sum(r["debit"] for r in rows)
    total_c = sum(r["credit"] for r in rows)
    return {"rows": rows, "total_debit": _fmt_d(total_d), "total_credit": _fmt_d(total_c), "balanced": abs(total_d - total_c) < 0.01}

@accounting_router.get("/reports/pnl")
async def pnl_report(start_date: Optional[str] = None, end_date: Optional[str] = None, user=Depends(current_user)):
    query = {"workspace_id": user["workspace_id"]}
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        query["date"] = {**query.get("date", {}), "$lte": end_date}
    
    entries = await db.journal_entries.find(query, {"_id": 0}).to_list(1000)
    
    revenue = Decimal("0")
    expenses = Decimal("0")
    
    for entry in entries:
        for line in entry.get("lines", []):
            acct = await db.coa_accounts.find_one({"id": line["account_id"]}, {"_id": 0, "account_type": 1})
            if acct:
                at = acct.get("account_type", "")
                if at == REVENUE:
                    revenue += Decimal(str(line.get("credit", 0))) - Decimal(str(line.get("debit", 0)))
                elif at == EXPENSE:
                    expenses += Decimal(str(line.get("debit", 0))) - Decimal(str(line.get("credit", 0)))
    
    net = revenue - expenses
    return {
        "revenue": _fmt_d(revenue),
        "expenses": _fmt_d(expenses),
        "net_income": _fmt_d(net),
    }

@accounting_router.get("/reports/balance-sheet")
async def balance_sheet(user=Depends(current_user)):
    accounts = await db.coa_accounts.find(
        {"workspace_id": user["workspace_id"], "is_active": True},
        {"_id": 0}
    ).to_list(500)
    
    assets = []
    liabilities = []
    equity = []
    total_assets = Decimal("0")
    total_liabilities = Decimal("0")
    total_equity = Decimal("0")
    
    for acct in accounts:
        at = acct.get("account_type", "")
        bal = Decimal(str(acct.get("balance", 0)))
        norm = acct.get("normal_balance", "debit")
        bal = bal if norm == "debit" else -bal
        
        entry = {"code": acct.get("code", ""), "name": acct.get("name", ""), "balance": _fmt_d(bal)}
        
        if at == ASSET:
            assets.append(entry)
            total_assets += bal
        elif at == LIABILITY:
            liabilities.append(entry)
            total_liabilities += bal
        elif at == EQUITY:
            equity.append(entry)
            total_equity += bal
    
    pnl = await pnl_report(user=user)
    net_income = Decimal(str(pnl["net_income"]))
    total_equity += net_income
    
    return {
        "assets": {"items": assets, "total": _fmt_d(total_assets)},
        "liabilities": {"items": liabilities, "total": _fmt_d(total_liabilities)},
        "equity": {"items": equity, "total": _fmt_d(total_equity)},
        "balanced": abs(total_assets - (total_liabilities + total_equity)) < 0.01,
    }

@accounting_router.get("/reports/ar-aging")
async def ar_aging_report(user=Depends(current_user)):
    invoices = await db.accounting_invoices.find(
        {"workspace_id": user["workspace_id"], "status": {"$in": ["sent", "overdue", "partially_paid"]}},
        {"_id": 0}
    ).to_list(200)
    
    today = now_iso()[:10]
    aging = {"0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    
    for inv in invoices:
        bal = float(inv.get("balance_due", 0))
        due = inv.get("due_date", today)
        try:
            from datetime import datetime as _dt
            d1 = _dt.fromisoformat(today)
            d2 = _dt.fromisoformat(due)
            days = (d1 - d2).days
            if days <= 30:
                aging["0_30"] += bal
            elif days <= 60:
                aging["31_60"] += bal
            elif days <= 90:
                aging["61_90"] += bal
            else:
                aging["90_plus"] += bal
        except Exception:
            aging["0_30"] += bal
    
    total = sum(aging.values())
    return {"aging": aging, "total_ar": _fmt_d(total)}

# ── Analytics ──
@accounting_router.get("/analytics")
async def get_analytics(user=Depends(current_user)):
    wid = user["workspace_id"]
    total_ar = sum(
        (i.get("balance_due", 0) for i in await db.accounting_invoices.find(
            {"workspace_id": wid, "status": {"$in": ["sent", "overdue", "partially_paid"]}},
            {"_id": 0, "balance_due": 1}
        ).to_list(500)),
        0.0
    )
    total_ap = sum(
        (b.get("balance_due", 0) for b in await db.accounting_bills.find(
            {"workspace_id": wid, "status": "unpaid"},
            {"_id": 0, "balance_due": 1}
        ).to_list(500)),
        0.0
    )
    return {
        "total_accounts": await db.coa_accounts.count_documents({"workspace_id": wid, "is_active": True}),
        "total_invoices": await db.accounting_invoices.count_documents({"workspace_id": wid}),
        "overdue_invoices": await db.accounting_invoices.count_documents({"workspace_id": wid, "status": "overdue"}),
        "unpaid_bills": await db.accounting_bills.count_documents({"workspace_id": wid, "status": "unpaid"}),
        "total_ar": _fmt_d(total_ar),
        "total_ap": _fmt_d(total_ap),
        "total_customers": await db.accounting_customers.count_documents({"workspace_id": wid}),
    }

# ── Settings ──
@accounting_router.get("/settings")
async def get_settings(user=Depends(current_user)):
    s = await db.accounting_settings.find_one({"workspace_id": user["workspace_id"]}, {"_id": 0})
    return s or {
        "fiscal_year_start": "01-01",
        "currency": "USD",
        "tax_rate": 0,
        "invoice_prefix": "INV-",
        "bill_prefix": "BILL-",
    }

@accounting_router.post("/settings")
async def update_settings(body: dict, user=Depends(current_user)):
    await db.accounting_settings.update_one(
        {"workspace_id": user["workspace_id"]},
        {"$set": body}, upsert=True,
    )
    return {"ok": True}

# ── Bulk Import ──
@accounting_router.post("/accounts/import")
async def import_accounts(body: dict, user=Depends(current_user)):
    accounts = body.get("accounts", [])
    created = 0
    for acct in accounts:
        at = acct.get("account_type", ASSET)
        if at not in (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE):
            continue
        account = {
            "id": new_id(), "workspace_id": user["workspace_id"],
            "code": acct.get("code", ""),
            "name": acct.get("name", "Imported"),
            "description": acct.get("description", ""),
            "account_type": at,
            "category": acct.get("category", ""),
            "normal_balance": "debit" if at in DEBIT_NORMAL_TYPES else "credit",
            "currency": "USD",
            "is_active": True,
            "balance": 0.0,
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.coa_accounts.insert_one(account)
        created += 1
    return {"created": created}

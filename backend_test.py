#!/usr/bin/env python3
"""
Backend test suite for Phase 2 Razorpay payment integration.
Tests real Razorpay order creation, signature verification, and payment flows.
"""

import requests
import hmac
import hashlib
import json
import time
import re

# Configuration
BASE_URL = "https://db251e20-8f0f-40df-9a95-b394b8919543.preview.emergentagent.com/api"
RAZORPAY_KEY_SECRET = "9OWbJ51h28pdf3cbswj43jtZ"
RAZORPAY_KEY_ID = "rzp_test_Tf43t5yhtz0b2g"

# Test state
session = requests.Session()
test_results = []

def log_result(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {test_name}")
    if details:
        print(f"  Details: {details}")
    test_results.append({"test": test_name, "passed": passed, "details": details})

def compute_razorpay_signature(razorpay_order_id, razorpay_payment_id):
    """Compute Razorpay Checkout signature using HMAC-SHA256"""
    message = f"{razorpay_order_id}|{razorpay_payment_id}"
    signature = hmac.new(
        RAZORPAY_KEY_SECRET.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return signature

def register_fresh_owner():
    """Register a fresh owner account for testing"""
    timestamp = int(time.time())
    email = f"test_owner_{timestamp}@test.com"
    password = "TestPass123"
    
    try:
        resp = session.post(f"{BASE_URL}/auth/register", json={
            "email": email,
            "password": password,
            "name": f"Test Owner {timestamp}"
        })
        
        if resp.status_code == 200:
            data = resp.json()
            log_result("Register fresh owner", True, f"Email: {email}")
            return {"email": email, "password": password, "user": data.get("user"), "org": data.get("org")}
        else:
            log_result("Register fresh owner", False, f"Status: {resp.status_code}, Body: {resp.text}")
            return None
    except Exception as e:
        log_result("Register fresh owner", False, f"Exception: {str(e)}")
        return None

def get_plans():
    """Get available plans"""
    try:
        resp = session.get(f"{BASE_URL}/plans")
        if resp.status_code == 200:
            plans = resp.json()
            log_result("Get plans", True, f"Found {len(plans)} plans")
            return plans
        else:
            log_result("Get plans", False, f"Status: {resp.status_code}")
            return []
    except Exception as e:
        log_result("Get plans", False, f"Exception: {str(e)}")
        return []

def test_case_1_live_order_creation(plan_id):
    """Test Case 1: LIVE ORDER CREATION - Real Razorpay order via API"""
    print("\n=== TEST CASE 1: LIVE ORDER CREATION ===")
    
    try:
        resp = session.post(f"{BASE_URL}/billing/checkout", json={
            "planId": plan_id,
            "interval": "monthly"
        })
        
        if resp.status_code != 200:
            log_result("TC1: Live order creation", False, f"Status: {resp.status_code}, Body: {resp.text}")
            return None
        
        data = resp.json()
        
        # Assertions
        checks = []
        checks.append(("gateway == 'razorpay'", data.get("gateway") == "razorpay"))
        checks.append(("stub == false", data.get("stub") == False))
        checks.append(("razorpayOrderId present", bool(data.get("razorpayOrderId"))))
        checks.append(("razorpayOrderId starts with 'order_'", str(data.get("razorpayOrderId", "")).startswith("order_")))
        checks.append(("currency == 'INR'", data.get("currency") == "INR"))
        checks.append(("keyId == RAZORPAY_KEY_ID", data.get("keyId") == RAZORPAY_KEY_ID))
        checks.append(("totals present", "totals" in data))
        
        if "totals" in data:
            totals = data["totals"]
            expected_paise = round(totals["total"] * 100)
            actual_paise = data.get("amountPaise")
            checks.append(("amountPaise == round(totals.total*100)", actual_paise == expected_paise))
        
        all_passed = all(check[1] for check in checks)
        details = ", ".join([f"{check[0]}: {check[1]}" for check in checks])
        
        log_result("TC1: Live order creation", all_passed, details)
        
        if all_passed:
            return {
                "orderId": data.get("orderId"),
                "razorpayOrderId": data.get("razorpayOrderId"),
                "totals": data.get("totals")
            }
        return None
        
    except Exception as e:
        log_result("TC1: Live order creation", False, f"Exception: {str(e)}")
        return None

def test_case_2_confirm_valid_signature(order):
    """Test Case 2: CONFIRM - VALID SIGNATURE"""
    print("\n=== TEST CASE 2: CONFIRM - VALID SIGNATURE ===")
    
    try:
        # Forge valid signature
        razorpay_payment_id = "pay_test123"
        razorpay_signature = compute_razorpay_signature(order["razorpayOrderId"], razorpay_payment_id)
        
        resp = session.post(f"{BASE_URL}/billing/confirm", json={
            "orderId": order["orderId"],
            "razorpay_order_id": order["razorpayOrderId"],
            "razorpay_payment_id": razorpay_payment_id,
            "razorpay_signature": razorpay_signature
        })
        
        if resp.status_code != 200:
            log_result("TC2: Valid signature confirm", False, f"Status: {resp.status_code}, Body: {resp.text}")
            return None
        
        data = resp.json()
        
        # Assertions
        checks = []
        checks.append(("ok == true", data.get("ok") == True))
        checks.append(("invoice present", "invoice" in data))
        
        if "invoice" in data:
            invoice = data["invoice"]
            checks.append(("invoice.number matches /NAI-\\d{4}-\\d{5}/", bool(re.match(r"NAI-\d{4}-\d{5}", invoice.get("number", "")))))
            checks.append(("invoice.total == totals.total", invoice.get("total") == order["totals"]["total"]))
        
        checks.append(("entitlements present", "entitlements" in data))
        
        all_passed = all(check[1] for check in checks)
        details = ", ".join([f"{check[0]}: {check[1]}" for check in checks])
        
        log_result("TC2: Valid signature confirm", all_passed, details)
        
        if all_passed:
            return data
        return None
        
    except Exception as e:
        log_result("TC2: Valid signature confirm", False, f"Exception: {str(e)}")
        return None

def test_case_3_confirm_idempotent(order):
    """Test Case 3: CONFIRM - IDEMPOTENT"""
    print("\n=== TEST CASE 3: CONFIRM - IDEMPOTENT ===")
    
    try:
        # Repeat the exact same confirm call
        razorpay_payment_id = "pay_test123"
        razorpay_signature = compute_razorpay_signature(order["razorpayOrderId"], razorpay_payment_id)
        
        resp = session.post(f"{BASE_URL}/billing/confirm", json={
            "orderId": order["orderId"],
            "razorpay_order_id": order["razorpayOrderId"],
            "razorpay_payment_id": razorpay_payment_id,
            "razorpay_signature": razorpay_signature
        })
        
        if resp.status_code != 200:
            log_result("TC3: Idempotent confirm", False, f"Status: {resp.status_code}, Body: {resp.text}")
            return False
        
        data = resp.json()
        
        # Assertions
        checks = []
        checks.append(("ok == true", data.get("ok") == True))
        checks.append(("alreadyPaid == true", data.get("alreadyPaid") == True))
        
        all_passed = all(check[1] for check in checks)
        details = ", ".join([f"{check[0]}: {check[1]}" for check in checks])
        
        log_result("TC3: Idempotent confirm", all_passed, details)
        return all_passed
        
    except Exception as e:
        log_result("TC3: Idempotent confirm", False, f"Exception: {str(e)}")
        return False

def test_case_4_confirm_bad_signature(plan_id):
    """Test Case 4: CONFIRM - BAD SIGNATURE"""
    print("\n=== TEST CASE 4: CONFIRM - BAD SIGNATURE ===")
    
    try:
        # Use a fresh session for this test to avoid interference from previous upgrades
        timestamp = int(time.time())
        fresh_session = requests.Session()
        resp = fresh_session.post(f"{BASE_URL}/auth/register", json={
            "email": f"test_badsig_{timestamp}@test.com",
            "password": "TestPass123"
        })
        
        if resp.status_code != 200:
            log_result("TC4: Register fresh owner", False, f"Status: {resp.status_code}")
            return False
        
        # Create a new order
        resp = fresh_session.post(f"{BASE_URL}/billing/checkout", json={
            "planId": plan_id,
            "interval": "monthly"
        })
        
        if resp.status_code != 200:
            log_result("TC4: Bad signature - checkout", False, f"Status: {resp.status_code}")
            return False
        
        order_data = resp.json()
        
        # Confirm with bad signature
        resp = fresh_session.post(f"{BASE_URL}/billing/confirm", json={
            "orderId": order_data["orderId"],
            "razorpay_order_id": order_data["razorpayOrderId"],
            "razorpay_payment_id": "pay_test456",
            "razorpay_signature": "deadbeef"
        })
        
        # Should return 400
        checks = []
        checks.append(("status == 400", resp.status_code == 400))
        
        if resp.status_code == 400:
            data = resp.json()
            checks.append(("error contains 'signature'", "signature" in data.get("error", "").lower()))
        
        # Verify order was NOT fulfilled - check entitlements
        ent_resp = fresh_session.get(f"{BASE_URL}/me/entitlements")
        if ent_resp.status_code == 200:
            ent_data = ent_resp.json()
            plan_name = ent_data.get("plan", {}).get("name", "")
            checks.append(("plan still Free (not upgraded)", plan_name == "Free"))
        
        all_passed = all(check[1] for check in checks)
        details = ", ".join([f"{check[0]}: {check[1]}" for check in checks])
        
        log_result("TC4: Bad signature confirm", all_passed, details)
        return all_passed
        
    except Exception as e:
        log_result("TC4: Bad signature confirm", False, f"Exception: {str(e)}")
        return False

def test_case_5_confirm_missing_fields(plan_id):
    """Test Case 5: CONFIRM - MISSING FIELDS"""
    print("\n=== TEST CASE 5: CONFIRM - MISSING FIELDS ===")
    
    try:
        # Create a new order
        resp = session.post(f"{BASE_URL}/billing/checkout", json={
            "planId": plan_id,
            "interval": "monthly"
        })
        
        if resp.status_code != 200:
            log_result("TC5: Missing fields - checkout", False, f"Status: {resp.status_code}")
            return False
        
        order_data = resp.json()
        
        # Confirm with only orderId (no razorpay_* fields)
        resp = session.post(f"{BASE_URL}/billing/confirm", json={
            "orderId": order_data["orderId"]
        })
        
        # Should return 400
        checks = []
        checks.append(("status == 400", resp.status_code == 400))
        
        if resp.status_code == 400:
            data = resp.json()
            error_msg = data.get("error", "").lower()
            checks.append(("error mentions verification/required", "verification" in error_msg or "required" in error_msg))
        
        all_passed = all(check[1] for check in checks)
        details = ", ".join([f"{check[0]}: {check[1]}" for check in checks])
        
        log_result("TC5: Missing fields confirm", all_passed, details)
        return all_passed
        
    except Exception as e:
        log_result("TC5: Missing fields confirm", False, f"Exception: {str(e)}")
        return False

def test_case_6_confirm_order_mismatch(plan_id):
    """Test Case 6: CONFIRM - ORDER MISMATCH"""
    print("\n=== TEST CASE 6: CONFIRM - ORDER MISMATCH ===")
    
    try:
        # Create a new order
        resp = session.post(f"{BASE_URL}/billing/checkout", json={
            "planId": plan_id,
            "interval": "monthly"
        })
        
        if resp.status_code != 200:
            log_result("TC6: Order mismatch - checkout", False, f"Status: {resp.status_code}")
            return False
        
        order_data = resp.json()
        
        # Use wrong razorpay_order_id but compute signature over it
        wrong_order_id = "order_WRONG123"
        razorpay_payment_id = "pay_test789"
        razorpay_signature = compute_razorpay_signature(wrong_order_id, razorpay_payment_id)
        
        resp = session.post(f"{BASE_URL}/billing/confirm", json={
            "orderId": order_data["orderId"],
            "razorpay_order_id": wrong_order_id,
            "razorpay_payment_id": razorpay_payment_id,
            "razorpay_signature": razorpay_signature
        })
        
        # Should return 400
        checks = []
        checks.append(("status == 400", resp.status_code == 400))
        
        if resp.status_code == 400:
            data = resp.json()
            error_msg = data.get("error", "").lower()
            checks.append(("error mentions 'mismatch'", "mismatch" in error_msg))
        
        all_passed = all(check[1] for check in checks)
        details = ", ".join([f"{check[0]}: {check[1]}" for check in checks])
        
        log_result("TC6: Order mismatch confirm", all_passed, details)
        return all_passed
        
    except Exception as e:
        log_result("TC6: Order mismatch confirm", False, f"Exception: {str(e)}")
        return False

def test_case_7_zero_amount_stub_path():
    """Test Case 7: ZERO-AMOUNT (STUB) PATH - 100% coupon"""
    print("\n=== TEST CASE 7: ZERO-AMOUNT (STUB) PATH ===")
    
    try:
        # First, login as super admin to create 100% coupon
        admin_session = requests.Session()
        resp = admin_session.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@niuron.ai",
            "password": "Admin@12345"
        })
        
        if resp.status_code != 200:
            log_result("TC7: Admin login", False, f"Status: {resp.status_code}")
            return False
        
        # Create 100% coupon
        resp = admin_session.post(f"{BASE_URL}/admin/coupons", json={
            "code": "QAFREE100",
            "type": "percent",
            "value": 100
        })
        
        # 409 is OK if coupon already exists
        if resp.status_code not in [200, 409]:
            log_result("TC7: Create 100% coupon", False, f"Status: {resp.status_code}")
            return False
        
        log_result("TC7: Create 100% coupon", True, "Coupon QAFREE100 created/exists")
        
        # Register a fresh owner for this test
        timestamp = int(time.time())
        fresh_session = requests.Session()
        resp = fresh_session.post(f"{BASE_URL}/auth/register", json={
            "email": f"test_free_{timestamp}@test.com",
            "password": "TestPass123"
        })
        
        if resp.status_code != 200:
            log_result("TC7: Register fresh owner", False, f"Status: {resp.status_code}")
            return False
        
        # Get plans
        resp = fresh_session.get(f"{BASE_URL}/plans")
        plans = resp.json()
        starter_plan = next((p for p in plans if p["name"] == "Starter"), None)
        
        if not starter_plan:
            log_result("TC7: Find Starter plan", False, "Starter plan not found")
            return False
        
        # Validate coupon
        resp = fresh_session.post(f"{BASE_URL}/billing/coupon/validate", json={
            "planId": starter_plan["id"],
            "interval": "monthly",
            "couponCode": "QAFREE100"
        })
        
        if resp.status_code != 200:
            log_result("TC7: Validate 100% coupon", False, f"Status: {resp.status_code}")
            return False
        
        validate_data = resp.json()
        checks = []
        checks.append(("totals.total == 0", validate_data.get("totals", {}).get("total") == 0))
        
        # Checkout with 100% coupon
        resp = fresh_session.post(f"{BASE_URL}/billing/checkout", json={
            "planId": starter_plan["id"],
            "interval": "monthly",
            "couponCode": "QAFREE100"
        })
        
        if resp.status_code != 200:
            log_result("TC7: Checkout with 100% coupon", False, f"Status: {resp.status_code}")
            return False
        
        checkout_data = resp.json()
        checks.append(("gateway == 'stub'", checkout_data.get("gateway") == "stub"))
        checks.append(("stub == true", checkout_data.get("stub") == True))
        
        # Confirm (no razorpay fields needed for stub)
        resp = fresh_session.post(f"{BASE_URL}/billing/confirm", json={
            "orderId": checkout_data["orderId"]
        })
        
        if resp.status_code != 200:
            log_result("TC7: Confirm stub order", False, f"Status: {resp.status_code}, Body: {resp.text}")
            return False
        
        confirm_data = resp.json()
        checks.append(("ok == true", confirm_data.get("ok") == True))
        
        # Check entitlements upgraded to Starter
        resp = fresh_session.get(f"{BASE_URL}/me/entitlements")
        if resp.status_code == 200:
            ent_data = resp.json()
            plan_name = ent_data.get("plan", {}).get("name", "")
            checks.append(("plan upgraded to Starter", plan_name == "Starter"))
        
        all_passed = all(check[1] for check in checks)
        details = ", ".join([f"{check[0]}: {check[1]}" for check in checks])
        
        log_result("TC7: Zero-amount stub path", all_passed, details)
        return all_passed
        
    except Exception as e:
        log_result("TC7: Zero-amount stub path", False, f"Exception: {str(e)}")
        return False

def test_case_8_webhook_without_secret():
    """Test Case 8: WEBHOOK WITHOUT SECRET"""
    print("\n=== TEST CASE 8: WEBHOOK WITHOUT SECRET ===")
    
    try:
        # POST to webhook with any JSON body and no valid signature
        resp = requests.post(f"{BASE_URL}/billing/webhook", json={
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_test_webhook",
                        "order_id": "order_test_webhook"
                    }
                }
            }
        }, headers={
            "x-razorpay-signature": "invalid_signature",
            "x-razorpay-event-id": "evt_test_123"
        })
        
        # Should return 200 with received:true, ignored:true
        checks = []
        checks.append(("status == 200", resp.status_code == 200))
        
        if resp.status_code == 200:
            data = resp.json()
            checks.append(("received == true", data.get("received") == True))
            checks.append(("ignored == true", data.get("ignored") == True))
        
        all_passed = all(check[1] for check in checks)
        details = ", ".join([f"{check[0]}: {check[1]}" for check in checks])
        
        log_result("TC8: Webhook without secret", all_passed, details)
        return all_passed
        
    except Exception as e:
        log_result("TC8: Webhook without secret", False, f"Exception: {str(e)}")
        return False

def test_case_9_regression():
    """Test Case 9: REGRESSION - Ensure existing features still work"""
    print("\n=== TEST CASE 9: REGRESSION ===")
    
    all_checks = []
    
    try:
        # (a) Unauthenticated GET /api/campaigns -> 401
        anon_session = requests.Session()
        resp = anon_session.get(f"{BASE_URL}/campaigns")
        all_checks.append(("Unauthenticated /campaigns returns 401", resp.status_code == 401))
        
        # (b) Fresh Free owner: 1st campaign 200, 2nd campaign 402
        timestamp = int(time.time())
        free_session = requests.Session()
        resp = free_session.post(f"{BASE_URL}/auth/register", json={
            "email": f"test_limit_{timestamp}@test.com",
            "password": "TestPass123"
        })
        
        if resp.status_code == 200:
            # 1st campaign
            resp = free_session.post(f"{BASE_URL}/campaigns", json={
                "businessName": "Test Campaign 1"
            })
            all_checks.append(("Free owner 1st campaign returns 200", resp.status_code == 200))
            
            # 2nd campaign
            resp = free_session.post(f"{BASE_URL}/campaigns", json={
                "businessName": "Test Campaign 2"
            })
            all_checks.append(("Free owner 2nd campaign returns 402", resp.status_code == 402))
            
            if resp.status_code == 402:
                data = resp.json()
                all_checks.append(("402 error is 'limit_reached'", data.get("error") == "limit_reached"))
        
        # (c) Non-admin GET /api/admin/metrics -> 403
        resp = free_session.get(f"{BASE_URL}/admin/metrics")
        all_checks.append(("Non-admin /admin/metrics returns 403", resp.status_code == 403))
        
        # (d) GET /api/billing/invoices returns array
        # Use the main session (which has a paid subscription from earlier tests)
        resp = session.get(f"{BASE_URL}/billing/invoices")
        if resp.status_code == 200:
            invoices = resp.json()
            all_checks.append(("GET /billing/invoices returns array", isinstance(invoices, list)))
        else:
            all_checks.append(("GET /billing/invoices returns array", False))
        
        # (e) GET /api/plans (no auth) returns 4 public plans
        resp = anon_session.get(f"{BASE_URL}/plans")
        if resp.status_code == 200:
            plans = resp.json()
            all_checks.append(("GET /plans returns plans", len(plans) >= 4))
        else:
            all_checks.append(("GET /plans returns plans", False))
        
    except Exception as e:
        log_result("TC9: Regression tests", False, f"Exception: {str(e)}")
        return False
    
    all_passed = all(all_checks)
    details = ", ".join([f"{check[0]}: {check[1]}" for check in all_checks])
    
    log_result("TC9: Regression tests", all_passed, details)
    return all_passed

def main():
    """Main test runner"""
    print("=" * 80)
    print("PHASE 2 RAZORPAY PAYMENT INTEGRATION TEST SUITE")
    print("=" * 80)
    
    # Setup: Register fresh owner
    owner = register_fresh_owner()
    if not owner:
        print("\n❌ FATAL: Could not register fresh owner. Aborting tests.")
        return
    
    # Get plans
    plans = get_plans()
    if not plans:
        print("\n❌ FATAL: Could not get plans. Aborting tests.")
        return
    
    # Pick a paid plan (Starter or Growth)
    paid_plan = next((p for p in plans if p["name"] in ["Starter", "Growth"]), None)
    if not paid_plan:
        print("\n❌ FATAL: Could not find Starter or Growth plan. Aborting tests.")
        return
    
    print(f"\nUsing plan: {paid_plan['name']} (ID: {paid_plan['id']})")
    
    # Test Case 1: Live order creation
    order = test_case_1_live_order_creation(paid_plan["id"])
    if not order:
        print("\n❌ FATAL: Test Case 1 failed. Cannot proceed with dependent tests.")
        return
    
    # Test Case 2: Valid signature confirm
    confirm_result = test_case_2_confirm_valid_signature(order)
    if not confirm_result:
        print("\n⚠️  WARNING: Test Case 2 failed. Some dependent tests may fail.")
    
    # Test Case 3: Idempotent confirm
    test_case_3_confirm_idempotent(order)
    
    # Test Case 4: Bad signature
    test_case_4_confirm_bad_signature(paid_plan["id"])
    
    # Test Case 5: Missing fields
    test_case_5_confirm_missing_fields(paid_plan["id"])
    
    # Test Case 6: Order mismatch
    test_case_6_confirm_order_mismatch(paid_plan["id"])
    
    # Test Case 7: Zero-amount stub path
    test_case_7_zero_amount_stub_path()
    
    # Test Case 8: Webhook without secret
    test_case_8_webhook_without_secret()
    
    # Test Case 9: Regression
    test_case_9_regression()
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for r in test_results if r["passed"])
    total = len(test_results)
    
    print(f"\nTotal: {passed}/{total} tests passed")
    print("\nDetailed Results:")
    for r in test_results:
        status = "✅" if r["passed"] else "❌"
        print(f"{status} {r['test']}")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Backend API Test Suite for niuronai - SaaS Backend Layer (Milestone 1)
Tests AUTH, TENANCY, ENTITLEMENTS, BILLING, and ADMIN endpoints
"""

import requests
import json
import time
import random
from typing import Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

# Base URL from environment
BASE_URL = "https://review-and-build-7.preview.emergentagent.com/api"

# Test state to share data between tests
test_state = {
    "admin_token": None,
    "admin_cookie": None,
    "owner_a_email": None,
    "owner_a_token": None,
    "owner_a_cookie": None,
    "owner_a_org_id": None,
    "owner_a_campaign_id": None,
    "owner_b_email": None,
    "owner_b_token": None,
    "owner_b_cookie": None,
    "owner_b_org_id": None,
    "free_owner_email": None,
    "free_owner_token": None,
    "free_owner_cookie": None,
    "free_owner_org_id": None,
    "growth_plan_id": None,
    "starter_plan_id": None,
    "coupon_qa50_id": None,
    "coupon_qaflat_id": None,
    "order_id": None,
    "invoice_number": None,
    "qa_plan_id": None,
    "customer_user_id": None,
}

def log_test(name: str, status: str, details: str = ""):
    """Log test results"""
    symbol = "✅" if status == "PASS" else "❌"
    print(f"\n{symbol} {name}: {status}")
    if details:
        print(f"   {details}")

def make_request(method: str, endpoint: str, data: Optional[Dict] = None, 
                 token: Optional[str] = None, cookie: Optional[str] = None,
                 timeout: int = 30) -> tuple:
    """Make HTTP request and return (response, error)"""
    url = f"{BASE_URL}{endpoint}"
    headers = {}
    
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    if cookie:
        headers["Cookie"] = cookie
    
    try:
        if method == "GET":
            resp = requests.get(url, headers=headers, timeout=timeout)
        elif method == "POST":
            resp = requests.post(url, json=data, headers=headers, timeout=timeout)
        elif method == "PUT":
            resp = requests.put(url, json=data, headers=headers, timeout=timeout)
        elif method == "DELETE":
            resp = requests.delete(url, headers=headers, timeout=timeout)
        elif method == "PATCH":
            resp = requests.patch(url, json=data, headers=headers, timeout=timeout)
        else:
            return None, f"Unsupported method: {method}"
        
        return resp, None
    except Exception as e:
        return None, str(e)

def extract_cookie(response):
    """Extract nai_session cookie from Set-Cookie header"""
    set_cookie = response.headers.get('Set-Cookie', '')
    if 'nai_session=' in set_cookie:
        # Extract the cookie value
        start = set_cookie.find('nai_session=') + len('nai_session=')
        end = set_cookie.find(';', start)
        if end == -1:
            end = len(set_cookie)
        cookie_value = set_cookie[start:end]
        return f"nai_session={cookie_value}"
    return None

# ==================== A) AUTH & TENANCY ====================

def test_a1_register_valid():
    """A1: POST /api/auth/register with valid data -> 200, returns user/org/entitlements + Set-Cookie"""
    print("\n" + "="*80)
    print("TEST A1: Register Valid Owner Account")
    print("="*80)
    
    rand = random.randint(1000, 9999)
    email = f"qa_owner_{rand}@test.com"
    test_state["owner_a_email"] = email
    
    data = {
        "email": email,
        "password": "secret123",
        "name": "QA Owner A"
    }
    
    resp, err = make_request("POST", "/auth/register", data)
    
    if err:
        log_test("POST /api/auth/register (valid)", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("POST /api/auth/register (valid)", "FAIL", 
                f"Expected 200, got {resp.status_code}. Response: {resp.text[:500]}")
        return False
    
    try:
        result = resp.json()
        
        # Verify response structure
        if "user" not in result or "org" not in result or "entitlements" not in result:
            log_test("POST /api/auth/register (valid)", "FAIL", 
                    f"Missing required fields. Got: {list(result.keys())}")
            return False
        
        # Verify user role is 'owner'
        if result["user"].get("role") != "owner":
            log_test("POST /api/auth/register (valid)", "FAIL", 
                    f"Expected role 'owner', got {result['user'].get('role')}")
            return False
        
        # Verify entitlements has plan.name 'Free'
        if result["entitlements"].get("plan", {}).get("name") != "Free":
            log_test("POST /api/auth/register (valid)", "FAIL", 
                    f"Expected plan 'Free', got {result['entitlements'].get('plan', {}).get('name')}")
            return False
        
        # Verify Set-Cookie header
        cookie = extract_cookie(resp)
        if not cookie:
            log_test("POST /api/auth/register (valid)", "FAIL", "No nai_session cookie in Set-Cookie header")
            return False
        
        # Save state
        test_state["owner_a_cookie"] = cookie
        test_state["owner_a_org_id"] = result["org"]["id"]
        
        log_test("POST /api/auth/register (valid)", "PASS", 
                f"Registered {email}, role={result['user']['role']}, plan={result['entitlements']['plan']['name']}, cookie set")
        return True
        
    except Exception as e:
        log_test("POST /api/auth/register (valid)", "FAIL", f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_a2_register_validation():
    """A2: Register validation - duplicate email -> 409, bad email -> 400, weak password -> 400"""
    print("\n" + "="*80)
    print("TEST A2: Register Validation")
    print("="*80)
    
    # A2a: Duplicate email -> 409
    data = {
        "email": test_state["owner_a_email"],
        "password": "secret123",
        "name": "Duplicate"
    }
    
    resp, err = make_request("POST", "/auth/register", data)
    
    if err:
        log_test("Register duplicate email", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 409:
        log_test("Register duplicate email", "FAIL", f"Expected 409, got {resp.status_code}")
        return False
    
    log_test("Register duplicate email", "PASS", "Correctly returned 409")
    
    # A2b: Bad email -> 400
    data = {
        "email": "not-an-email",
        "password": "secret123",
        "name": "Bad Email"
    }
    
    resp, err = make_request("POST", "/auth/register", data)
    
    if err:
        log_test("Register bad email", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 400:
        log_test("Register bad email", "FAIL", f"Expected 400, got {resp.status_code}")
        return False
    
    log_test("Register bad email", "PASS", "Correctly returned 400")
    
    # A2c: Weak password -> 400
    data = {
        "email": f"qa_test_{random.randint(1000, 9999)}@test.com",
        "password": "123",
        "name": "Weak Password"
    }
    
    resp, err = make_request("POST", "/auth/register", data)
    
    if err:
        log_test("Register weak password", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 400:
        log_test("Register weak password", "FAIL", f"Expected 400, got {resp.status_code}")
        return False
    
    log_test("Register weak password", "PASS", "Correctly returned 400")
    return True

def test_a3_login():
    """A3: POST /api/auth/login with correct creds -> 200 + cookie; wrong password -> 401"""
    print("\n" + "="*80)
    print("TEST A3: Login")
    print("="*80)
    
    # A3a: Correct credentials
    data = {
        "email": test_state["owner_a_email"],
        "password": "secret123"
    }
    
    resp, err = make_request("POST", "/auth/login", data)
    
    if err:
        log_test("Login correct credentials", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("Login correct credentials", "FAIL", 
                f"Expected 200, got {resp.status_code}. Response: {resp.text[:500]}")
        return False
    
    try:
        result = resp.json()
        
        # Verify cookie
        cookie = extract_cookie(resp)
        if not cookie:
            log_test("Login correct credentials", "FAIL", "No nai_session cookie in Set-Cookie header")
            return False
        
        log_test("Login correct credentials", "PASS", f"Logged in {test_state['owner_a_email']}, cookie set")
        
    except Exception as e:
        log_test("Login correct credentials", "FAIL", f"Error: {e}")
        return False
    
    # A3b: Wrong password -> 401
    data = {
        "email": test_state["owner_a_email"],
        "password": "wrongpassword"
    }
    
    resp, err = make_request("POST", "/auth/login", data)
    
    if err:
        log_test("Login wrong password", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 401:
        log_test("Login wrong password", "FAIL", f"Expected 401, got {resp.status_code}")
        return False
    
    log_test("Login wrong password", "PASS", "Correctly returned 401")
    return True

def test_a4_auth_me():
    """A4: GET /api/auth/me with cookie -> returns user+entitlements; without cookie -> {user:null}"""
    print("\n" + "="*80)
    print("TEST A4: Auth Me")
    print("="*80)
    
    # A4a: With cookie
    resp, err = make_request("GET", "/auth/me", cookie=test_state["owner_a_cookie"])
    
    if err:
        log_test("GET /api/auth/me (with cookie)", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("GET /api/auth/me (with cookie)", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        result = resp.json()
        
        if "user" not in result or result["user"] is None:
            log_test("GET /api/auth/me (with cookie)", "FAIL", "Expected user object, got null")
            return False
        
        if "entitlements" not in result:
            log_test("GET /api/auth/me (with cookie)", "FAIL", "Missing entitlements")
            return False
        
        log_test("GET /api/auth/me (with cookie)", "PASS", 
                f"Returned user {result['user']['email']}, plan {result['entitlements']['plan']['name']}")
        
    except Exception as e:
        log_test("GET /api/auth/me (with cookie)", "FAIL", f"Error: {e}")
        return False
    
    # A4b: Without cookie
    resp, err = make_request("GET", "/auth/me")
    
    if err:
        log_test("GET /api/auth/me (no cookie)", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("GET /api/auth/me (no cookie)", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        result = resp.json()
        
        if result.get("user") is not None:
            log_test("GET /api/auth/me (no cookie)", "FAIL", f"Expected user:null, got {result.get('user')}")
            return False
        
        log_test("GET /api/auth/me (no cookie)", "PASS", "Correctly returned {user:null}")
        return True
        
    except Exception as e:
        log_test("GET /api/auth/me (no cookie)", "FAIL", f"Error: {e}")
        return False

def test_a5_unauthenticated_endpoints():
    """A5: Unauthenticated requests to owner endpoints -> 401"""
    print("\n" + "="*80)
    print("TEST A5: Unauthenticated Endpoint Access")
    print("="*80)
    
    endpoints = [
        ("GET", "/campaigns"),
        ("GET", "/reviews"),
        ("GET", "/audits"),
        ("POST", "/seed"),
    ]
    
    all_passed = True
    
    for method, endpoint in endpoints:
        resp, err = make_request(method, endpoint)
        
        if err:
            log_test(f"{method} {endpoint} (no auth)", "FAIL", f"Request failed: {err}")
            all_passed = False
            continue
        
        if resp.status_code != 401:
            log_test(f"{method} {endpoint} (no auth)", "FAIL", 
                    f"Expected 401, got {resp.status_code}")
            all_passed = False
        else:
            log_test(f"{method} {endpoint} (no auth)", "PASS", "Correctly returned 401")
    
    return all_passed

def test_a6_tenant_isolation():
    """A6: ISOLATION - register two accounts, verify data isolation"""
    print("\n" + "="*80)
    print("TEST A6: Tenant Isolation")
    print("="*80)
    
    # Register owner B
    rand = random.randint(1000, 9999)
    email_b = f"qa_owner_b_{rand}@test.com"
    test_state["owner_b_email"] = email_b
    
    data = {
        "email": email_b,
        "password": "secret123",
        "name": "QA Owner B"
    }
    
    resp, err = make_request("POST", "/auth/register", data)
    
    if err or resp.status_code != 200:
        log_test("Register owner B", "FAIL", f"Failed to register: {err or resp.status_code}")
        return False
    
    result = resp.json()
    test_state["owner_b_cookie"] = extract_cookie(resp)
    test_state["owner_b_org_id"] = result["org"]["id"]
    
    log_test("Register owner B", "PASS", f"Registered {email_b}")
    
    # As owner A, seed data
    resp, err = make_request("POST", "/seed", cookie=test_state["owner_a_cookie"])
    
    if err or resp.status_code != 200:
        log_test("Owner A seed", "FAIL", f"Failed to seed: {err or resp.status_code}")
        return False
    
    log_test("Owner A seed", "PASS", "Seeded demo data for owner A")
    
    # As owner A, get campaigns (should see 3)
    resp, err = make_request("GET", "/campaigns", cookie=test_state["owner_a_cookie"])
    
    if err or resp.status_code != 200:
        log_test("Owner A get campaigns", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    campaigns_a = resp.json()
    
    if len(campaigns_a) != 3:
        log_test("Owner A get campaigns", "FAIL", f"Expected 3 campaigns, got {len(campaigns_a)}")
        return False
    
    test_state["owner_a_campaign_id"] = campaigns_a[0]["id"]
    
    log_test("Owner A get campaigns", "PASS", f"Owner A sees {len(campaigns_a)} campaigns")
    
    # As owner B, get campaigns (should see 0)
    resp, err = make_request("GET", "/campaigns", cookie=test_state["owner_b_cookie"])
    
    if err or resp.status_code != 200:
        log_test("Owner B get campaigns", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    campaigns_b = resp.json()
    
    if len(campaigns_b) != 0:
        log_test("Owner B get campaigns", "FAIL", f"Expected 0 campaigns, got {len(campaigns_b)}")
        return False
    
    log_test("Owner B get campaigns", "PASS", "Owner B sees 0 campaigns (isolated)")
    
    # As owner B, try to access owner A's campaign -> 404
    resp, err = make_request("GET", f"/campaigns/{test_state['owner_a_campaign_id']}", 
                            cookie=test_state["owner_b_cookie"])
    
    if err:
        log_test("Owner B access A's campaign", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 404:
        log_test("Owner B access A's campaign", "FAIL", 
                f"Expected 404, got {resp.status_code} (should not access another org's data)")
        return False
    
    log_test("Owner B access A's campaign", "PASS", "Correctly returned 404 (tenant isolation working)")
    return True

# ==================== B) ENTITLEMENTS / LIMITS ====================

def test_b7_get_plans():
    """B7: GET /api/plans (no auth) -> array of 4 public plans sorted by sortOrder"""
    print("\n" + "="*80)
    print("TEST B7: Get Public Plans")
    print("="*80)
    
    resp, err = make_request("GET", "/plans")
    
    if err:
        log_test("GET /api/plans", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("GET /api/plans", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        plans = resp.json()
        
        if not isinstance(plans, list):
            log_test("GET /api/plans", "FAIL", f"Expected array, got {type(plans)}")
            return False
        
        if len(plans) < 4:
            log_test("GET /api/plans", "FAIL", f"Expected at least 4 plans, got {len(plans)}")
            return False
        
        # Verify plan names
        plan_names = [p["name"] for p in plans]
        expected_names = ["Free", "Starter", "Growth", "Pro"]
        
        for name in expected_names:
            if name not in plan_names:
                log_test("GET /api/plans", "FAIL", f"Missing plan: {name}")
                return False
        
        # Verify sorted by sortOrder
        for i in range(len(plans) - 1):
            if plans[i].get("sortOrder", 0) > plans[i+1].get("sortOrder", 0):
                log_test("GET /api/plans", "FAIL", "Plans not sorted by sortOrder")
                return False
        
        # Verify each plan has limits, features, prices.INR
        for plan in plans:
            if "limits" not in plan or "features" not in plan:
                log_test("GET /api/plans", "FAIL", f"Plan {plan['name']} missing limits or features")
                return False
            
            if "prices" not in plan or "INR" not in plan["prices"]:
                log_test("GET /api/plans", "FAIL", f"Plan {plan['name']} missing prices.INR")
                return False
        
        # Save Growth and Starter plan IDs
        for plan in plans:
            if plan["name"] == "Growth":
                test_state["growth_plan_id"] = plan["id"]
            elif plan["name"] == "Starter":
                test_state["starter_plan_id"] = plan["id"]
        
        log_test("GET /api/plans", "PASS", 
                f"Retrieved {len(plans)} plans: {', '.join(plan_names)}, sorted correctly")
        return True
        
    except Exception as e:
        log_test("GET /api/plans", "FAIL", f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_b8_campaign_limit():
    """B8: Fresh Free account - create 1 campaign OK, 2nd campaign -> 402 limit_reached"""
    print("\n" + "="*80)
    print("TEST B8: Campaign Limit Enforcement")
    print("="*80)
    
    # Register a fresh Free account
    rand = random.randint(1000, 9999)
    email = f"qa_free_{rand}@test.com"
    test_state["free_owner_email"] = email
    
    data = {
        "email": email,
        "password": "secret123",
        "name": "QA Free Owner"
    }
    
    resp, err = make_request("POST", "/auth/register", data)
    
    if err or resp.status_code != 200:
        log_test("Register free owner", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    result = resp.json()
    test_state["free_owner_cookie"] = extract_cookie(resp)
    test_state["free_owner_org_id"] = result["org"]["id"]
    
    log_test("Register free owner", "PASS", f"Registered {email}")
    
    # Create first campaign -> 200
    data = {"businessName": "Test Business 1"}
    resp, err = make_request("POST", "/campaigns", data, cookie=test_state["free_owner_cookie"])
    
    if err or resp.status_code != 200:
        log_test("Create campaign 1", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    log_test("Create campaign 1", "PASS", "Created first campaign successfully")
    
    # Create second campaign -> 402
    data = {"businessName": "Test Business 2"}
    resp, err = make_request("POST", "/campaigns", data, cookie=test_state["free_owner_cookie"])
    
    if err:
        log_test("Create campaign 2 (limit)", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 402:
        log_test("Create campaign 2 (limit)", "FAIL", 
                f"Expected 402, got {resp.status_code}. Response: {resp.text[:500]}")
        return False
    
    try:
        result = resp.json()
        
        # Verify error structure
        if result.get("error") != "limit_reached":
            log_test("Create campaign 2 (limit)", "FAIL", 
                    f"Expected error='limit_reached', got {result.get('error')}")
            return False
        
        if result.get("limitKey") != "campaigns":
            log_test("Create campaign 2 (limit)", "FAIL", 
                    f"Expected limitKey='campaigns', got {result.get('limitKey')}")
            return False
        
        if result.get("currentPlan") != "Free":
            log_test("Create campaign 2 (limit)", "FAIL", 
                    f"Expected currentPlan='Free', got {result.get('currentPlan')}")
            return False
        
        if result.get("upgradeUrl") != "/billing":
            log_test("Create campaign 2 (limit)", "FAIL", 
                    f"Expected upgradeUrl='/billing', got {result.get('upgradeUrl')}")
            return False
        
        log_test("Create campaign 2 (limit)", "PASS", 
                f"Correctly returned 402 with error='limit_reached', limitKey='campaigns', currentPlan='Free', upgradeUrl='/billing'")
        return True
        
    except Exception as e:
        log_test("Create campaign 2 (limit)", "FAIL", f"Error: {e}")
        return False

def test_b9_entitlements():
    """B9: GET /api/me/entitlements -> has plan, features, limits, usage, remaining"""
    print("\n" + "="*80)
    print("TEST B9: Get Entitlements")
    print("="*80)
    
    resp, err = make_request("GET", "/me/entitlements", cookie=test_state["free_owner_cookie"])
    
    if err:
        log_test("GET /api/me/entitlements", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("GET /api/me/entitlements", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        ent = resp.json()
        
        # Verify structure
        required_fields = ["plan", "features", "limits", "usage", "remaining"]
        missing = [f for f in required_fields if f not in ent]
        
        if missing:
            log_test("GET /api/me/entitlements", "FAIL", f"Missing fields: {missing}")
            return False
        
        # Verify remaining.campaigns should be 0 (hit limit)
        if ent["remaining"].get("campaigns") != 0:
            log_test("GET /api/me/entitlements", "FAIL", 
                    f"Expected remaining.campaigns=0, got {ent['remaining'].get('campaigns')}")
            return False
        
        log_test("GET /api/me/entitlements", "PASS", 
                f"Plan={ent['plan']['name']}, limits={ent['limits']}, usage={ent['usage']}, remaining.campaigns=0")
        return True
        
    except Exception as e:
        log_test("GET /api/me/entitlements", "FAIL", f"Error: {e}")
        return False

def test_b10_feature_gate():
    """B10: automated_replies feature gate on Free -> 402 feature_locked"""
    print("\n" + "="*80)
    print("TEST B10: Feature Gate (automated_replies)")
    print("="*80)
    
    # POST /api/reviews/automate should return 402 feature_locked for Free plan
    resp, err = make_request("POST", "/reviews/automate", {}, cookie=test_state["free_owner_cookie"])
    
    if err:
        log_test("POST /api/reviews/automate (Free)", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 402:
        log_test("POST /api/reviews/automate (Free)", "FAIL", 
                f"Expected 402, got {resp.status_code}. Response: {resp.text[:500]}")
        return False
    
    try:
        result = resp.json()
        
        # Verify error structure
        if result.get("error") != "feature_locked":
            log_test("POST /api/reviews/automate (Free)", "FAIL", 
                    f"Expected error='feature_locked', got {result.get('error')}")
            return False
        
        if result.get("featureKey") != "automated_replies":
            log_test("POST /api/reviews/automate (Free)", "FAIL", 
                    f"Expected featureKey='automated_replies', got {result.get('featureKey')}")
            return False
        
        log_test("POST /api/reviews/automate (Free)", "PASS", 
                f"Correctly returned 402 with error='feature_locked', featureKey='automated_replies'")
        return True
        
    except Exception as e:
        log_test("POST /api/reviews/automate (Free)", "FAIL", f"Error: {e}")
        return False

# ==================== C) BILLING & COUPONS ====================

def test_c11_admin_create_coupons():
    """C11: As super admin, create coupons QA50 (percent) and QAFLAT (fixed)"""
    print("\n" + "="*80)
    print("TEST C11: Admin Create Coupons")
    print("="*80)
    
    # Login as super admin
    data = {
        "email": "admin@niuron.ai",
        "password": "Admin@12345"
    }
    
    resp, err = make_request("POST", "/auth/login", data)
    
    if err or resp.status_code != 200:
        log_test("Admin login", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    result = resp.json()
    test_state["admin_cookie"] = extract_cookie(resp)
    
    if result.get("role") not in ["admin", "super_admin"]:
        log_test("Admin login", "FAIL", f"Expected admin role, got {result.get('role')}")
        return False
    
    log_test("Admin login", "PASS", f"Logged in as {result['user']['email']}, role={result['role']}")
    
    # Create QA50 coupon (percent)
    data = {
        "code": "QA50",
        "type": "percent",
        "value": 50
    }
    
    resp, err = make_request("POST", "/admin/coupons", data, cookie=test_state["admin_cookie"])
    
    if err:
        log_test("Create QA50 coupon", "FAIL", f"Request failed: {err}")
        return False
    
    # If coupon already exists (409), that's OK
    if resp.status_code == 409:
        log_test("Create QA50 coupon", "PASS", "Coupon QA50 already exists (OK)")
        # Get existing coupon ID
        resp, err = make_request("GET", "/admin/coupons", cookie=test_state["admin_cookie"])
        if resp.status_code == 200:
            coupons = resp.json()
            for c in coupons:
                if c["code"] == "QA50":
                    test_state["coupon_qa50_id"] = c["id"]
                    break
    elif resp.status_code != 200:
        log_test("Create QA50 coupon", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    else:
        result = resp.json()
        test_state["coupon_qa50_id"] = result["id"]
        log_test("Create QA50 coupon", "PASS", f"Created QA50 (percent, 50%)")
    
    # Create QAFLAT coupon (fixed)
    data = {
        "code": "QAFLAT",
        "type": "fixed",
        "value": 500
    }
    
    resp, err = make_request("POST", "/admin/coupons", data, cookie=test_state["admin_cookie"])
    
    if err:
        log_test("Create QAFLAT coupon", "FAIL", f"Request failed: {err}")
        return False
    
    # If coupon already exists (409), that's OK
    if resp.status_code == 409:
        log_test("Create QAFLAT coupon", "PASS", "Coupon QAFLAT already exists (OK)")
        # Get existing coupon ID
        resp, err = make_request("GET", "/admin/coupons", cookie=test_state["admin_cookie"])
        if resp.status_code == 200:
            coupons = resp.json()
            for c in coupons:
                if c["code"] == "QAFLAT":
                    test_state["coupon_qaflat_id"] = c["id"]
                    break
    elif resp.status_code != 200:
        log_test("Create QAFLAT coupon", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    else:
        result = resp.json()
        test_state["coupon_qaflat_id"] = result["id"]
        log_test("Create QAFLAT coupon", "PASS", f"Created QAFLAT (fixed, ₹500)")
    
    return True

def test_c12_validate_coupon():
    """C12: Validate QA50 coupon for Growth plan -> correct discount and totals"""
    print("\n" + "="*80)
    print("TEST C12: Validate Coupon")
    print("="*80)
    
    if not test_state["growth_plan_id"]:
        log_test("Validate coupon", "FAIL", "No Growth plan ID available")
        return False
    
    data = {
        "planId": test_state["growth_plan_id"],
        "interval": "monthly",
        "couponCode": "QA50"
    }
    
    resp, err = make_request("POST", "/billing/coupon/validate", data, 
                            cookie=test_state["free_owner_cookie"])
    
    if err:
        log_test("Validate QA50 coupon", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("Validate QA50 coupon", "FAIL", 
                f"Expected 200, got {resp.status_code}. Response: {resp.text[:500]}")
        return False
    
    try:
        result = resp.json()
        
        # Verify valid=true
        if result.get("valid") != True:
            log_test("Validate QA50 coupon", "FAIL", f"Expected valid=true, got {result.get('valid')}")
            return False
        
        # Verify discount (50% of 2499 = 1250, allow rounding ±1)
        expected_discount = 1250
        actual_discount = result.get("discount", 0)
        
        if abs(actual_discount - expected_discount) > 1:
            log_test("Validate QA50 coupon", "FAIL", 
                    f"Expected discount ~{expected_discount}, got {actual_discount}")
            return False
        
        # Verify totals
        totals = result.get("totals", {})
        
        # subtotal should be 2499
        if totals.get("subtotal") != 2499:
            log_test("Validate QA50 coupon", "FAIL", 
                    f"Expected subtotal=2499, got {totals.get('subtotal')}")
            return False
        
        # discount should be ~1250
        if abs(totals.get("discount", 0) - 1250) > 1:
            log_test("Validate QA50 coupon", "FAIL", 
                    f"Expected discount ~1250, got {totals.get('discount')}")
            return False
        
        # tax should be 18% of (2499 - 1250) = 18% of 1249 = 225 (allow ±1)
        expected_tax = 225
        actual_tax = totals.get("tax", 0)
        
        if abs(actual_tax - expected_tax) > 1:
            log_test("Validate QA50 coupon", "FAIL", 
                    f"Expected tax ~{expected_tax}, got {actual_tax}")
            return False
        
        # total should be 1249 + 225 = 1474 (allow ±1)
        expected_total = 1474
        actual_total = totals.get("total", 0)
        
        if abs(actual_total - expected_total) > 1:
            log_test("Validate QA50 coupon", "FAIL", 
                    f"Expected total ~{expected_total}, got {actual_total}")
            return False
        
        log_test("Validate QA50 coupon", "PASS", 
                f"valid=true, discount={actual_discount}, totals={{subtotal:2499, discount:{totals['discount']}, tax:{actual_tax}, total:{actual_total}}}")
        return True
        
    except Exception as e:
        log_test("Validate QA50 coupon", "FAIL", f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_c13_validate_invalid_coupon():
    """C13: Validate invalid coupon -> {valid:false, reason:...}"""
    print("\n" + "="*80)
    print("TEST C13: Validate Invalid Coupon")
    print("="*80)
    
    data = {
        "planId": test_state["growth_plan_id"],
        "interval": "monthly",
        "couponCode": "NOPE"
    }
    
    resp, err = make_request("POST", "/billing/coupon/validate", data, 
                            cookie=test_state["free_owner_cookie"])
    
    if err:
        log_test("Validate invalid coupon", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("Validate invalid coupon", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        result = resp.json()
        
        if result.get("valid") != False:
            log_test("Validate invalid coupon", "FAIL", f"Expected valid=false, got {result.get('valid')}")
            return False
        
        if "reason" not in result:
            log_test("Validate invalid coupon", "FAIL", "Missing reason field")
            return False
        
        log_test("Validate invalid coupon", "PASS", f"valid=false, reason='{result['reason']}'")
        return True
        
    except Exception as e:
        log_test("Validate invalid coupon", "FAIL", f"Error: {e}")
        return False

def test_c14_checkout():
    """C14: POST /api/billing/checkout -> {orderId, amount, gateway:stub, stub:true}"""
    print("\n" + "="*80)
    print("TEST C14: Billing Checkout")
    print("="*80)
    
    data = {
        "planId": test_state["growth_plan_id"],
        "interval": "monthly",
        "couponCode": "QA50"
    }
    
    resp, err = make_request("POST", "/billing/checkout", data, 
                            cookie=test_state["free_owner_cookie"])
    
    if err:
        log_test("POST /api/billing/checkout", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("POST /api/billing/checkout", "FAIL", 
                f"Expected 200, got {resp.status_code}. Response: {resp.text[:500]}")
        return False
    
    try:
        result = resp.json()
        
        # Verify required fields
        required = ["orderId", "amount", "gateway", "stub"]
        missing = [f for f in required if f not in result]
        
        if missing:
            log_test("POST /api/billing/checkout", "FAIL", f"Missing fields: {missing}")
            return False
        
        # Verify amount ~1474
        if abs(result["amount"] - 1474) > 1:
            log_test("POST /api/billing/checkout", "FAIL", 
                    f"Expected amount ~1474, got {result['amount']}")
            return False
        
        # Verify gateway=stub
        if result["gateway"] != "stub":
            log_test("POST /api/billing/checkout", "FAIL", 
                    f"Expected gateway='stub', got {result['gateway']}")
            return False
        
        # Verify stub=true
        if result["stub"] != True:
            log_test("POST /api/billing/checkout", "FAIL", 
                    f"Expected stub=true, got {result['stub']}")
            return False
        
        # Save order ID
        test_state["order_id"] = result["orderId"]
        
        log_test("POST /api/billing/checkout", "PASS", 
                f"orderId={result['orderId']}, amount={result['amount']}, gateway=stub, stub=true")
        return True
        
    except Exception as e:
        log_test("POST /api/billing/checkout", "FAIL", f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_c15_confirm():
    """C15: POST /api/billing/confirm -> {ok:true, invoice, entitlements}"""
    print("\n" + "="*80)
    print("TEST C15: Billing Confirm")
    print("="*80)
    
    if not test_state["order_id"]:
        log_test("POST /api/billing/confirm", "FAIL", "No order ID available")
        return False
    
    data = {
        "orderId": test_state["order_id"]
    }
    
    resp, err = make_request("POST", "/billing/confirm", data, 
                            cookie=test_state["free_owner_cookie"])
    
    if err:
        log_test("POST /api/billing/confirm", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("POST /api/billing/confirm", "FAIL", 
                f"Expected 200, got {resp.status_code}. Response: {resp.text[:500]}")
        return False
    
    try:
        result = resp.json()
        
        # Verify ok=true
        if result.get("ok") != True:
            log_test("POST /api/billing/confirm", "FAIL", f"Expected ok=true, got {result.get('ok')}")
            return False
        
        # Verify invoice
        if "invoice" not in result:
            log_test("POST /api/billing/confirm", "FAIL", "Missing invoice")
            return False
        
        invoice = result["invoice"]
        
        # Verify invoice number matches /NAI-\d{4}-\d{5}/
        import re
        if not re.match(r"NAI-\d{4}-\d{5}", invoice.get("number", "")):
            log_test("POST /api/billing/confirm", "FAIL", 
                    f"Invoice number doesn't match pattern NAI-YYYY-#####: {invoice.get('number')}")
            return False
        
        test_state["invoice_number"] = invoice["number"]
        
        # Verify invoice total ~1474
        if abs(invoice.get("total", 0) - 1474) > 1:
            log_test("POST /api/billing/confirm", "FAIL", 
                    f"Expected invoice total ~1474, got {invoice.get('total')}")
            return False
        
        # Verify entitlements
        if "entitlements" not in result:
            log_test("POST /api/billing/confirm", "FAIL", "Missing entitlements")
            return False
        
        ent = result["entitlements"]
        
        # Verify plan.name = Growth
        if ent.get("plan", {}).get("name") != "Growth":
            log_test("POST /api/billing/confirm", "FAIL", 
                    f"Expected plan 'Growth', got {ent.get('plan', {}).get('name')}")
            return False
        
        # Verify limits.campaigns = -1 (unlimited)
        if ent.get("limits", {}).get("campaigns") != -1:
            log_test("POST /api/billing/confirm", "FAIL", 
                    f"Expected limits.campaigns=-1, got {ent.get('limits', {}).get('campaigns')}")
            return False
        
        log_test("POST /api/billing/confirm", "PASS", 
                f"ok=true, invoice.number={invoice['number']}, invoice.total={invoice['total']}, plan=Growth, limits.campaigns=-1")
        return True
        
    except Exception as e:
        log_test("POST /api/billing/confirm", "FAIL", f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_c16_confirm_idempotent():
    """C16: Confirm same orderId again -> {ok:true, alreadyPaid:true}"""
    print("\n" + "="*80)
    print("TEST C16: Billing Confirm Idempotent")
    print("="*80)
    
    data = {
        "orderId": test_state["order_id"]
    }
    
    resp, err = make_request("POST", "/billing/confirm", data, 
                            cookie=test_state["free_owner_cookie"])
    
    if err:
        log_test("POST /api/billing/confirm (idempotent)", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("POST /api/billing/confirm (idempotent)", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        result = resp.json()
        
        if result.get("ok") != True:
            log_test("POST /api/billing/confirm (idempotent)", "FAIL", 
                    f"Expected ok=true, got {result.get('ok')}")
            return False
        
        if result.get("alreadyPaid") != True:
            log_test("POST /api/billing/confirm (idempotent)", "FAIL", 
                    f"Expected alreadyPaid=true, got {result.get('alreadyPaid')}")
            return False
        
        log_test("POST /api/billing/confirm (idempotent)", "PASS", "ok=true, alreadyPaid=true (idempotent)")
        return True
        
    except Exception as e:
        log_test("POST /api/billing/confirm (idempotent)", "FAIL", f"Error: {e}")
        return False

def test_c17_get_invoices():
    """C17: GET /api/billing/invoices -> array containing the paid invoice"""
    print("\n" + "="*80)
    print("TEST C17: Get Invoices")
    print("="*80)
    
    resp, err = make_request("GET", "/billing/invoices", cookie=test_state["free_owner_cookie"])
    
    if err:
        log_test("GET /api/billing/invoices", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("GET /api/billing/invoices", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        invoices = resp.json()
        
        if not isinstance(invoices, list):
            log_test("GET /api/billing/invoices", "FAIL", f"Expected array, got {type(invoices)}")
            return False
        
        # Find our invoice
        found = False
        for inv in invoices:
            if inv.get("number") == test_state["invoice_number"]:
                found = True
                break
        
        if not found:
            log_test("GET /api/billing/invoices", "FAIL", 
                    f"Invoice {test_state['invoice_number']} not found in list")
            return False
        
        log_test("GET /api/billing/invoices", "PASS", 
                f"Retrieved {len(invoices)} invoices, includes {test_state['invoice_number']}")
        return True
        
    except Exception as e:
        log_test("GET /api/billing/invoices", "FAIL", f"Error: {e}")
        return False

def test_c18_unlimited_campaigns():
    """C18: Now on Growth, create multiple campaigns (should succeed beyond 1)"""
    print("\n" + "="*80)
    print("TEST C18: Unlimited Campaigns on Growth Plan")
    print("="*80)
    
    # Create 3 campaigns
    for i in range(3):
        data = {"businessName": f"Growth Business {i+1}"}
        resp, err = make_request("POST", "/campaigns", data, cookie=test_state["free_owner_cookie"])
        
        if err or resp.status_code != 200:
            log_test(f"Create campaign {i+1}", "FAIL", f"Failed: {err or resp.status_code}")
            return False
        
        log_test(f"Create campaign {i+1}", "PASS", f"Created campaign {i+1}")
    
    # Verify entitlements
    resp, err = make_request("GET", "/me/entitlements", cookie=test_state["free_owner_cookie"])
    
    if err or resp.status_code != 200:
        log_test("Verify entitlements", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    ent = resp.json()
    
    if ent.get("plan", {}).get("name") != "Growth":
        log_test("Verify entitlements", "FAIL", f"Expected plan Growth, got {ent.get('plan', {}).get('name')}")
        return False
    
    log_test("Verify entitlements", "PASS", "Plan is Growth, unlimited campaigns working")
    return True

def test_c19_cancel_subscription():
    """C19: POST /api/billing/cancel -> {ok:true}; entitlements.subscription.cancelAtPeriodEnd=true"""
    print("\n" + "="*80)
    print("TEST C19: Cancel Subscription")
    print("="*80)
    
    resp, err = make_request("POST", "/billing/cancel", cookie=test_state["free_owner_cookie"])
    
    if err:
        log_test("POST /api/billing/cancel", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("POST /api/billing/cancel", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        result = resp.json()
        
        if result.get("ok") != True:
            log_test("POST /api/billing/cancel", "FAIL", f"Expected ok=true, got {result.get('ok')}")
            return False
        
        log_test("POST /api/billing/cancel", "PASS", "ok=true")
        
    except Exception as e:
        log_test("POST /api/billing/cancel", "FAIL", f"Error: {e}")
        return False
    
    # Verify entitlements
    resp, err = make_request("GET", "/me/entitlements", cookie=test_state["free_owner_cookie"])
    
    if err or resp.status_code != 200:
        log_test("Verify cancelAtPeriodEnd", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    try:
        ent = resp.json()
        
        if ent.get("subscription", {}).get("cancelAtPeriodEnd") != True:
            log_test("Verify cancelAtPeriodEnd", "FAIL", 
                    f"Expected cancelAtPeriodEnd=true, got {ent.get('subscription', {}).get('cancelAtPeriodEnd')}")
            return False
        
        log_test("Verify cancelAtPeriodEnd", "PASS", "subscription.cancelAtPeriodEnd=true")
        return True
        
    except Exception as e:
        log_test("Verify cancelAtPeriodEnd", "FAIL", f"Error: {e}")
        return False

# ==================== D) ADMIN (RBAC) ====================

def test_d20_admin_rbac():
    """D20: Normal owner GET /api/admin/metrics -> 403"""
    print("\n" + "="*80)
    print("TEST D20: Admin RBAC")
    print("="*80)
    
    resp, err = make_request("GET", "/admin/metrics", cookie=test_state["owner_a_cookie"])
    
    if err:
        log_test("GET /api/admin/metrics (owner)", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 403:
        log_test("GET /api/admin/metrics (owner)", "FAIL", 
                f"Expected 403, got {resp.status_code}")
        return False
    
    log_test("GET /api/admin/metrics (owner)", "PASS", "Correctly returned 403 (RBAC working)")
    return True

def test_d21_admin_endpoints():
    """D21: As super admin, test various admin endpoints"""
    print("\n" + "="*80)
    print("TEST D21: Admin Endpoints")
    print("="*80)
    
    # GET /api/admin/metrics
    resp, err = make_request("GET", "/admin/metrics", cookie=test_state["admin_cookie"])
    
    if err or resp.status_code != 200:
        log_test("GET /api/admin/metrics", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    try:
        metrics = resp.json()
        
        required = ["totalUsers", "totalOrgs", "paidUsers", "mrr", "arr", "revenue", "planDistribution"]
        missing = [f for f in required if f not in metrics]
        
        if missing:
            log_test("GET /api/admin/metrics", "FAIL", f"Missing fields: {missing}")
            return False
        
        log_test("GET /api/admin/metrics", "PASS", 
                f"totalUsers={metrics['totalUsers']}, totalOrgs={metrics['totalOrgs']}, paidUsers={metrics['paidUsers']}, mrr={metrics['mrr']}, arr={metrics['arr']}")
        
    except Exception as e:
        log_test("GET /api/admin/metrics", "FAIL", f"Error: {e}")
        return False
    
    # GET /api/admin/users
    resp, err = make_request("GET", "/admin/users", cookie=test_state["admin_cookie"])
    
    if err or resp.status_code != 200:
        log_test("GET /api/admin/users", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    try:
        users = resp.json()
        
        if not isinstance(users, list):
            log_test("GET /api/admin/users", "FAIL", f"Expected array, got {type(users)}")
            return False
        
        # Each user should have planName, subStatus
        for user in users[:5]:  # Check first 5
            if "planName" not in user or "subStatus" not in user:
                log_test("GET /api/admin/users", "FAIL", f"User missing planName or subStatus")
                return False
        
        # Save a customer user ID for later
        for user in users:
            if user.get("role") == "owner" and user.get("email") == test_state["free_owner_email"]:
                test_state["customer_user_id"] = user["id"]
                break
        
        log_test("GET /api/admin/users", "PASS", f"Retrieved {len(users)} users")
        
    except Exception as e:
        log_test("GET /api/admin/users", "FAIL", f"Error: {e}")
        return False
    
    # GET /api/admin/plans
    resp, err = make_request("GET", "/admin/plans", cookie=test_state["admin_cookie"])
    
    if err or resp.status_code != 200:
        log_test("GET /api/admin/plans", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    try:
        plans = resp.json()
        
        if len(plans) < 4:
            log_test("GET /api/admin/plans", "FAIL", f"Expected at least 4 plans, got {len(plans)}")
            return False
        
        log_test("GET /api/admin/plans", "PASS", f"Retrieved {len(plans)} plans")
        
    except Exception as e:
        log_test("GET /api/admin/plans", "FAIL", f"Error: {e}")
        return False
    
    # GET /api/admin/coupons
    resp, err = make_request("GET", "/admin/coupons", cookie=test_state["admin_cookie"])
    
    if err or resp.status_code != 200:
        log_test("GET /api/admin/coupons", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    try:
        coupons = resp.json()
        
        # Should include QA50 and QAFLAT
        codes = [c["code"] for c in coupons]
        
        if "QA50" not in codes or "QAFLAT" not in codes:
            log_test("GET /api/admin/coupons", "FAIL", f"Missing QA50 or QAFLAT. Got: {codes}")
            return False
        
        log_test("GET /api/admin/coupons", "PASS", f"Retrieved {len(coupons)} coupons, includes QA50 and QAFLAT")
        
    except Exception as e:
        log_test("GET /api/admin/coupons", "FAIL", f"Error: {e}")
        return False
    
    # GET /api/admin/subscriptions
    resp, err = make_request("GET", "/admin/subscriptions", cookie=test_state["admin_cookie"])
    
    if err or resp.status_code != 200:
        log_test("GET /api/admin/subscriptions", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    try:
        subs = resp.json()
        
        if not isinstance(subs, list):
            log_test("GET /api/admin/subscriptions", "FAIL", f"Expected array, got {type(subs)}")
            return False
        
        log_test("GET /api/admin/subscriptions", "PASS", f"Retrieved {len(subs)} subscriptions")
        
    except Exception as e:
        log_test("GET /api/admin/subscriptions", "FAIL", f"Error: {e}")
        return False
    
    # GET /api/admin/settings
    resp, err = make_request("GET", "/admin/settings", cookie=test_state["admin_cookie"])
    
    if err or resp.status_code != 200:
        log_test("GET /api/admin/settings", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    try:
        settings = resp.json()
        
        if "taxPercent" not in settings:
            log_test("GET /api/admin/settings", "FAIL", "Missing taxPercent")
            return False
        
        if settings["taxPercent"] != 18:
            log_test("GET /api/admin/settings", "FAIL", f"Expected taxPercent=18, got {settings['taxPercent']}")
            return False
        
        log_test("GET /api/admin/settings", "PASS", f"taxPercent={settings['taxPercent']}")
        return True
        
    except Exception as e:
        log_test("GET /api/admin/settings", "FAIL", f"Error: {e}")
        return False

def test_d22_admin_plan_crud():
    """D22: Admin plan CRUD - create, update, duplicate, delete"""
    print("\n" + "="*80)
    print("TEST D22: Admin Plan CRUD")
    print("="*80)
    
    # Create QA Plan
    data = {
        "name": "QA Plan",
        "prices": {
            "INR": {
                "monthly": 1999,
                "yearly": 19990
            }
        },
        "limits": {
            "campaigns": 2
        },
        "features": {
            "automated_replies": True
        }
    }
    
    resp, err = make_request("POST", "/admin/plans", data, cookie=test_state["admin_cookie"])
    
    if err or resp.status_code != 200:
        log_test("POST /api/admin/plans", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    try:
        plan = resp.json()
        
        if "id" not in plan:
            log_test("POST /api/admin/plans", "FAIL", "Missing id")
            return False
        
        test_state["qa_plan_id"] = plan["id"]
        
        log_test("POST /api/admin/plans", "PASS", f"Created QA Plan, id={plan['id']}")
        
    except Exception as e:
        log_test("POST /api/admin/plans", "FAIL", f"Error: {e}")
        return False
    
    # Update QA Plan
    data = {
        "limits": {
            "campaigns": 5
        }
    }
    
    resp, err = make_request("PUT", f"/admin/plans/{test_state['qa_plan_id']}", data, 
                            cookie=test_state["admin_cookie"])
    
    if err or resp.status_code != 200:
        log_test("PUT /api/admin/plans/:id", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    try:
        plan = resp.json()
        
        if plan.get("limits", {}).get("campaigns") != 5:
            log_test("PUT /api/admin/plans/:id", "FAIL", 
                    f"Expected limits.campaigns=5, got {plan.get('limits', {}).get('campaigns')}")
            return False
        
        log_test("PUT /api/admin/plans/:id", "PASS", "Updated limits.campaigns to 5")
        
    except Exception as e:
        log_test("PUT /api/admin/plans/:id", "FAIL", f"Error: {e}")
        return False
    
    # Duplicate QA Plan
    resp, err = make_request("POST", f"/admin/plans/{test_state['qa_plan_id']}/duplicate", 
                            cookie=test_state["admin_cookie"])
    
    if err or resp.status_code != 200:
        log_test("POST /api/admin/plans/:id/duplicate", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    try:
        plan = resp.json()
        
        if "(copy)" not in plan.get("name", ""):
            log_test("POST /api/admin/plans/:id/duplicate", "FAIL", 
                    f"Expected name to contain '(copy)', got {plan.get('name')}")
            return False
        
        duplicate_id = plan["id"]
        
        log_test("POST /api/admin/plans/:id/duplicate", "PASS", f"Duplicated plan, new name={plan['name']}")
        
    except Exception as e:
        log_test("POST /api/admin/plans/:id/duplicate", "FAIL", f"Error: {e}")
        return False
    
    # Delete QA Plan
    resp, err = make_request("DELETE", f"/admin/plans/{test_state['qa_plan_id']}", 
                            cookie=test_state["admin_cookie"])
    
    if err or resp.status_code != 200:
        log_test("DELETE /api/admin/plans/:id", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    try:
        result = resp.json()
        
        if result.get("ok") != True:
            log_test("DELETE /api/admin/plans/:id", "FAIL", f"Expected ok=true, got {result.get('ok')}")
            return False
        
        log_test("DELETE /api/admin/plans/:id", "PASS", "Soft-deactivated QA Plan")
        return True
        
    except Exception as e:
        log_test("DELETE /api/admin/plans/:id", "FAIL", f"Error: {e}")
        return False

def test_d23_admin_coupon_update():
    """D23: Admin coupon update - deactivate QA50, then validate should fail"""
    print("\n" + "="*80)
    print("TEST D23: Admin Coupon Update")
    print("="*80)
    
    if not test_state["coupon_qa50_id"]:
        log_test("Admin coupon update", "FAIL", "No QA50 coupon ID available")
        return False
    
    # Update QA50 to isActive=false
    data = {
        "isActive": False
    }
    
    resp, err = make_request("PUT", f"/admin/coupons/{test_state['coupon_qa50_id']}", data, 
                            cookie=test_state["admin_cookie"])
    
    if err or resp.status_code != 200:
        log_test("PUT /api/admin/coupons/:id", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    try:
        coupon = resp.json()
        
        if coupon.get("isActive") != False:
            log_test("PUT /api/admin/coupons/:id", "FAIL", 
                    f"Expected isActive=false, got {coupon.get('isActive')}")
            return False
        
        log_test("PUT /api/admin/coupons/:id", "PASS", "Updated QA50 isActive=false")
        
    except Exception as e:
        log_test("PUT /api/admin/coupons/:id", "FAIL", f"Error: {e}")
        return False
    
    # Try to validate QA50 as customer -> should fail
    data = {
        "planId": test_state["growth_plan_id"],
        "interval": "monthly",
        "couponCode": "QA50"
    }
    
    resp, err = make_request("POST", "/billing/coupon/validate", data, 
                            cookie=test_state["owner_a_cookie"])
    
    if err or resp.status_code != 200:
        log_test("Validate deactivated QA50", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    try:
        result = resp.json()
        
        if result.get("valid") != False:
            log_test("Validate deactivated QA50", "FAIL", 
                    f"Expected valid=false, got {result.get('valid')}")
            return False
        
        log_test("Validate deactivated QA50", "PASS", "valid=false (coupon deactivated)")
        return True
        
    except Exception as e:
        log_test("Validate deactivated QA50", "FAIL", f"Error: {e}")
        return False

def test_d24_admin_user_management():
    """D24: Admin user management - change customer's plan to Starter"""
    print("\n" + "="*80)
    print("TEST D24: Admin User Management")
    print("="*80)
    
    if not test_state["customer_user_id"] or not test_state["starter_plan_id"]:
        log_test("Admin user management", "FAIL", "Missing customer user ID or Starter plan ID")
        return False
    
    # PATCH /api/admin/users/:id with planId
    data = {
        "planId": test_state["starter_plan_id"]
    }
    
    resp, err = make_request("PATCH", f"/admin/users/{test_state['customer_user_id']}", data, 
                            cookie=test_state["admin_cookie"])
    
    if err or resp.status_code != 200:
        log_test("PATCH /api/admin/users/:id", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    try:
        result = resp.json()
        
        if result.get("ok") != True:
            log_test("PATCH /api/admin/users/:id", "FAIL", f"Expected ok=true, got {result.get('ok')}")
            return False
        
        log_test("PATCH /api/admin/users/:id", "PASS", "Changed customer plan to Starter")
        
    except Exception as e:
        log_test("PATCH /api/admin/users/:id", "FAIL", f"Error: {e}")
        return False
    
    # Verify customer's entitlements now show Starter
    resp, err = make_request("GET", "/me/entitlements", cookie=test_state["free_owner_cookie"])
    
    if err or resp.status_code != 200:
        log_test("Verify customer plan", "FAIL", f"Failed: {err or resp.status_code}")
        return False
    
    try:
        ent = resp.json()
        
        if ent.get("plan", {}).get("name") != "Starter":
            log_test("Verify customer plan", "FAIL", 
                    f"Expected plan Starter, got {ent.get('plan', {}).get('name')}")
            return False
        
        log_test("Verify customer plan", "PASS", "Customer entitlements now show plan=Starter")
        return True
        
    except Exception as e:
        log_test("Verify customer plan", "FAIL", f"Error: {e}")
        return False

# ==================== E) REGRESSION ====================

def test_e25_concurrent_requests():
    """E25: Fire 6 concurrent GET /api/plans + GET /api/auth/me pairs -> no 500"""
    print("\n" + "="*80)
    print("TEST E25: Regression - Concurrent Requests")
    print("="*80)
    
    def make_concurrent_request(endpoint, cookie=None):
        """Helper to make a single request"""
        try:
            headers = {}
            if cookie:
                headers["Cookie"] = cookie
            resp = requests.get(f"{BASE_URL}{endpoint}", headers=headers, timeout=10)
            return (endpoint, resp.status_code, resp.text if resp.status_code >= 500 else None)
        except Exception as e:
            return (endpoint, None, str(e))
    
    # Fire 6 pairs of concurrent requests
    requests_list = []
    for i in range(6):
        requests_list.append(("/plans", None))
        requests_list.append(("/auth/me", test_state["owner_a_cookie"]))
    
    print(f"   Firing {len(requests_list)} concurrent requests...")
    
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = [executor.submit(make_concurrent_request, ep, cookie) for ep, cookie in requests_list]
        results = [future.result() for future in as_completed(futures)]
    
    # Check for 500 errors
    errors = []
    for endpoint, status_code, error_text in results:
        if status_code and status_code >= 500:
            errors.append(f"{endpoint}: HTTP {status_code} - {error_text[:200] if error_text else ''}")
        elif status_code is None:
            errors.append(f"{endpoint}: Request failed - {error_text[:200]}")
    
    if errors:
        log_test("Concurrent requests regression", "FAIL", 
                f"Found {len(errors)} errors:\n" + "\n".join(errors[:3]))
        return False
    
    log_test("Concurrent requests regression", "PASS", 
            f"All {len(results)} concurrent requests succeeded, no 500 errors")
    return True

# ==================== MAIN ====================

def main():
    """Run all SaaS backend tests"""
    print("\n" + "="*80)
    print("NIURONAI - SAAS BACKEND LAYER TEST SUITE (MILESTONE 1)")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    
    tests = [
        # A) AUTH & TENANCY
        ("A1", test_a1_register_valid),
        ("A2", test_a2_register_validation),
        ("A3", test_a3_login),
        ("A4", test_a4_auth_me),
        ("A5", test_a5_unauthenticated_endpoints),
        ("A6", test_a6_tenant_isolation),
        
        # B) ENTITLEMENTS / LIMITS
        ("B7", test_b7_get_plans),
        ("B8", test_b8_campaign_limit),
        ("B9", test_b9_entitlements),
        ("B10", test_b10_feature_gate),
        
        # C) BILLING & COUPONS
        ("C11", test_c11_admin_create_coupons),
        ("C12", test_c12_validate_coupon),
        ("C13", test_c13_validate_invalid_coupon),
        ("C14", test_c14_checkout),
        ("C15", test_c15_confirm),
        ("C16", test_c16_confirm_idempotent),
        ("C17", test_c17_get_invoices),
        ("C18", test_c18_unlimited_campaigns),
        ("C19", test_c19_cancel_subscription),
        
        # D) ADMIN (RBAC)
        ("D20", test_d20_admin_rbac),
        ("D21", test_d21_admin_endpoints),
        ("D22", test_d22_admin_plan_crud),
        ("D23", test_d23_admin_coupon_update),
        ("D24", test_d24_admin_user_management),
        
        # E) REGRESSION
        ("E25", test_e25_concurrent_requests),
    ]
    
    results = []
    for test_id, test_func in tests:
        try:
            result = test_func()
            results.append((test_id, test_func.__name__, result))
            if not result:
                print(f"\n⚠️  Test {test_id} ({test_func.__name__}) failed, continuing...")
        except Exception as e:
            print(f"\n❌ {test_id} ({test_func.__name__}) CRASHED: {e}")
            import traceback
            traceback.print_exc()
            results.append((test_id, test_func.__name__, False))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, _, result in results if result)
    total = len(results)
    
    # Group by category
    categories = {
        "A) AUTH & TENANCY": [],
        "B) ENTITLEMENTS / LIMITS": [],
        "C) BILLING & COUPONS": [],
        "D) ADMIN (RBAC)": [],
        "E) REGRESSION": []
    }
    
    for test_id, name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        line = f"{status} - {test_id}: {name}"
        
        if test_id.startswith("A"):
            categories["A) AUTH & TENANCY"].append(line)
        elif test_id.startswith("B"):
            categories["B) ENTITLEMENTS / LIMITS"].append(line)
        elif test_id.startswith("C"):
            categories["C) BILLING & COUPONS"].append(line)
        elif test_id.startswith("D"):
            categories["D) ADMIN (RBAC)"].append(line)
        elif test_id.startswith("E"):
            categories["E) REGRESSION"].append(line)
    
    for category, lines in categories.items():
        if lines:
            print(f"\n{category}")
            for line in lines:
                print(f"  {line}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed ({int(passed/total*100)}%)")
    print("="*80)
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)

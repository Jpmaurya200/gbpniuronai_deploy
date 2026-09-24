#!/usr/bin/env python3
"""
Automated Replies Engine Test Suite for niuronai
Tests the new automated replies endpoints with SAFETY invariant checks
"""

import requests
import json
import time
from typing import Dict, Any, Optional, List

# Base URL from environment
BASE_URL = "https://review-and-build-7.preview.emergentagent.com/api"

# Test state
test_state = {
    "campaign_id": None,
    "campaign_slug": None,
    "new_campaign_id": None,
    "simulated_reviews": [],
}

def log_test(name: str, status: str, details: str = ""):
    """Log test results"""
    symbol = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    print(f"\n{symbol} {name}: {status}")
    if details:
        print(f"   {details}")

def make_request(method: str, endpoint: str, data: Optional[Dict] = None, timeout: int = 60) -> tuple:
    """Make HTTP request and return (response, error)"""
    url = f"{BASE_URL}{endpoint}"
    try:
        if method == "GET":
            resp = requests.get(url, timeout=timeout)
        elif method == "POST":
            resp = requests.post(url, json=data, timeout=timeout)
        elif method == "PUT":
            resp = requests.put(url, json=data, timeout=timeout)
        elif method == "DELETE":
            resp = requests.delete(url, timeout=timeout)
        else:
            return None, f"Unsupported method: {method}"
        
        return resp, None
    except Exception as e:
        return None, str(e)

def test_setup():
    """Setup: Get a campaign ID and ensure reviews exist"""
    print("\n" + "="*80)
    print("SETUP: Get Campaign ID and Seed Reviews")
    print("="*80)
    
    # Get campaigns
    resp, err = make_request("GET", "/campaigns")
    if err or resp.status_code != 200:
        log_test("Setup - Get campaigns", "FAIL", f"Failed to get campaigns: {err or resp.status_code}")
        return False
    
    campaigns = resp.json()
    if not campaigns:
        log_test("Setup - Get campaigns", "FAIL", "No campaigns found. Run POST /api/seed first.")
        return False
    
    # Pick first campaign
    campaign = campaigns[0]
    test_state["campaign_id"] = campaign["id"]
    test_state["campaign_slug"] = campaign["slug"]
    
    log_test("Setup - Get campaigns", "PASS", f"Using campaign: {campaign['businessName']} (ID: {campaign['id']})")
    
    # Ensure reviews exist
    resp, err = make_request("POST", "/reviews/seed")
    if err or resp.status_code != 200:
        log_test("Setup - Seed reviews", "FAIL", f"Failed to seed reviews: {err or resp.status_code}")
        return False
    
    data = resp.json()
    log_test("Setup - Seed reviews", "PASS", f"Reviews seeded: {data.get('created', 0)} created (idempotent)")
    
    return True

def test_a_automation_config_persistence():
    """Test A: Automation config persistence via PUT /api/campaigns/{id}"""
    print("\n" + "="*80)
    print("TEST A: Automation Config Persistence")
    print("="*80)
    
    if not test_state["campaign_id"]:
        log_test("Test A", "FAIL", "No campaign ID available")
        return False
    
    campaign_id = test_state["campaign_id"]
    
    # Update campaign with automation config
    automation_config = {
        "automation": {
            "enabled": True,
            "autoPublishMinRating": 5,
            "tone": "Friendly",
            "length": "standard"
        }
    }
    
    resp, err = make_request("PUT", f"/campaigns/{campaign_id}", automation_config)
    
    if err:
        log_test("Test A - PUT automation config", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("Test A - PUT automation config", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        
        # Verify automation object exists and matches
        if "automation" not in data:
            log_test("Test A - PUT automation config", "FAIL", "Missing 'automation' field in response")
            return False
        
        automation = data["automation"]
        expected = automation_config["automation"]
        
        # Check each field
        mismatches = []
        if automation.get("enabled") != expected["enabled"]:
            mismatches.append(f"enabled: expected {expected['enabled']}, got {automation.get('enabled')}")
        if automation.get("autoPublishMinRating") != expected["autoPublishMinRating"]:
            mismatches.append(f"autoPublishMinRating: expected {expected['autoPublishMinRating']}, got {automation.get('autoPublishMinRating')}")
        if automation.get("tone") != expected["tone"]:
            mismatches.append(f"tone: expected {expected['tone']}, got {automation.get('tone')}")
        if automation.get("length") != expected["length"]:
            mismatches.append(f"length: expected {expected['length']}, got {automation.get('length')}")
        
        if mismatches:
            log_test("Test A - PUT automation config", "FAIL", f"Automation config mismatch: {'; '.join(mismatches)}")
            return False
        
        log_test("Test A - PUT automation config", "PASS", f"Automation config persisted correctly: {automation}")
        return True
        
    except Exception as e:
        log_test("Test A - PUT automation config", "FAIL", f"Error: {e}")
        return False

def test_b_simulate_review_with_automation():
    """Test B: Simulate incoming review with automation ENABLED - verify SAFETY invariant"""
    print("\n" + "="*80)
    print("TEST B: Simulate Review with Automation ENABLED (SAFETY CHECK)")
    print("="*80)
    
    if not test_state["campaign_id"]:
        log_test("Test B", "FAIL", "No campaign ID available")
        return False
    
    campaign_id = test_state["campaign_id"]
    
    print("   Simulating up to 6 reviews (each takes ~3-6 seconds for real Gemini call)...")
    
    simulations = []
    safety_violations = []
    
    # Simulate multiple reviews to get different ratings
    for i in range(6):
        print(f"   Simulation {i+1}/6...")
        resp, err = make_request("POST", f"/campaigns/{campaign_id}/simulate-review", timeout=60)
        
        if err:
            log_test(f"Test B - Simulation {i+1}", "FAIL", f"Request failed: {err}")
            continue
        
        if resp.status_code != 200:
            log_test(f"Test B - Simulation {i+1}", "FAIL", f"Expected 200, got {resp.status_code}")
            continue
        
        try:
            data = resp.json()
            
            # Verify response structure
            if "review" not in data or "autoAction" not in data or "automationEnabled" not in data:
                log_test(f"Test B - Simulation {i+1}", "FAIL", "Missing required fields in response")
                continue
            
            review = data["review"]
            auto_action = data["autoAction"]
            automation_enabled = data["automationEnabled"]
            
            # Verify automation is enabled
            if not automation_enabled:
                log_test(f"Test B - Simulation {i+1}", "FAIL", "automationEnabled should be true")
                continue
            
            # Extract key fields
            rating = review.get("rating")
            sentiment = review.get("sentiment")
            reply_status = review.get("replyStatus")
            reply = review.get("reply", "")
            
            simulations.append({
                "rating": rating,
                "sentiment": sentiment,
                "autoAction": auto_action,
                "replyStatus": reply_status,
                "hasReply": bool(reply)
            })
            
            # SAFETY INVARIANT CHECK
            # If rating == 5 AND sentiment == 'positive' -> autoAction MUST be 'auto_published' AND replyStatus == 'published'
            # If rating < 5 -> autoAction MUST be 'queued' AND replyStatus == 'draft'
            
            if rating == 5 and sentiment == "positive":
                # Should be auto-published
                if auto_action != "auto_published":
                    safety_violations.append(f"Simulation {i+1}: rating=5, sentiment=positive but autoAction='{auto_action}' (expected 'auto_published')")
                if reply_status != "published":
                    safety_violations.append(f"Simulation {i+1}: rating=5, sentiment=positive but replyStatus='{reply_status}' (expected 'published')")
                if not reply:
                    safety_violations.append(f"Simulation {i+1}: rating=5, sentiment=positive but reply is empty")
            
            elif rating < 5:
                # Should be queued (draft)
                if auto_action != "queued":
                    safety_violations.append(f"Simulation {i+1}: rating={rating} (<5) but autoAction='{auto_action}' (expected 'queued')")
                if reply_status != "draft":
                    safety_violations.append(f"Simulation {i+1}: rating={rating} (<5) but replyStatus='{reply_status}' (expected 'draft')")
                
                # CRITICAL: ratings 1, 2, 3 must NEVER be auto_published
                if auto_action == "auto_published":
                    safety_violations.append(f"🚨 CRITICAL SAFETY VIOLATION: rating={rating} was AUTO-PUBLISHED! This should NEVER happen.")
            
            log_test(f"Test B - Simulation {i+1}", "PASS", 
                    f"rating={rating}, sentiment={sentiment}, autoAction={auto_action}, replyStatus={reply_status}, hasReply={bool(reply)}")
            
        except Exception as e:
            log_test(f"Test B - Simulation {i+1}", "FAIL", f"Error: {e}")
            continue
    
    # Summary
    print("\n" + "-"*80)
    print("SIMULATION SUMMARY:")
    print("-"*80)
    
    for i, sim in enumerate(simulations, 1):
        print(f"  {i}. rating={sim['rating']}, sentiment={sim['sentiment']}, autoAction={sim['autoAction']}, replyStatus={sim['replyStatus']}")
    
    # Check if we got both cases
    has_5_star = any(s["rating"] == 5 and s["sentiment"] == "positive" for s in simulations)
    has_below_5 = any(s["rating"] < 5 for s in simulations)
    
    if not has_5_star:
        log_test("Test B - Coverage", "WARN", "Did not observe a 5-star positive review (random variation)")
    if not has_below_5:
        log_test("Test B - Coverage", "WARN", "Did not observe a <5 star review (random variation)")
    
    # Report safety violations
    if safety_violations:
        print("\n" + "="*80)
        print("🚨 SAFETY VIOLATIONS DETECTED:")
        print("="*80)
        for violation in safety_violations:
            print(f"  ❌ {violation}")
        log_test("Test B - SAFETY CHECK", "FAIL", f"{len(safety_violations)} safety violation(s) detected")
        return False
    else:
        log_test("Test B - SAFETY CHECK", "PASS", "All simulations passed safety invariant checks")
        return True

def test_c_automation_disabled():
    """Test C: Automation disabled - verify autoAction 'none'"""
    print("\n" + "="*80)
    print("TEST C: Automation Disabled")
    print("="*80)
    
    # Create a new campaign with automation disabled (default)
    campaign_data = {
        "businessName": "NoAuto Co"
    }
    
    resp, err = make_request("POST", "/campaigns", campaign_data)
    
    if err or resp.status_code != 200:
        log_test("Test C - Create campaign", "FAIL", f"Failed to create campaign: {err or resp.status_code}")
        return False
    
    new_campaign = resp.json()
    new_id = new_campaign["id"]
    test_state["new_campaign_id"] = new_id
    
    log_test("Test C - Create campaign", "PASS", f"Created campaign: {new_campaign['businessName']} (ID: {new_id})")
    
    # Verify automation is disabled by default
    automation = new_campaign.get("automation", {})
    if automation.get("enabled") != False:
        log_test("Test C - Default automation", "FAIL", f"Expected automation.enabled=false, got {automation.get('enabled')}")
        return False
    
    log_test("Test C - Default automation", "PASS", "Automation disabled by default")
    
    # Simulate a review on this campaign
    print("   Simulating review on campaign with automation disabled...")
    resp, err = make_request("POST", f"/campaigns/{new_id}/simulate-review", timeout=60)
    
    if err:
        log_test("Test C - Simulate review", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("Test C - Simulate review", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        
        review = data.get("review", {})
        auto_action = data.get("autoAction")
        automation_enabled = data.get("automationEnabled")
        
        # Verify automation is disabled
        if automation_enabled != False:
            log_test("Test C - Simulate review", "FAIL", f"Expected automationEnabled=false, got {automation_enabled}")
            return False
        
        # Verify autoAction is 'none'
        if auto_action != "none":
            log_test("Test C - Simulate review", "FAIL", f"Expected autoAction='none', got '{auto_action}'")
            return False
        
        # Verify review stays 'unanswered'
        reply_status = review.get("replyStatus")
        if reply_status != "unanswered":
            log_test("Test C - Simulate review", "FAIL", f"Expected replyStatus='unanswered', got '{reply_status}'")
            return False
        
        log_test("Test C - Simulate review", "PASS", 
                f"autoAction='none', automationEnabled=false, replyStatus='unanswered'")
        
    except Exception as e:
        log_test("Test C - Simulate review", "FAIL", f"Error: {e}")
        return False
    
    # Clean up: delete the campaign
    resp, err = make_request("DELETE", f"/campaigns/{new_id}")
    
    if err or resp.status_code != 200:
        log_test("Test C - Cleanup", "WARN", f"Failed to delete campaign: {err or resp.status_code}")
    else:
        log_test("Test C - Cleanup", "PASS", "Campaign deleted")
    
    return True

def test_d_bulk_automate():
    """Test D: Bulk automate - POST /api/reviews/automate"""
    print("\n" + "="*80)
    print("TEST D: Bulk Automate")
    print("="*80)
    
    if not test_state["campaign_id"]:
        log_test("Test D", "FAIL", "No campaign ID available")
        return False
    
    campaign_id = test_state["campaign_id"]
    
    # Test D1: Automate for specific campaign (with automation enabled)
    print("   D1: Automate for specific campaign (automation enabled)...")
    resp, err = make_request("POST", "/reviews/automate", {"campaignId": campaign_id}, timeout=60)
    
    if err:
        log_test("Test D1 - Automate specific campaign", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("Test D1 - Automate specific campaign", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        
        # Verify response structure
        required_fields = ["ok", "processed", "published", "queued", "skipped"]
        missing = [f for f in required_fields if f not in data]
        if missing:
            log_test("Test D1 - Automate specific campaign", "FAIL", f"Missing fields: {missing}")
            return False
        
        ok = data["ok"]
        processed = data["processed"]
        published = data["published"]
        queued = data["queued"]
        skipped = data["skipped"]
        
        # Verify ok is true
        if not ok:
            log_test("Test D1 - Automate specific campaign", "FAIL", f"Expected ok=true, got {ok}")
            return False
        
        # Since campaign has automation enabled, processed should be > 0 (unless no unanswered remain)
        # published + queued should equal processed
        if processed > 0 and (published + queued) != processed:
            log_test("Test D1 - Automate specific campaign", "FAIL", 
                    f"published({published}) + queued({queued}) != processed({processed})")
            return False
        
        log_test("Test D1 - Automate specific campaign", "PASS", 
                f"processed={processed}, published={published}, queued={queued}, skipped={skipped}")
        
    except Exception as e:
        log_test("Test D1 - Automate specific campaign", "FAIL", f"Error: {e}")
        return False
    
    # Test D2: Automate for all campaigns (should skip campaigns without automation)
    print("   D2: Automate for all campaigns (should skip disabled campaigns)...")
    resp, err = make_request("POST", "/reviews/automate", {}, timeout=60)
    
    if err:
        log_test("Test D2 - Automate all campaigns", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("Test D2 - Automate all campaigns", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        
        ok = data["ok"]
        processed = data["processed"]
        published = data["published"]
        queued = data["queued"]
        skipped = data["skipped"]
        
        # Verify ok is true
        if not ok:
            log_test("Test D2 - Automate all campaigns", "FAIL", f"Expected ok=true, got {ok}")
            return False
        
        # Reviews from campaigns WITHOUT automation should be in 'skipped'
        # We can't verify exact numbers without knowing the state, but skipped should be >= 0
        if skipped < 0:
            log_test("Test D2 - Automate all campaigns", "FAIL", f"Invalid skipped count: {skipped}")
            return False
        
        log_test("Test D2 - Automate all campaigns", "PASS", 
                f"processed={processed}, published={published}, queued={queued}, skipped={skipped}")
        
        return True
        
    except Exception as e:
        log_test("Test D2 - Automate all campaigns", "FAIL", f"Error: {e}")
        return False

def test_e_awaiting_filter():
    """Test E: Awaiting filter - GET /api/reviews?status=awaiting"""
    print("\n" + "="*80)
    print("TEST E: Awaiting Filter")
    print("="*80)
    
    resp, err = make_request("GET", "/reviews?status=awaiting")
    
    if err:
        log_test("Test E - GET /api/reviews?status=awaiting", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("Test E - GET /api/reviews?status=awaiting", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        
        if "reviews" not in data:
            log_test("Test E - GET /api/reviews?status=awaiting", "FAIL", "Missing 'reviews' field")
            return False
        
        reviews = data["reviews"]
        
        if not isinstance(reviews, list):
            log_test("Test E - GET /api/reviews?status=awaiting", "FAIL", f"Expected array, got {type(reviews)}")
            return False
        
        # Verify every returned review has replyStatus == 'draft'
        violations = []
        auto_published_found = []
        
        for i, review in enumerate(reviews):
            reply_status = review.get("replyStatus")
            if reply_status != "draft":
                violations.append(f"Review {i+1} (ID: {review.get('id')}): replyStatus='{reply_status}' (expected 'draft')")
            
            # Also check if any are auto_published (should not be in awaiting)
            auto_action = review.get("autoAction")
            if auto_action == "auto_published":
                auto_published_found.append(f"Review {i+1} (ID: {review.get('id')}): autoAction='auto_published' found in awaiting queue")
        
        if violations:
            log_test("Test E - GET /api/reviews?status=awaiting", "FAIL", 
                    f"{len(violations)} review(s) with incorrect replyStatus: {violations[:3]}")
            return False
        
        if auto_published_found:
            log_test("Test E - GET /api/reviews?status=awaiting", "FAIL", 
                    f"{len(auto_published_found)} auto_published review(s) found in awaiting queue: {auto_published_found[:3]}")
            return False
        
        log_test("Test E - GET /api/reviews?status=awaiting", "PASS", 
                f"All {len(reviews)} reviews have replyStatus='draft', none are auto_published")
        
        return True
        
    except Exception as e:
        log_test("Test E - GET /api/reviews?status=awaiting", "FAIL", f"Error: {e}")
        return False

def main():
    """Run all automated replies tests"""
    print("\n" + "="*80)
    print("NIURONAI AUTOMATED REPLIES ENGINE TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    
    # Setup
    if not test_setup():
        print("\n❌ Setup failed. Cannot proceed with tests.")
        return False
    
    tests = [
        ("A: Automation Config Persistence", test_a_automation_config_persistence),
        ("B: Simulate Review with Automation (SAFETY CHECK)", test_b_simulate_review_with_automation),
        ("C: Automation Disabled", test_c_automation_disabled),
        ("D: Bulk Automate", test_d_bulk_automate),
        ("E: Awaiting Filter", test_e_awaiting_filter),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n❌ {name} CRASHED: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {name}")
    
    print("="*80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("="*80)
    
    if passed == total:
        print("\n✅ ALL TESTS PASSED - No safety violations detected")
    else:
        print(f"\n❌ {total - passed} TEST(S) FAILED")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)

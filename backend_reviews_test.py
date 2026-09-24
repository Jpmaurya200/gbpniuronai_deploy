#!/usr/bin/env python3
"""
Backend API Test Suite for niuronai Reviews Inbox Module
Tests ONLY the new review endpoints
"""

import requests
import json
import time
from typing import Dict, Any, Optional

# Base URL from environment
BASE_URL = "https://review-and-build-7.preview.emergentagent.com/api"

# Test state to share data between tests
test_state = {
    "campaign_id": None,
    "review_id_unanswered": None,
    "review_id_for_publish_validation": None,
}

def log_test(name: str, status: str, details: str = ""):
    """Log test results"""
    symbol = "✅" if status == "PASS" else "❌"
    print(f"\n{symbol} {name}: {status}")
    if details:
        print(f"   {details}")

def make_request(method: str, endpoint: str, data: Optional[Dict] = None, timeout: int = 50) -> tuple:
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

def test_1_seed_reviews():
    """Test 1: POST /api/reviews/seed - Idempotent seeding"""
    print("\n" + "="*60)
    print("TEST 1: Seed Reviews (Idempotent)")
    print("="*60)
    
    # First call
    resp, err = make_request("POST", "/reviews/seed")
    
    if err:
        log_test("POST /api/reviews/seed (first call)", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("POST /api/reviews/seed (first call)", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        if data.get("ok") != True:
            log_test("POST /api/reviews/seed (first call)", "FAIL", f"Expected ok:true, got {data}")
            return False
        
        created_first = data.get("created", 0)
        log_test("POST /api/reviews/seed (first call)", "PASS", f"Created: {created_first} reviews")
        
    except Exception as e:
        log_test("POST /api/reviews/seed (first call)", "FAIL", f"JSON parse error: {e}")
        return False
    
    # Second call - should be idempotent (created: 0)
    resp, err = make_request("POST", "/reviews/seed")
    
    if err:
        log_test("POST /api/reviews/seed (idempotent check)", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("POST /api/reviews/seed (idempotent check)", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        if data.get("ok") != True:
            log_test("POST /api/reviews/seed (idempotent check)", "FAIL", f"Expected ok:true, got {data}")
            return False
        
        created_second = data.get("created", 0)
        if created_second != 0:
            log_test("POST /api/reviews/seed (idempotent check)", "FAIL", f"Expected created:0 (idempotent), got created:{created_second}")
            return False
        
        log_test("POST /api/reviews/seed (idempotent check)", "PASS", "Correctly returned created:0 (reviews already present)")
        return True
        
    except Exception as e:
        log_test("POST /api/reviews/seed (idempotent check)", "FAIL", f"JSON parse error: {e}")
        return False

def test_2_list_reviews():
    """Test 2: GET /api/reviews - List all reviews with stats"""
    print("\n" + "="*60)
    print("TEST 2: List Reviews with Stats")
    print("="*60)
    
    resp, err = make_request("GET", "/reviews")
    
    if err:
        log_test("GET /api/reviews", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("GET /api/reviews", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        
        # Check structure
        if "reviews" not in data or "stats" not in data:
            log_test("GET /api/reviews", "FAIL", f"Missing 'reviews' or 'stats' field. Got: {list(data.keys())}")
            return False
        
        reviews = data["reviews"]
        stats = data["stats"]
        
        # Check reviews array is non-empty
        if not isinstance(reviews, list):
            log_test("GET /api/reviews", "FAIL", f"reviews should be array, got {type(reviews)}")
            return False
        
        if len(reviews) == 0:
            log_test("GET /api/reviews", "FAIL", "reviews array is empty (seed should have created some)")
            return False
        
        # Check each review has required fields
        required_fields = ["id", "campaignId", "businessName", "reviewerName", "rating", "text", "sentiment", "topics", "replyStatus"]
        for i, review in enumerate(reviews[:3]):  # Check first 3
            missing = [f for f in required_fields if f not in review]
            if missing:
                log_test("GET /api/reviews", "FAIL", f"Review {i} missing fields: {missing}")
                return False
            
            # Validate rating is 1-5
            if not (1 <= review["rating"] <= 5):
                log_test("GET /api/reviews", "FAIL", f"Review {i} has invalid rating: {review['rating']}")
                return False
            
            # Validate sentiment
            if review["sentiment"] not in ["positive", "neutral", "negative"]:
                log_test("GET /api/reviews", "FAIL", f"Review {i} has invalid sentiment: {review['sentiment']}")
                return False
            
            # Validate topics is array
            if not isinstance(review["topics"], list):
                log_test("GET /api/reviews", "FAIL", f"Review {i} topics should be array, got {type(review['topics'])}")
                return False
        
        # Check stats object
        required_stats = ["total", "unanswered", "published", "avgRating", "responseRate"]
        missing_stats = [s for s in required_stats if s not in stats]
        if missing_stats:
            log_test("GET /api/reviews", "FAIL", f"Missing stats fields: {missing_stats}")
            return False
        
        # Save campaign_id and review_id for later tests
        test_state["campaign_id"] = reviews[0]["campaignId"]
        
        # Find an unanswered review for later tests
        for review in reviews:
            if review["replyStatus"] != "published":
                test_state["review_id_unanswered"] = review["id"]
                break
        
        # Find ANOTHER unanswered review with no reply for publish validation test (must be different)
        for review in reviews:
            if (review["replyStatus"] == "unanswered" and 
                not review.get("reply") and 
                review["id"] != test_state["review_id_unanswered"]):
                test_state["review_id_for_publish_validation"] = review["id"]
                break
        
        log_test("GET /api/reviews", "PASS", f"Found {len(reviews)} reviews. Stats: total={stats['total']}, unanswered={stats['unanswered']}, published={stats['published']}, avgRating={stats['avgRating']}, responseRate={stats['responseRate']}%")
        return True
        
    except Exception as e:
        log_test("GET /api/reviews", "FAIL", f"Error: {e}")
        return False

def test_3_filter_status_unanswered():
    """Test 3: GET /api/reviews?status=unanswered"""
    print("\n" + "="*60)
    print("TEST 3: Filter Reviews - Status Unanswered")
    print("="*60)
    
    resp, err = make_request("GET", "/reviews?status=unanswered")
    
    if err:
        log_test("GET /api/reviews?status=unanswered", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("GET /api/reviews?status=unanswered", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        
        if "reviews" not in data or "stats" not in data:
            log_test("GET /api/reviews?status=unanswered", "FAIL", "Missing 'reviews' or 'stats' field")
            return False
        
        reviews = data["reviews"]
        
        # Check all returned reviews have replyStatus != 'published'
        for i, review in enumerate(reviews):
            if review["replyStatus"] == "published":
                log_test("GET /api/reviews?status=unanswered", "FAIL", f"Review {i} has replyStatus='published' but should be unanswered")
                return False
        
        log_test("GET /api/reviews?status=unanswered", "PASS", f"Found {len(reviews)} unanswered reviews. All have replyStatus != 'published'")
        return True
        
    except Exception as e:
        log_test("GET /api/reviews?status=unanswered", "FAIL", f"Error: {e}")
        return False

def test_4_filter_status_replied():
    """Test 4: GET /api/reviews?status=replied"""
    print("\n" + "="*60)
    print("TEST 4: Filter Reviews - Status Replied")
    print("="*60)
    
    resp, err = make_request("GET", "/reviews?status=replied")
    
    if err:
        log_test("GET /api/reviews?status=replied", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("GET /api/reviews?status=replied", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        
        if "reviews" not in data or "stats" not in data:
            log_test("GET /api/reviews?status=replied", "FAIL", "Missing 'reviews' or 'stats' field")
            return False
        
        reviews = data["reviews"]
        
        # Check all returned reviews have replyStatus == 'published'
        for i, review in enumerate(reviews):
            if review["replyStatus"] != "published":
                log_test("GET /api/reviews?status=replied", "FAIL", f"Review {i} has replyStatus='{review['replyStatus']}' but should be 'published'")
                return False
        
        log_test("GET /api/reviews?status=replied", "PASS", f"Found {len(reviews)} replied reviews (may be 0 initially). All have replyStatus='published'")
        return True
        
    except Exception as e:
        log_test("GET /api/reviews?status=replied", "FAIL", f"Error: {e}")
        return False

def test_5_filter_sentiment():
    """Test 5: GET /api/reviews?sentiment=negative"""
    print("\n" + "="*60)
    print("TEST 5: Filter Reviews - Sentiment Negative")
    print("="*60)
    
    resp, err = make_request("GET", "/reviews?sentiment=negative")
    
    if err:
        log_test("GET /api/reviews?sentiment=negative", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("GET /api/reviews?sentiment=negative", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        
        if "reviews" not in data or "stats" not in data:
            log_test("GET /api/reviews?sentiment=negative", "FAIL", "Missing 'reviews' or 'stats' field")
            return False
        
        reviews = data["reviews"]
        
        # Check all returned reviews have sentiment='negative'
        for i, review in enumerate(reviews):
            if review["sentiment"] != "negative":
                log_test("GET /api/reviews?sentiment=negative", "FAIL", f"Review {i} has sentiment='{review['sentiment']}' but should be 'negative'")
                return False
        
        log_test("GET /api/reviews?sentiment=negative", "PASS", f"Found {len(reviews)} negative reviews. All have sentiment='negative'")
        return True
        
    except Exception as e:
        log_test("GET /api/reviews?sentiment=negative", "FAIL", f"Error: {e}")
        return False

def test_6_filter_rating():
    """Test 6: GET /api/reviews?rating=5"""
    print("\n" + "="*60)
    print("TEST 6: Filter Reviews - Rating 5")
    print("="*60)
    
    resp, err = make_request("GET", "/reviews?rating=5")
    
    if err:
        log_test("GET /api/reviews?rating=5", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("GET /api/reviews?rating=5", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        
        if "reviews" not in data or "stats" not in data:
            log_test("GET /api/reviews?rating=5", "FAIL", "Missing 'reviews' or 'stats' field")
            return False
        
        reviews = data["reviews"]
        
        # Check all returned reviews have rating=5
        for i, review in enumerate(reviews):
            if review["rating"] != 5:
                log_test("GET /api/reviews?rating=5", "FAIL", f"Review {i} has rating={review['rating']} but should be 5")
                return False
        
        log_test("GET /api/reviews?rating=5", "PASS", f"Found {len(reviews)} 5-star reviews. All have rating=5")
        return True
        
    except Exception as e:
        log_test("GET /api/reviews?rating=5", "FAIL", f"Error: {e}")
        return False

def test_7_filter_search():
    """Test 7: GET /api/reviews?q=coffee"""
    print("\n" + "="*60)
    print("TEST 7: Filter Reviews - Search Query")
    print("="*60)
    
    resp, err = make_request("GET", "/reviews?q=coffee")
    
    if err:
        log_test("GET /api/reviews?q=coffee", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("GET /api/reviews?q=coffee", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        
        if "reviews" not in data or "stats" not in data:
            log_test("GET /api/reviews?q=coffee", "FAIL", "Missing 'reviews' or 'stats' field")
            return False
        
        reviews = data["reviews"]
        
        # Search may return empty results, but should not error
        log_test("GET /api/reviews?q=coffee", "PASS", f"Search returned {len(reviews)} reviews (may be 0). No error.")
        return True
        
    except Exception as e:
        log_test("GET /api/reviews?q=coffee", "FAIL", f"Error: {e}")
        return False

def test_8_filter_campaign():
    """Test 8: GET /api/reviews?campaignId=<valid_id>"""
    print("\n" + "="*60)
    print("TEST 8: Filter Reviews - Campaign ID")
    print("="*60)
    
    if not test_state["campaign_id"]:
        log_test("GET /api/reviews?campaignId=<id>", "FAIL", "No campaign_id available from previous tests")
        return False
    
    campaign_id = test_state["campaign_id"]
    resp, err = make_request("GET", f"/reviews?campaignId={campaign_id}")
    
    if err:
        log_test("GET /api/reviews?campaignId=<id>", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("GET /api/reviews?campaignId=<id>", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        
        if "reviews" not in data or "stats" not in data:
            log_test("GET /api/reviews?campaignId=<id>", "FAIL", "Missing 'reviews' or 'stats' field")
            return False
        
        reviews = data["reviews"]
        
        # Check all returned reviews belong to the campaign
        for i, review in enumerate(reviews):
            if review["campaignId"] != campaign_id:
                log_test("GET /api/reviews?campaignId=<id>", "FAIL", f"Review {i} has campaignId='{review['campaignId']}' but should be '{campaign_id}'")
                return False
        
        log_test("GET /api/reviews?campaignId=<id>", "PASS", f"Found {len(reviews)} reviews for campaign {campaign_id}. All belong to that campaign.")
        return True
        
    except Exception as e:
        log_test("GET /api/reviews?campaignId=<id>", "FAIL", f"Error: {e}")
        return False

def test_9_generate_reply():
    """Test 9: POST /api/reviews/{id}/generate-reply - Real Gemini call"""
    print("\n" + "="*60)
    print("TEST 9: Generate AI Reply (Real Gemini Call)")
    print("="*60)
    
    if not test_state["review_id_unanswered"]:
        log_test("POST /api/reviews/{id}/generate-reply", "FAIL", "No review_id available from previous tests")
        return False
    
    review_id = test_state["review_id_unanswered"]
    
    # Test 9a: Valid generation
    generate_data = {
        "tone": "Friendly",
        "length": "short"
    }
    
    print("   Calling Gemini API (may take up to 40 seconds)...")
    resp, err = make_request("POST", f"/reviews/{review_id}/generate-reply", generate_data, timeout=50)
    
    if err:
        log_test("POST /api/reviews/{id}/generate-reply (valid)", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("POST /api/reviews/{id}/generate-reply (valid)", "FAIL", f"Expected 200, got {resp.status_code}. Response: {resp.text}")
        return False
    
    try:
        data = resp.json()
        
        # Check required fields
        required_fields = ["reply", "tone", "length"]
        missing = [f for f in required_fields if f not in data]
        if missing:
            log_test("POST /api/reviews/{id}/generate-reply (valid)", "FAIL", f"Missing fields: {missing}")
            return False
        
        # Check reply is non-empty
        if not data["reply"] or len(data["reply"].strip()) == 0:
            log_test("POST /api/reviews/{id}/generate-reply (valid)", "FAIL", "Reply is empty")
            return False
        
        # Check tone and length match
        if data["tone"] != "Friendly":
            log_test("POST /api/reviews/{id}/generate-reply (valid)", "FAIL", f"Expected tone='Friendly', got '{data['tone']}'")
            return False
        
        if data["length"] != "short":
            log_test("POST /api/reviews/{id}/generate-reply (valid)", "FAIL", f"Expected length='short', got '{data['length']}'")
            return False
        
        log_test("POST /api/reviews/{id}/generate-reply (valid)", "PASS", f"Generated reply: '{data['reply'][:80]}...' (tone={data['tone']}, length={data['length']})")
        
    except Exception as e:
        log_test("POST /api/reviews/{id}/generate-reply (valid)", "FAIL", f"Error: {e}")
        return False
    
    # Test 9b: Invalid review id (404)
    resp, err = make_request("POST", "/reviews/nonexistent-id-12345/generate-reply", generate_data)
    
    if err:
        log_test("POST /api/reviews/{id}/generate-reply (invalid id)", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 404:
        log_test("POST /api/reviews/{id}/generate-reply (invalid id)", "FAIL", f"Expected 404, got {resp.status_code}")
        return False
    
    log_test("POST /api/reviews/{id}/generate-reply (invalid id)", "PASS", "Correctly returned 404 for nonexistent review id")
    return True

def test_10_update_review():
    """Test 10: PUT /api/reviews/{id} - Save reply and set status to draft"""
    print("\n" + "="*60)
    print("TEST 10: Update Review - Save Reply")
    print("="*60)
    
    if not test_state["review_id_unanswered"]:
        log_test("PUT /api/reviews/{id}", "FAIL", "No review_id available from previous tests")
        return False
    
    review_id = test_state["review_id_unanswered"]
    
    update_data = {
        "reply": "Thank you for your feedback! We truly appreciate your visit and look forward to serving you again soon."
    }
    
    resp, err = make_request("PUT", f"/reviews/{review_id}", update_data)
    
    if err:
        log_test("PUT /api/reviews/{id}", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("PUT /api/reviews/{id}", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        
        # Check reply was saved
        if data.get("reply") != update_data["reply"]:
            log_test("PUT /api/reviews/{id}", "FAIL", f"Reply not saved correctly. Expected '{update_data['reply']}', got '{data.get('reply')}'")
            return False
        
        # Check replyStatus became 'draft' (was unanswered)
        if data.get("replyStatus") != "draft":
            log_test("PUT /api/reviews/{id}", "FAIL", f"Expected replyStatus='draft', got '{data.get('replyStatus')}'")
            return False
        
        log_test("PUT /api/reviews/{id}", "PASS", f"Reply saved successfully. replyStatus changed to 'draft'")
        return True
        
    except Exception as e:
        log_test("PUT /api/reviews/{id}", "FAIL", f"Error: {e}")
        return False

def test_11_publish_review():
    """Test 11: POST /api/reviews/{id}/publish - Publish reply"""
    print("\n" + "="*60)
    print("TEST 11: Publish Review Reply")
    print("="*60)
    
    if not test_state["review_id_unanswered"]:
        log_test("POST /api/reviews/{id}/publish", "FAIL", "No review_id available from previous tests")
        return False
    
    review_id = test_state["review_id_unanswered"]
    
    publish_data = {
        "reply": "Thanks so much for your kind words! We're thrilled you had a great experience with us."
    }
    
    resp, err = make_request("POST", f"/reviews/{review_id}/publish", publish_data)
    
    if err:
        log_test("POST /api/reviews/{id}/publish", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 200:
        log_test("POST /api/reviews/{id}/publish", "FAIL", f"Expected 200, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        
        # Check replyStatus is 'published'
        if data.get("replyStatus") != "published":
            log_test("POST /api/reviews/{id}/publish", "FAIL", f"Expected replyStatus='published', got '{data.get('replyStatus')}'")
            return False
        
        # Check publishedAt is set
        if not data.get("publishedAt"):
            log_test("POST /api/reviews/{id}/publish", "FAIL", "publishedAt not set")
            return False
        
        # Check reply was saved
        if data.get("reply") != publish_data["reply"]:
            log_test("POST /api/reviews/{id}/publish", "FAIL", f"Reply not saved correctly")
            return False
        
        log_test("POST /api/reviews/{id}/publish", "PASS", f"Reply published successfully. replyStatus='published', publishedAt={data['publishedAt']}")
        return True
        
    except Exception as e:
        log_test("POST /api/reviews/{id}/publish", "FAIL", f"Error: {e}")
        return False

def test_12_publish_validation():
    """Test 12: POST /api/reviews/{id}/publish - Validation (empty reply on unanswered review)"""
    print("\n" + "="*60)
    print("TEST 12: Publish Validation - Empty Reply")
    print("="*60)
    
    if not test_state["review_id_for_publish_validation"]:
        log_test("POST /api/reviews/{id}/publish (validation)", "FAIL", "No fresh unanswered review_id available for validation test")
        return False
    
    review_id = test_state["review_id_for_publish_validation"]
    
    # First, check the current state of this review
    print(f"   DEBUG: Checking review {review_id} before publish...")
    resp_check, err_check = make_request("GET", "/reviews")
    if not err_check and resp_check.status_code == 200:
        reviews = resp_check.json().get("reviews", [])
        target_review = next((r for r in reviews if r["id"] == review_id), None)
        if target_review:
            print(f"   DEBUG: Review state - replyStatus: {target_review.get('replyStatus')}, reply: '{target_review.get('reply', '')}'")
        else:
            print(f"   DEBUG: Review {review_id} not found in list")
    
    # Try to publish with empty body (no reply)
    publish_data = {}
    
    resp, err = make_request("POST", f"/reviews/{review_id}/publish", publish_data)
    
    if err:
        log_test("POST /api/reviews/{id}/publish (validation)", "FAIL", f"Request failed: {err}")
        return False
    
    if resp.status_code != 400:
        try:
            response_data = resp.json()
            print(f"   DEBUG: Response status {resp.status_code}, data: {response_data}")
        except:
            print(f"   DEBUG: Response status {resp.status_code}, body: {resp.text}")
        log_test("POST /api/reviews/{id}/publish (validation)", "FAIL", f"Expected 400, got {resp.status_code}")
        return False
    
    try:
        data = resp.json()
        if "error" not in data:
            log_test("POST /api/reviews/{id}/publish (validation)", "FAIL", "Expected error message in response")
            return False
        
        log_test("POST /api/reviews/{id}/publish (validation)", "PASS", f"Correctly returned 400 with error: '{data['error']}'")
        return True
        
    except Exception as e:
        log_test("POST /api/reviews/{id}/publish (validation)", "FAIL", f"Error: {e}")
        return False

def main():
    """Run all review endpoint tests"""
    print("\n" + "="*60)
    print("NIURONAI REVIEWS INBOX - BACKEND API TEST SUITE")
    print("="*60)
    print(f"Base URL: {BASE_URL}")
    print("="*60)
    
    tests = [
        test_1_seed_reviews,
        test_2_list_reviews,
        test_3_filter_status_unanswered,
        test_4_filter_status_replied,
        test_5_filter_sentiment,
        test_6_filter_rating,
        test_7_filter_search,
        test_8_filter_campaign,
        test_9_generate_reply,
        test_10_update_review,
        test_11_publish_review,
        test_12_publish_validation,
    ]
    
    results = []
    for test_func in tests:
        try:
            result = test_func()
            results.append((test_func.__name__, result))
        except Exception as e:
            print(f"\n❌ {test_func.__name__} CRASHED: {e}")
            results.append((test_func.__name__, False))
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {name}")
    
    print("="*60)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("="*60)
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)

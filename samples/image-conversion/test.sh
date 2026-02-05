#!/bin/bash

# Image Conversion Service Test Script
# Tests various conversion scenarios using input.jpg

set -e

BASE_URL="http://localhost:3000"
INPUT_FILE="input.jpg"
OUTPUT_DIR="test_output"
SPIN_PID=""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Cleanup function
cleanup() {
    if [ -n "$SPIN_PID" ]; then
        echo ""
        echo -n "Stopping Spin application... "
        kill $SPIN_PID 2>/dev/null || true
        wait $SPIN_PID 2>/dev/null || true
        echo -e "${GREEN}Done${NC}"
    fi
    
    # Clean up output directory
    if [ -d "$OUTPUT_DIR" ]; then
        echo -n "Cleaning up test files... "
        rm -rf "$OUTPUT_DIR"
        echo -e "${GREEN}Done${NC}"
    fi
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Check if input file exists
if [ ! -f "$INPUT_FILE" ]; then
    echo -e "${RED}Error: $INPUT_FILE not found${NC}"
    echo "Please create an input.jpg file in the current directory"
    exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Image Conversion Service Test Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Build the Spin application
echo -n "Building Spin application... "
if spin build > /dev/null 2>&1; then
    echo -e "${GREEN}Done${NC}"
else
    echo -e "${RED}Failed${NC}"
    echo "Failed to build Spin application"
    exit 1
fi

# Start the Spin application in the background
echo -n "Starting Spin application... "
spin up > /dev/null 2>&1 &
SPIN_PID=$!

# Wait for the service to be ready
max_wait=10
waited=0
while [ $waited -lt $max_wait ]; do
    if curl -s "$BASE_URL/.well-known/spin/health" > /dev/null 2>&1; then
        echo -e "${GREEN}Done${NC}"
        break
    fi
    sleep 1
    waited=$((waited + 1))
done

if [ $waited -eq $max_wait ]; then
    echo -e "${RED}Failed${NC}"
    echo "Spin application did not start in time"
    exit 1
fi

echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Get dimensions from image file using the file command (cross-platform)
get_dimensions() {
    local file_path=$1
    local file_output=$(file -b "$file_path")
    
    # Extract all dimension patterns and find the right one
    # For JPEG: dimensions appear after "precision" like "precision 8, 640x427"
    # For PNG/GIF: "1920 x 1080" (with spaces)
    
    # Try matching dimensions with spaces first (PNG, GIF, BMP, TIFF)
    local pattern='([0-9]+) x ([0-9]+)'
    if [[ $file_output =~ $pattern ]]; then
        local width="${BASH_REMATCH[1]}"
        local height="${BASH_REMATCH[2]}"
        echo "${width}x${height}"
        return
    fi
    
    # For JPEG and other formats, extract all NxN patterns and filter
    # Use grep to find all matches, then pick the largest width (actual dimensions, not density)
    local matches=$(echo "$file_output" | grep -o '[0-9]\+x[0-9]\+')
    local max_width=0
    local best_match=""
    
    while IFS= read -r match; do
        if [ -n "$match" ]; then
            local w=$(echo "$match" | cut -d'x' -f1)
            if [ "$w" -gt "$max_width" ]; then
                max_width=$w
                best_match=$match
            fi
        fi
    done <<< "$matches"
    
    if [ -n "$best_match" ]; then
        echo "$best_match"
    else
        echo "unknown"
    fi
}

# Test function
test_conversion() {
    local test_name=$1
    local query_params=$2
    local output_file=$3
    local expected_type=$4
    local expected_width=$5
    local expected_height=$6
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    local http_code=$(curl -s -X POST --data-binary @"$INPUT_FILE" "${BASE_URL}${query_params}" -o "$OUTPUT_DIR/$output_file" -w "%{http_code}" 2>&1)
    
    if echo "$http_code" | grep -q "200"; then
        local file_type=$(file -b "$OUTPUT_DIR/$output_file")
        local test_passed=true
        local error_msg=""
        
        # Verify file type if expected_type is provided
        if [ -n "$expected_type" ]; then
            if ! echo "$file_type" | grep -qi "$expected_type"; then
                test_passed=false
                error_msg="Wrong type: expected '$expected_type', got '$file_type'"
            fi
        fi
        
        # Verify dimensions if provided
        if [ -n "$expected_width" ] || [ -n "$expected_height" ]; then
            local actual_dims=$(get_dimensions "$OUTPUT_DIR/$output_file")
            local actual_width=$(echo "$actual_dims" | cut -d'x' -f1)
            local actual_height=$(echo "$actual_dims" | cut -d'x' -f2)
            
            if [ -n "$expected_width" ] && [ "$actual_width" != "$expected_width" ]; then
                test_passed=false
                error_msg="${error_msg:+$error_msg; }Width mismatch: expected $expected_width, got $actual_width"
            fi
            
            if [ -n "$expected_height" ] && [ "$actual_height" != "$expected_height" ]; then
                test_passed=false
                error_msg="${error_msg:+$error_msg; }Height mismatch: expected $expected_height, got $actual_height"
            fi
        fi
        
        if [ "$test_passed" = true ]; then
            echo -e "[${GREEN}✓${NC}] $test_name"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            echo -e "[${RED}✗${NC}] $test_name"
            echo -e "    ${RED}Error: $error_msg${NC}"
            echo -e "    ${YELLOW}File output: $file_type${NC}"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
    else
        echo -e "[${RED}✗${NC}] $test_name"
        echo -e "    ${RED}HTTP Status: $http_code${NC}"
        if [ -f "$OUTPUT_DIR/$output_file" ]; then
            echo -e "    ${YELLOW}Response:${NC}"
            cat "$OUTPUT_DIR/$output_file" | head -5
        fi
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# Error test function
test_error() {
    local test_name=$1
    local query_params=$2
    local expected_status=$3
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    local response_file="$OUTPUT_DIR/error_response_$$.txt"
    response=$(curl -s -X POST --data-binary @"$INPUT_FILE" "${BASE_URL}${query_params}" -w "%{http_code}" -o "$response_file" 2>/dev/null)
    if [ "$response" = "$expected_status" ]; then
        echo -e "[${GREEN}✓${NC}] $test_name"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "[${RED}✗${NC}] $test_name"
        echo -e "    ${RED}HTTP Status: Expected $expected_status, got $response${NC}"
        if [ -f "$response_file" ]; then
            echo -e "    ${YELLOW}Response:${NC}"
            cat "$response_file"
        fi
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    rm -f "$response_file"
}

# Empty request error test
test_empty_error() {
    local test_name=$1
    local expected_status=$2
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    local response_file="$OUTPUT_DIR/error_response_$$.txt"
    response=$(curl -s -X POST "${BASE_URL}" -w "%{http_code}" -o "$response_file" 2>/dev/null)
    if [ "$response" = "$expected_status" ]; then
        echo -e "[${GREEN}✓${NC}] $test_name"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "[${RED}✗${NC}] $test_name"
        echo -e "    ${RED}HTTP Status: Expected $expected_status, got $response${NC}"
        if [ -f "$response_file" ]; then
            echo -e "    ${YELLOW}Response:${NC}"
            cat "$response_file"
        fi
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    rm -f "$response_file"
}

# Test 1: Basic conversion to PNG (default)
echo -e "${YELLOW}Format Conversion Tests:${NC}"
test_conversion "Convert to PNG (default)" "" "output.png" "PNG"

# Test 2: Convert to JPEG with quality
test_conversion "Convert to JPEG (quality 85)" "?format=jpeg&quality=85" "output_q85.jpg" "JPEG"
test_conversion "Convert to JPEG (quality 50)" "?format=jpeg&quality=50" "output_q50.jpg" "JPEG"

# Test 3: Convert to WebP
test_conversion "Convert to WebP" "?format=webp" "output.webp" "Web/P"

# Test 4: Convert to different formats
test_conversion "Convert to GIF" "?format=gif" "output.gif" "GIF"
test_conversion "Convert to BMP" "?format=bmp" "output.bmp" "bitmap"
test_conversion "Convert to TIFF" "?format=tiff" "output.tiff" "TIFF"

# Test 5: Resize operations
echo ""
echo -e "${YELLOW}Resize Tests:${NC}"
test_conversion "Resize width to 800px" "?format=png&width=800" "output_w800.png" "PNG" "800" ""
test_conversion "Resize height to 600px" "?format=png&height=600" "output_h600.png" "PNG" "" "600"
test_conversion "Resize to 1024x768" "?format=png&width=1024&height=768" "output_1024x768.png" "PNG" "1024" "768"

# Test 6: Combined operations
echo ""
echo -e "${YELLOW}Combined Operation Tests:${NC}"
test_conversion "Resize + JPEG + Quality" "?format=jpeg&width=640&quality=90" "output_640_q90.jpg" "JPEG" "640" ""
test_conversion "Large resize to PNG" "?format=png&width=2000" "output_w2000.png" "PNG" "2000" ""

# Test 7: Error cases
echo ""
echo -e "${YELLOW}Error Handling Tests:${NC}"

test_empty_error "Empty request" "400"
test_error "Invalid format" "?format=invalid" "400"
test_error "Invalid width" "?width=abc" "400"
test_error "Invalid quality" "?quality=150" "400"

# Display results summary
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}           Test Results${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Total Tests:  $TOTAL_TESTS"
echo -e "Passed:       ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed:       ${RED}$FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit_code=0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit_code=1
fi

exit $exit_code

#!/bin/bash
echo "🗾 简单测试（无 timeout）"
echo "======================="

passed=0
failed=0

find .. -name "*.tal" -type f | head -15 | while read file; do
    filename=$(basename "$file")
    echo -n "测试 $filename ... "
    
    if node bin/yaku.js -r -a "$file" > /dev/null 2>&1; then
        echo "✅ 通过"
        passed=$((passed + 1))
    else
        echo "❌ 失败"
        failed=$((failed + 1))
    fi
done

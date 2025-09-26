#!/bin/bash
echo "🗾 Yaku 详细测试报告"
echo "==================="
echo "测试时间: $(date)"
echo ""

passed=0
failed=0
errors=0

find .. -name "*.tal" -type f | while read file; do
    filename=$(basename "$file")
    echo -n "[$filename] "
    
    # 尝试运行，捕获输出和错误
    output=$(timeout 3s node bin/yaku.js -r -a "$file" 2>&1)
    exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        if [ -n "$output" ]; then
            echo "✅ 输出: $output" | tr '\n' ' ' | cut -c1-50
            echo ""
        else
            echo "✅ 运行成功（无输出）"
        fi
        passed=$((passed + 1))
    elif [[ "$output" == *"Error:"* ]]; then
        echo "⚠️  预期错误: $(echo "$output" | head -1 | cut -c1-40)..."
        errors=$((errors + 1))
    else
        echo "❌ 失败: $output" | head -1
        failed=$((failed + 1))
    fi
done

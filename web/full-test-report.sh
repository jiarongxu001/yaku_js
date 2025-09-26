#!/bin/bash
echo "🗾 Yaku 完整功能测试报告"
echo "========================="
echo "测试时间: $(date)"
echo ""

# 统计变量
total=0
passed=0
failed=0

# 测试函数
test_category() {
    local pattern="$1"
    local description="$2"
    local max_files="${3:-10}"
    
    echo "📁 $description"
    echo "$(echo "$description" | sed 's/./=/g')"
    
    local files=$(find .. -name "$pattern" -type f | head -$max_files)
    local category_total=0
    local category_passed=0
    
    for file in $files; do
        if [ -f "$file" ]; then
            filename=$(basename "$file")
            category_total=$((category_total + 1))
            total=$((total + 1))
            
            echo -n "  [$category_total] $filename ... "
            
            output=$(node bin/yaku.js -r -a "$file" 2>&1)
            if [ $? -eq 0 ]; then
                echo "✅ 通过"
                if [ -n "$output" ]; then
                    echo "      输出: $(echo "$output" | tr '\n' ' ' | cut -c1-40)"
                fi
                category_passed=$((category_passed + 1))
                passed=$((passed + 1))
            else
                echo "❌ 失败"
                failed=$((failed + 1))
            fi
        fi
    done
    
    echo "  小计: $category_passed/$category_total 通过"
    echo ""
}

# 运行各类测试
test_category "ex00*.tal" "基础示例" 5
test_category "ex01*.tal" "计算器示例" 5
test_category "*calc*.tal" "所有计算器" 8
test_category "ex0[6-7]*.tal" "子程序调用" 5
test_category "ex0[8-9]*.tal" "内存操作" 5
test_category "ex1[0-1]*.tal" "Hello World 和循环" 5

echo "📊 最终统计"
echo "============"
echo "总测试数: $total"
echo "通过数: $passed"
echo "失败数: $failed"
echo "成功率: $(( passed * 100 / total ))%"

if [ $failed -eq 0 ]; then
    echo ""
    echo "🎉 恭喜！所有测试都通过了！"
    echo "你的 Yaku UXN 解释器工作完美！"
else
    echo ""
    echo "⚠️  有 $failed 个测试需要检查"
fi

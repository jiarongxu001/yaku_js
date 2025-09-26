#!/bin/bash
echo "🗾 测试所有示例文件"
echo "=================="

# 查找所有 .tal 文件
find .. -name "*.tal" -type f | head -20 | while read file; do
    filename=$(basename "$file")
    echo -n "测试 $filename ... "
    
    if node bin/yaku.js -r -a "$file" > /dev/null 2>&1; then
        echo "✅ 通过"
    else
        echo "❌ 失败"
    fi
done

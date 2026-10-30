#!/bin/zsh
cd -- "${0:A:h}"
if command -v python3 >/dev/null 2>&1; then
  python3 start.py
else
  print '请先安装 Python 3.10 或更新版本：https://www.python.org/downloads/'
fi
print '\n浅景已退出。按回车关闭窗口。'
read

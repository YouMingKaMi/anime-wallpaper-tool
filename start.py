#!/usr/bin/env python3
"""Prepare the official native engine, then start the local UI. No accounts or API keys."""
import argparse
import json
import os
from pathlib import Path, PurePosixPath
import platform
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import venv
import zipfile

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, 'reconfigure'):
        stream.reconfigure(encoding='utf-8', errors='replace')
os.environ.setdefault('PYTHONUTF8', '1')

ROOT = Path(__file__).resolve().parent
RELEASE = 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/'
MODEL_FILES = {'realesrgan-x4plus-anime.bin', 'realesrgan-x4plus-anime.param'}


def platform_info(system=None, machine=None):
    system, machine = system or platform.system(), (machine or platform.machine()).lower()
    if system == 'Darwin' and machine in {'arm64', 'aarch64', 'x86_64', 'amd64'}:
        return 'macos', 'realesrgan-ncnn-vulkan'
    if system == 'Windows' and machine in {'amd64', 'x86_64'}:
        return 'windows', 'realesrgan-ncnn-vulkan.exe'
    if system == 'Linux' and machine in {'x86_64', 'amd64'}:
        return 'ubuntu', 'realesrgan-ncnn-vulkan'
    raise RuntimeError('动漫引擎支持 macOS Apple Silicon/Intel、Windows x64、Linux x64。此设备可使用 --web-only 模式。')


def install_engine(archive=None):
    target, executable = platform_info()
    engine = ROOT / 'local' / 'engine'
    marker = engine / 'installation.json'
    expected = {'platform': target, 'release': '20220424', 'model': 'realesrgan-x4plus-anime'}
    try:
        installed = json.loads(marker.read_text()) == expected
    except (OSError, ValueError):
        installed = False
    if installed and (engine / executable).is_file() and all((engine / 'models' / f).is_file() for f in MODEL_FILES):
        return
    print('首次启动：准备官方 Real-ESRGAN 动漫引擎（约 50 MB），以后无需重复下载。', flush=True)
    with tempfile.TemporaryDirectory(prefix='softwall-install-') as directory:
        archive_path = Path(archive).resolve() if archive else Path(directory) / 'engine.zip'
        if not archive:
            url = RELEASE + f'realesrgan-ncnn-vulkan-20220424-{target}.zip'
            request = urllib.request.Request(url, headers={'User-Agent': 'Softwall-Installer/1.0'})
            with urllib.request.urlopen(request, timeout=90) as response, archive_path.open('wb') as destination:
                total = int(response.headers.get('Content-Length', '0'))
                received, last = 0, -1
                while block := response.read(1024 * 1024):
                    received += len(block)
                    if received > 150 * 1024 * 1024:
                        raise RuntimeError('下载内容超出预期大小，请检查官方下载地址。')
                    destination.write(block)
                    percent = int(received / total * 100) if total else received // (1024 * 1024)
                    if percent != last:
                        print(f'下载引擎：{percent}' + ('%' if total else ' MB'), flush=True)
                        last = percent
        extracted = Path(directory) / 'selected'
        (extracted / 'models').mkdir(parents=True)
        found = set()
        with zipfile.ZipFile(archive_path) as archive_file:
            for member in archive_file.infolist():
                base = PurePosixPath(member.filename).name
                if base not in MODEL_FILES | {executable} or member.is_dir():
                    continue
                if base in found or member.file_size > 100 * 1024 * 1024:
                    raise RuntimeError('引擎压缩包结构不正确。')
                destination = extracted / ('models' if base in MODEL_FILES else '') / base
                with archive_file.open(member) as source, destination.open('wb') as output:
                    shutil.copyfileobj(source, output)
                found.add(base)
        if found != MODEL_FILES | {executable}:
            raise RuntimeError('压缩包缺少动漫引擎或模型，请重新下载。')
        engine.mkdir(parents=True, exist_ok=True)
        (engine / 'models').mkdir(exist_ok=True)
        for name in MODEL_FILES:
            os.replace(extracted / 'models' / name, engine / 'models' / name)
        os.replace(extracted / executable, engine / executable)
        (engine / executable).chmod(0o755)
        marker.write_text(json.dumps(expected, indent=2))
    print('动漫模型已准备好。', flush=True)


def runtime_python():
    if platform.system() == 'Darwin':
        return sys.executable  # macOS uses the built-in sips tool for final resizing.
    directory = ROOT / '.venv'
    executable = directory / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if not executable.exists():
        print('首次启动：准备独立的图片处理环境…', flush=True)
        venv.EnvBuilder(with_pip=True).create(directory)
    installed = subprocess.run([str(executable), '-c', 'from PIL import Image'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    if not installed:
        subprocess.run([str(executable), '-m', 'pip', 'install', '-r', str(ROOT / 'requirements.txt')], check=True)
    return str(executable)


def main():
    parser = argparse.ArgumentParser(description='浅景 · 无需登录的本地壁纸工具')
    parser.add_argument('--web-only', action='store_true', help='仅启动网页调色与浏览器增强')
    parser.add_argument('--prepare-only', action='store_true', help='准备引擎后退出')
    parser.add_argument('--no-open', action='store_true', help='不自动打开浏览器')
    parser.add_argument('--port', type=int, default=8839)
    parser.add_argument('--archive', help='使用已下载的对应平台官方引擎 ZIP')
    args = parser.parse_args()
    if sys.version_info < (3, 10):
        raise RuntimeError('请先安装 Python 3.10 或更新版本：https://www.python.org/downloads/')
    if not args.web_only:
        install_engine(args.archive)
        python = runtime_python()
    else:
        python = sys.executable
    if args.prepare_only:
        return
    command = [python, str(ROOT / 'local' / 'server.py'), '--port', str(args.port)]
    if not args.no_open:
        command.append('--open')
    raise SystemExit(subprocess.call(command))


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as error:
        print('\n启动失败：' + str(error), file=sys.stderr)
        print('可以检查网络后重试，或运行 python3 start.py --web-only 使用调色与浏览器增强。', file=sys.stderr)
        raise SystemExit(1)

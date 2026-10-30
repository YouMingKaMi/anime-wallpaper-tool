#!/usr/bin/env python3
"""Loopback-only Softwall UI and Real-ESRGAN anime inference. No external services."""
import argparse
import hmac
import json
import os
import platform
import sys
from pathlib import Path
import re
import secrets
import shutil
import signal
import struct
import subprocess
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import urllib.request
import webbrowser

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, 'reconfigure'):
        stream.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent
ENGINE = ROOT / 'local' / 'engine' / ('realesrgan-ncnn-vulkan.exe' if os.name == 'nt' else 'realesrgan-ncnn-vulkan')
MODELS = ENGINE.parent / 'models'
MODEL = 'realesrgan-x4plus-anime'
TOKEN = secrets.token_urlsafe(32)
JOBS = {}
LOCK = threading.RLock()
TEMP = tempfile.TemporaryDirectory(prefix='softwall-')
ID = re.compile(r'^[a-f0-9-]{36}$')
MAX_BYTES = 45 * 1024 * 1024
MAX_PIXELS = 8_000_000


def png_size(data):
    if len(data) < 33 or data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
        raise ValueError('图片格式不正确，请重新选择图片。')
    w, h = struct.unpack('>II', data[16:24])
    if not (0 < w <= 16384 and 0 < h <= 16384) or w * h > MAX_PIXELS:
        raise ValueError('动漫精细增强支持 800 万像素以内的原图，请先缩小图片。')
    return w, h


class Job:
    def __init__(self, job_id, data, width, height):
        self.id = job_id
        self.directory = Path(TEMP.name) / job_id
        self.directory.mkdir()
        self.source = self.directory / 'input.png'
        self.source.write_bytes(data)
        self.result = self.directory / 'result.png'
        self.width, self.height = width, height
        self.status, self.progress, self.message = 'running', 0, '正在启动动漫模型…'
        self.started = time.monotonic()
        self.process = None
        self.cancelled = threading.Event()

    def snapshot(self):
        return {'id': self.id, 'status': self.status, 'progress': self.progress,
                'message': self.message, 'elapsed': round(time.monotonic() - self.started),
                'model': 'RealESRGAN_x4plus_anime_6B'}

    def cancel(self):
        self.cancelled.set()
        with LOCK:
            proc = self.process
        if proc and proc.poll() is None:
            proc.terminate()

    def run(self):
        raw = self.directory / 'enhanced-4x.png'
        timer = threading.Timer(1800, self.cancel)
        timer.daemon = True
        timer.start()
        try:
            command = [str(ENGINE), '-i', str(self.source), '-o', str(raw),
                       '-m', str(MODELS), '-n', MODEL, '-s', '4', '-t', '128',
                       '-j', '1:1:1', '-f', 'png']
            with LOCK:
                self.process = subprocess.Popen(command, stdout=subprocess.DEVNULL,
                                                stderr=subprocess.PIPE, text=True,
                                                cwd=ENGINE.parent)
                if self.cancelled.is_set():
                    self.process.terminate()
                proc = self.process
            errors = []
            for line in proc.stderr:
                errors.append(line.strip())
                errors = errors[-12:]
                match = re.search(r'(\d+(?:\.\d+)?)%', line)
                if match:
                    with LOCK:
                        self.progress = min(95, max(self.progress, float(match[1]) * .95))
                        self.message = '动漫精细增强 · 正在重建线条与纹理'
            code = proc.wait()
            if self.cancelled.is_set():
                raise InterruptedError()
            if code != 0 or not raw.exists():
                print('Real-ESRGAN error:', '\n'.join(errors), flush=True)
                raise RuntimeError('动漫模型运行失败，请重新启动本地版后再试。')
            with LOCK:
                self.progress, self.message = 97, '正在生成 4K 图片…'
            axis = '--resampleWidth' if self.width >= self.height else '--resampleHeight'
            with LOCK:
                resize_command = (['/usr/bin/sips', axis, '3840', str(raw), '--out', str(self.result)]
                                  if platform.system() == 'Darwin' else
                                  [sys.executable, str(ROOT / 'local' / 'resize.py'), str(raw), str(self.result)])
                self.process = subprocess.Popen(resize_command,
                                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                if self.cancelled.is_set():
                    self.process.terminate()
                proc = self.process
            _, error = proc.communicate()
            if self.cancelled.is_set():
                raise InterruptedError()
            if proc.returncode or not self.result.exists():
                raise RuntimeError('4K 图片生成失败，请重试。')
            with LOCK:
                self.status, self.progress, self.message = 'done', 100, '动漫精细增强已完成'
        except InterruptedError:
            with LOCK:
                self.status, self.message = 'cancelled', '已取消处理，原图保留。'
        except Exception as error:
            with LOCK:
                self.status = 'failed'
                self.message = str(error) if isinstance(error, RuntimeError) else '本地模型未能完成处理，请重新启动本地版。'
            print('Job failed:', error, flush=True)
        finally:
            timer.cancel()
            self.source.unlink(missing_ok=True)
            raw.unlink(missing_ok=True)
            with LOCK:
                self.process = None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'dist'), **kwargs)

    def log_message(self, *_):
        pass

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'same-origin')
        if self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def json(self, code, value):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def allowed(self, token=False):
        port = self.server.server_address[1]
        hosts = {f'127.0.0.1:{port}', f'localhost:{port}'}
        origin = self.headers.get('Origin')
        site = self.headers.get('Sec-Fetch-Site')
        valid = self.headers.get('Host') in hosts and (not origin or origin in {f'http://{h}' for h in hosts})
        valid = valid and site not in {'cross-site', 'same-site'}
        if token:
            valid = valid and hmac.compare_digest(self.headers.get('X-Softwall-Token', ''), TOKEN)
        if not valid:
            self.json(403, {'error': '请从本地工具页面发起操作。'})
        return valid

    def job(self):
        parts = urlsplit(self.path).path.strip('/').split('/')
        if len(parts) not in (3, 4) or parts[:2] != ['api', 'jobs'] or not ID.fullmatch(parts[2]):
            return None
        return JOBS.get(parts[2])

    def do_GET(self):
        if not self.allowed():
            return
        path = urlsplit(self.path).path
        if path == '/api/status':
            self.json(200, {'app': 'softwall-local', 'ready': ENGINE.exists() and (MODELS / (MODEL + '.bin')).exists(),
                            'model': 'RealESRGAN_x4plus_anime_6B', 'token': TOKEN, 'max_pixels': MAX_PIXELS})
        elif path.startswith('/api/jobs/'):
            if not self.allowed(token=True):
                return
            with LOCK:
                job = self.job()
                if not job:
                    self.json(404, {'error': '任务不存在，请重新处理。'})
                elif path.endswith('/result'):
                    if job.status != 'done':
                        self.json(409, {'error': '图片仍在处理中。'})
                        return
                    self.send_response(200)
                    self.send_header('Content-Type', 'image/png')
                    self.send_header('Content-Length', str(job.result.stat().st_size))
                    self.end_headers()
                    with job.result.open('rb') as source:
                        shutil.copyfileobj(source, self.wfile)
                else:
                    self.json(200, job.snapshot())
        elif path.startswith('/api/'):
            self.json(404, {'error': '接口不存在。'})
        else:
            super().do_GET()

    def do_POST(self):
        if not self.allowed(token=True):
            return
        parts = urlsplit(self.path).path.strip('/').split('/')
        if len(parts) != 3 or parts[:2] != ['api', 'jobs'] or not ID.fullmatch(parts[2]):
            self.json(404, {'error': '任务地址不正确。'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BYTES:
                self.json(413, {'error': '图片过大，请选择较小的原图。'})
                return
            data = self.rfile.read(length)
            if len(data) != length:
                raise ValueError('图片未完整传入，请重试。')
            width, height = png_size(data)
            with LOCK:
                if parts[2] in JOBS:
                    self.json(409, {'error': '任务已经存在。'})
                    return
                if any(j.status == 'running' for j in JOBS.values()):
                    self.json(429, {'error': '已有图片正在处理，请等待完成或先取消。'})
                    return
                for job_id, old in list(JOBS.items()):
                    if len(JOBS) < 4:
                        break
                    shutil.rmtree(old.directory, ignore_errors=True)
                    del JOBS[job_id]
                job = Job(parts[2], data, width, height)
                JOBS[job.id] = job
                threading.Thread(target=job.run, daemon=True).start()
            self.json(202, job.snapshot())
        except ValueError as error:
            self.json(400, {'error': str(error)})

    def do_DELETE(self):
        if not self.allowed(token=True):
            return
        with LOCK:
            job = self.job()
            if not job:
                self.json(404, {'error': '任务不存在。'})
                return
            if job.status == 'running':
                job.cancel()
            self.json(200, {'cancelled': True})

    def do_OPTIONS(self):
        self.json(403, {'error': '本地处理只接受来自本地界面的操作。'})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8839)
    parser.add_argument('--open', action='store_true')
    args = parser.parse_args()
    address = f'http://127.0.0.1:{args.port}/'
    try:
        with urllib.request.urlopen(address + 'api/status', timeout=1) as response:
            existing = json.load(response)
        if existing.get('app') == 'softwall-local':
            print('浅景本地版已在运行：' + address)
            if args.open:
                webbrowser.open(address)
            return
    except Exception:
        pass
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError:
        raise SystemExit('端口已被其他程序占用，请关闭旧版工具，或使用 --port 8840。')
    print('浅景本地版已启动：' + address, flush=True)
    print('无需登录。关闭此窗口即可停止本地服务。', flush=True)
    if args.open:
        webbrowser.open(address)
    def stop(*_):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, stop)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        with LOCK:
            for job in JOBS.values():
                job.cancel()
        server.server_close()
        TEMP.cleanup()


if __name__ == '__main__':
    main()

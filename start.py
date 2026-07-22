#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import json
import shutil
import socket
import subprocess
import sys
import threading
from typing import List


PID_DIR = ".run"
PID_FILE = os.path.join(PID_DIR, "start.pids.json")


def _taskkill_tree(pid: int):
    if os.name != "nt":
        return
    try:
        subprocess.run(
            ["taskkill", "/PID", str(int(pid)), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except Exception:
        pass


def _kill_pid(pid: int):
    try:
        if os.name == "nt":
            _taskkill_tree(pid)
            return
        # unix fallback
        import signal

        os.kill(int(pid), signal.SIGTERM)
    except Exception:
        pass


def _load_previous_pids(repo_root: str) -> List[int]:
    path = os.path.join(repo_root, PID_FILE)
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            obj = json.load(f)
        pids = obj.get("pids") if isinstance(obj, dict) else None
        if not isinstance(pids, list):
            return []
        out: List[int] = []
        for x in pids:
            try:
                out.append(int(x))
            except Exception:
                pass
        return out
    except Exception:
        return []


def _write_pids(repo_root: str, pids: List[int]):
    try:
        os.makedirs(os.path.join(repo_root, PID_DIR), exist_ok=True)
        with open(os.path.join(repo_root, PID_FILE), "w", encoding="utf-8") as f:
            json.dump({"pids": [int(p) for p in pids], "cwd": repo_root}, f, ensure_ascii=False)
    except Exception:
        pass


def _clear_pid_file(repo_root: str):
    try:
        os.remove(os.path.join(repo_root, PID_FILE))
    except Exception:
        pass


def _stream(pipe, prefix: str):
    try:
        for line in iter(pipe.readline, ""):
            if not line:
                break
            try:
                sys.stdout.write(f"[{prefix}] {line}")
                sys.stdout.flush()
            except UnicodeEncodeError:
                sys.stdout.buffer.write(f"[{prefix}] ".encode('utf-8', errors='replace'))
                sys.stdout.buffer.write(line.encode('utf-8', errors='replace'))
                sys.stdout.buffer.flush()
    finally:
        try:
            pipe.close()
        except Exception:
            pass


def _spawn(args: List[str], cwd: str, prefix: str) -> subprocess.Popen:
    proc = subprocess.Popen(
        args,
        cwd=cwd,
        shell=False,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        universal_newlines=True,
    )

    t = threading.Thread(target=_stream, args=(proc.stdout, prefix), daemon=True)
    t.start()
    return proc


def main() -> int:
    repo_root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(repo_root)

    if shutil.which("node") is None:
        print("[start] 找不到 node：请先安装 Node.js，并确保 node 在 PATH 中。")
        return 1

    print(f"[start] Repo: {repo_root}")
    # Re-run friendly: kill previous processes started by this script
    prev = _load_previous_pids(repo_root)
    if prev:
        print(f"[start] 检测到上次残留进程记录：{prev}，正在清理...")
        for pid in prev:
            _kill_pid(pid)
        _clear_pid_file(repo_root)
    print("[start] Dev mode: starting server + client...")
    print("[start] (停止：在此终端按 Ctrl+C)")

    procs = []

    # Start server and client concurrently
    procs.append(_spawn(["node", "src/index.js"], cwd=os.path.join(repo_root, "server"), prefix="server"))
    vite_bin = os.path.join(repo_root, "node_modules", "vite", "bin", "vite.js")
    procs.append(_spawn(["node", vite_bin], cwd=os.path.join(repo_root, "client"), prefix="client"))
    _write_pids(repo_root, [p.pid for p in procs if p and p.pid])

    def terminate_all():
        for p in procs:
            try:
                if p.poll() is None:
                    if os.name == "nt":
                        subprocess.run(["taskkill", "/PID", str(p.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    else:
                        p.terminate()
            except Exception:
                pass

    def is_port_open(port, host='127.0.0.1'):
        try:
            with socket.create_connection((host, port), timeout=1.5):
                return True
        except Exception:
            return False

    try:
        # 给前后端 12 秒启动窗口
        threading.Event().wait(1)
        missing_streak = 0
        while True:
            server_ok = is_port_open(3000)
            client_ok = is_port_open(5173)
            if server_ok and client_ok:
                missing_streak = 0
            else:
                missing_streak += 1
                if missing_streak >= 3:
                    down = []
                    if not server_ok:
                        down.append('3000')
                    if not client_ok:
                        down.append('5173')
                    print(f"\n[start] 端口 {', '.join(down)} 未监听，正在关闭其它进程...")
                    terminate_all()
                    return 1
            threading.Event().wait(2)
    except KeyboardInterrupt:
        print("\n[start] Ctrl+C 收到，正在停止...")
        terminate_all()
        return 0
    finally:
        _clear_pid_file(repo_root)


if __name__ == "__main__":
    raise SystemExit(main())

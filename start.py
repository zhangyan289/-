#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import json
import shutil
import subprocess
import sys
import threading


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


def _load_previous_pids(repo_root: str) -> list[int]:
    path = os.path.join(repo_root, PID_FILE)
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            obj = json.load(f)
        pids = obj.get("pids") if isinstance(obj, dict) else None
        if not isinstance(pids, list):
            return []
        out: list[int] = []
        for x in pids:
            try:
                out.append(int(x))
            except Exception:
                pass
        return out
    except Exception:
        return []


def _write_pids(repo_root: str, pids: list[int]):
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
            sys.stdout.write(f"[{prefix}] {line}")
            sys.stdout.flush()
    finally:
        try:
            pipe.close()
        except Exception:
            pass


def _spawn(cmd: str, cwd: str, prefix: str) -> subprocess.Popen:
    # shell=True is the most reliable on Windows for npm.cmd resolution.
    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        shell=True,
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

    if shutil.which("npm") is None:
        print("[start] 找不到 npm：请先安装 Node.js，并确保 npm 在 PATH 中。")
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
    procs.append(_spawn("npm run dev", cwd=repo_root, prefix="server"))
    procs.append(_spawn("npm run dev:client", cwd=repo_root, prefix="client"))
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

    try:
        # Wait until any process exits; keep the script alive.
        while True:
            exit_codes = [p.poll() for p in procs]
            if any(code is not None for code in exit_codes):
                print("\n[start] 某个进程已退出，正在关闭其它进程...")
                terminate_all()
                return next((code for code in exit_codes if code is not None), 0) or 0
            threading.Event().wait(0.2)
    except KeyboardInterrupt:
        print("\n[start] Ctrl+C 收到，正在停止...")
        terminate_all()
        return 0
    finally:
        _clear_pid_file(repo_root)


if __name__ == "__main__":
    raise SystemExit(main())

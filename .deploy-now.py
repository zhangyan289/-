#!/usr/bin/env python3
import paramiko
import sys
import time

HOST = '120.55.183.89'
USER = 'root'
PASSWORD = 'tbszxy123!'
KIMI_KEY = 'sk-Gcn31mrc9sTZkrQt9mEun0lOiEwiMT1ZaGglym25KwDVSY0t'

def run(client, cmd, timeout=300):
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    rc = stdout.channel.recv_exit_status()
    safe_out = out.encode(sys.stdout.encoding, errors='replace').decode(sys.stdout.encoding)
    safe_err = err.encode(sys.stdout.encoding, errors='replace').decode(sys.stdout.encoding)
    if safe_out:
        print(safe_out)
    if safe_err:
        print(f"[stderr] {safe_err}", file=sys.stderr)
    print(f"exit: {rc}")
    return rc, out, err

def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {HOST} ...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    print("Connected.")

    # Pull latest code
    rc, _, _ = run(client, 'cd /opt/app && git pull origin main', timeout=120)
    if rc != 0:
        print("Git pull failed, aborting.")
        client.close()
        return 1

    # Build client
    rc, _, _ = run(client, 'cd /opt/app && npm run build', timeout=300)
    if rc != 0:
        print("Build failed, aborting.")
        client.close()
        return 1

    # Check and update KIMI_API_KEY in server/.env
    update_env_cmd = f"""
if grep -q '^KIMI_API_KEY=' /opt/app/server/.env; then
  sed -i 's|^KIMI_API_KEY=.*|KIMI_API_KEY={KIMI_KEY}|' /opt/app/server/.env
else
  echo 'KIMI_API_KEY={KIMI_KEY}' >> /opt/app/server/.env
fi
"""
    rc, _, _ = run(client, update_env_cmd, timeout=30)

    # Restart PM2 with update-env
    rc, _, _ = run(client, 'pm2 restart online-study-room --update-env', timeout=60)

    # Health check
    time.sleep(2)
    rc, out, _ = run(client, 'curl -s http://127.0.0.1:3000/api/health', timeout=30)
    if 'ok' not in out.lower():
        print("Health check did not return ok.")
        client.close()
        return 1

    print("\nDeployment complete.")
    client.close()
    return 0

if __name__ == '__main__':
    sys.exit(main())

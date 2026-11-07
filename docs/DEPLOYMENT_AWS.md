# Deploying AutoLoom to AWS EC2

> These are instructions only. They have **not** been executed: the build environment had no AWS credentials and no Docker daemon. Review each step before relying on it.

## 1. Launch the instance
- AMI: Ubuntu 22.04/24.04 LTS, type `t3.small` or larger (2 GB RAM minimum; MongoDB + Node + nginx).
- Storage: 20 GB gp3.
- Security group inbound: `22` (your IP only), `80`, `443`. **Do not open 27017 or 5000**; Compose does not publish them.
- Allocate and attach an Elastic IP; point a DNS A record at it if you have a domain.

## 2. Install Docker
```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
docker compose version
```

## 3. Get the code and configure
```bash
git clone <your-repo-url> autoloom && cd autoloom
cp .env.example .env
# generate secrets
echo "JWT_SECRET=$(openssl rand -hex 48)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
nano .env     # paste them; set:
#   NODE_ENV=production
#   WEB_PORT=80
#   PUBLIC_API_URL=https://your-domain   (or http://<elastic-ip>)
#   CLIENT_URL=https://your-domain       (or http://<elastic-ip>)
```
Keep a private backup of `ENCRYPTION_KEY`: without it, stored integration secrets cannot be decrypted.

## 4. Start
```bash
docker compose up -d --build
docker compose ps            # all three services should become "healthy"
docker compose logs -f server
curl http://localhost/api/health
```
Open `http://<elastic-ip>/`, register, and build a workflow.

## 5. HTTPS (recommended)
Simplest path: put Caddy or an AWS Application Load Balancer + ACM certificate in front of the `client` container. With Caddy on the host: set `WEB_PORT=8080`, then
```
your-domain {
  reverse_proxy localhost:8080
}
```
and update `PUBLIC_API_URL`/`CLIENT_URL` to `https://your-domain`, then `docker compose up -d`.

## 6. Operations
- Update: `git pull && docker compose up -d --build`.
- Data lives in the `mongo_data` volume. Backup: `docker compose exec mongo mongodump --archive --gzip > backup.gz`.
- Run **one** `server` replica. Schedules are registered in-process, so multiple replicas would each fire every schedule (see README, Known limitations).
- Logs: `docker compose logs --tail=200 server`.

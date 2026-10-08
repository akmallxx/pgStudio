import { Host, Snippet, SFTPFile, PortForwardRule } from 'nexussh/types/ssh';

export const INITIAL_HOSTS: Host[] = [
  {
    id: 'host_blackbox_2211',
    name: 'Blackbox Localhost (2211)',
    hostname: '127.0.0.1',
    port: 2211,
    username: 'blackbox',
    password: 'Logika1201#f',
    authType: 'password',
    environment: 'Development',
    tags: ['sample', 'local', 'ssh'],
    status: 'online',
    latencyMs: 1,
    lastConnected: 'Baru saja',
    notes: 'Sample SSH Host (blackbox@127.0.0.1:2211)',
  },
  {
    id: 'host-1',
    name: 'prod-api-cluster-01',
    hostname: '192.241.140.22',
    port: 22,
    username: 'deploy',
    authType: 'key',
    keyName: 'id_ed25519_production',
    environment: 'Production',
    tags: ['api', 'cluster', 'eu-central'],
    status: 'online',
    latencyMs: 24,
    lastConnected: 'Today, 08:30 AM',
    notes: 'Primary Node.js API Gateway with Docker swarm setup.'
  },
  {
    id: 'host-2',
    name: 'prod-postgres-primary',
    hostname: '10.0.12.8',
    port: 2222,
    username: 'postgres',
    authType: 'key',
    keyName: 'id_rsa_db_infra',
    environment: 'Database',
    tags: ['database', 'psql-16', 'high-availability'],
    status: 'online',
    latencyMs: 18,
    lastConnected: 'Yesterday, 14:15 PM',
    notes: 'Main DB cluster leader with streaming replication to replica-02.'
  },
  {
    id: 'host-3',
    name: 'staging-edge-proxy',
    hostname: '159.89.23.104',
    port: 22,
    username: 'nginx',
    authType: 'key',
    keyName: 'id_ed25519_staging',
    environment: 'Staging',
    tags: ['edge', 'nginx', 'ssl'],
    status: 'online',
    latencyMs: 42,
    lastConnected: '3 days ago',
    notes: 'Reverse proxy and TLS termination for staging environments.'
  },
  {
    id: 'host-4',
    name: 'homelab-k3s-master',
    hostname: '192.168.1.150',
    port: 22,
    username: 'akmal',
    authType: 'agent',
    environment: 'Homelab',
    tags: ['homelab', 'k3s', 'lan'],
    status: 'online',
    latencyMs: 3,
    lastConnected: '2 hours ago',
    notes: 'Local mini-PC running lightweight Kubernetes, Pi-hole, and Grafana.'
  },
  {
    id: 'host-5',
    name: 'aws-ingress-us-east',
    hostname: 'ec2-54-210-90.compute-1.amazonaws.com',
    port: 22,
    username: 'ec2-user',
    authType: 'key',
    keyName: 'aws-prod-keypair.pem',
    environment: 'Cloud',
    tags: ['aws', 'us-east-1', 'bastion'],
    status: 'online',
    latencyMs: 76,
    lastConnected: '1 week ago',
    notes: 'Bastion host for accessing private VPC subnets.'
  },
  {
    id: 'host-6',
    name: 'dev-jumphost-vm',
    hostname: '172.16.20.10',
    port: 22,
    username: 'developer',
    authType: 'password',
    password: 'SuperSecretDevPass2026!',
    tags: ['dev', 'jumphost', 'internal'],
    status: 'online',
    latencyMs: 12,
    lastConnected: 'Today, 11:20 AM',
    notes: 'Internal jump host for staging testing.'
  },
  {
    id: 'host-7',
    name: 'backup-cold-storage',
    hostname: '168.119.45.12',
    port: 22,
    username: 'rsync',
    authType: 'key',
    keyName: 'id_rsa_backup',
    tags: ['storage', 'rsync', 'dr'],
    status: 'unreachable',
    latencyMs: 0,
    lastConnected: '2 weeks ago',
    notes: 'Off-site disaster recovery storage. Maintenance scheduled.'
  }
];

export const INITIAL_SNIPPETS: Snippet[] = [
  {
    id: 'snip-1',
    description: 'Docker container inspection table & active ports',
    script: 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}\\t{{.Image}}"',
    targetHostIds: [], // Global (semua koneksi)
  },
  {
    id: 'snip-2',
    description: 'Tail live API gateway logs (100 lines)',
    script: 'docker logs -f --tail 100 api-gateway',
    targetHostIds: ['host-1'], // Hanya di prod-api-cluster-01
  },
  {
    id: 'snip-3',
    description: 'Verify Nginx syntax and reload service gracefully',
    script: 'sudo nginx -t && sudo systemctl reload nginx && echo "✓ Nginx reloaded"',
    targetHostIds: ['host-1', 'host-3'], // Hanya di host dengan web server/proxy
  },
  {
    id: 'snip-4',
    description: 'Inspect active running queries and connection locks in PostgreSQL',
    script: "psql -U postgres -d production -c \"SELECT pid, now() - query_start AS duration, state, left(query, 60) AS query FROM pg_stat_activity WHERE state != 'idle' ORDER BY duration DESC LIMIT 10;\"",
    targetHostIds: ['host-2'], // Hanya di prod-postgres-primary
  },
  {
    id: 'snip-5',
    description: 'Top 10 disk space consuming directories in /var/log',
    script: 'du -sh /var/log/* 2>/dev/null | sort -hr | head -n 10',
    targetHostIds: [], // Global (semua koneksi)
  },
  {
    id: 'snip-6',
    description: 'Inspect SSH daemon systemd journal logs (50 lines)',
    script: 'journalctl -u ssh -n 50 --no-pager',
    targetHostIds: [], // Global (semua koneksi)
  },
  {
    id: 'snip-7',
    description: 'Kill process listening on TCP port 3000',
    script: 'sudo fuser -k 3000/tcp || sudo lsof -ti:3000 | xargs -r kill -9',
    targetHostIds: ['host-1', 'host-4'],
  },
  {
    id: 'snip-pg-logs',
    description: 'PostgreSQL Live Log Stream (real-time error & query monitoring)',
    script: 'sudo tail -n 100 -f /var/log/postgresql/postgresql-*.log',
    targetHostIds: [],
  },
  {
    id: 'snip-pg-active-conn',
    description: 'Hitung total koneksi aktif ke database (pg_stat_activity count)',
    script: 'sudo -u postgres psql -c "SELECT count(*) AS active_connections FROM pg_stat_activity;"',
    targetHostIds: [],
  },
  {
    id: 'snip-pg-long-queries',
    description: 'Identifikasi query lambat yang berjalan >5 menit atau lock',
    script: 'sudo -u postgres psql -c "SELECT pid, now() - query_start AS duration, query, state FROM pg_stat_activity WHERE state != \'idle\' AND (now() - query_start) > interval \'5 minutes\';"',
    targetHostIds: [],
  },
  {
    id: 'snip-pg-db-sizes',
    description: 'Kapasitas dan alokasi disk storage per PostgreSQL database',
    script: 'sudo -u postgres psql -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) AS size FROM pg_database ORDER BY pg_database_size(datname) DESC;"',
    targetHostIds: [],
  },
  {
    id: 'snip-pg-status',
    description: 'Cek status unit systemd service daemon PostgreSQL',
    script: 'sudo systemctl status postgresql --no-pager',
    targetHostIds: [],
  }
];

export const INITIAL_SFTP_FILES: Record<string, SFTPFile[]> = {
  '/var/www/nexus-api': [
    {
      name: '..',
      path: '/var/www',
      type: 'directory',
      sizeBytes: 4096,
      permissions: 'drwxr-xr-x',
      owner: 'root',
      group: 'root',
      modified: '2026-03-20 10:00:00'
    },
    {
      name: 'config',
      path: '/var/www/nexus-api/config',
      type: 'directory',
      sizeBytes: 4096,
      permissions: 'drwxr-xr-x',
      owner: 'deploy',
      group: 'deploy',
      modified: '2026-04-01 14:22:10'
    },
    {
      name: 'logs',
      path: '/var/www/nexus-api/logs',
      type: 'directory',
      sizeBytes: 4096,
      permissions: 'drwxrwxr-x',
      owner: 'deploy',
      group: 'www-data',
      modified: '2026-04-06 08:35:12'
    },
    {
      name: '.env.production',
      path: '/var/www/nexus-api/.env.production',
      type: 'file',
      sizeBytes: 1420,
      permissions: '-rw-------',
      owner: 'deploy',
      group: 'deploy',
      modified: '2026-04-02 09:12:00',
      isEditable: true
    },
    {
      name: 'docker-compose.yml',
      path: '/var/www/nexus-api/docker-compose.yml',
      type: 'file',
      sizeBytes: 2840,
      permissions: '-rw-r--r--',
      owner: 'deploy',
      group: 'deploy',
      modified: '2026-04-04 16:40:19',
      isEditable: true
    },
    {
      name: 'nginx.conf',
      path: '/var/www/nexus-api/nginx.conf',
      type: 'file',
      sizeBytes: 1980,
      permissions: '-rw-r--r--',
      owner: 'deploy',
      group: 'deploy',
      modified: '2026-04-03 11:05:44',
      isEditable: true
    },
    {
      name: 'deploy.sh',
      path: '/var/www/nexus-api/deploy.sh',
      type: 'file',
      sizeBytes: 864,
      permissions: '-rwxr-xr-x',
      owner: 'deploy',
      group: 'deploy',
      modified: '2026-03-28 20:15:30',
      isEditable: true
    },
    {
      name: 'package.json',
      path: '/var/www/nexus-api/package.json',
      type: 'file',
      sizeBytes: 3120,
      permissions: '-rw-r--r--',
      owner: 'deploy',
      group: 'deploy',
      modified: '2026-04-01 17:30:00',
      isEditable: true
    },
    {
      name: 'app.bundle.tar.gz',
      path: '/var/www/nexus-api/app.bundle.tar.gz',
      type: 'file',
      sizeBytes: 42180000,
      permissions: '-rw-r--r--',
      owner: 'deploy',
      group: 'deploy',
      modified: '2026-04-05 23:10:05'
    }
  ],
  '/var/www/nexus-api/config': [
    {
      name: '..',
      path: '/var/www/nexus-api',
      type: 'directory',
      sizeBytes: 4096,
      permissions: 'drwxr-xr-x',
      owner: 'deploy',
      group: 'deploy',
      modified: '2026-04-06 08:35:12'
    },
    {
      name: 'redis.conf',
      path: '/var/www/nexus-api/config/redis.conf',
      type: 'file',
      sizeBytes: 1450,
      permissions: '-rw-r--r--',
      owner: 'deploy',
      group: 'deploy',
      modified: '2026-03-15 12:00:00',
      isEditable: true
    },
    {
      name: 'upstream.conf',
      path: '/var/www/nexus-api/config/upstream.conf',
      type: 'file',
      sizeBytes: 620,
      permissions: '-rw-r--r--',
      owner: 'deploy',
      group: 'deploy',
      modified: '2026-03-29 18:40:00',
      isEditable: true
    }
  ],
  '/var/www/nexus-api/logs': [
    {
      name: '..',
      path: '/var/www/nexus-api',
      type: 'directory',
      sizeBytes: 4096,
      permissions: 'drwxr-xr-x',
      owner: 'deploy',
      group: 'deploy',
      modified: '2026-04-06 08:35:12'
    },
    {
      name: 'access.log',
      path: '/var/www/nexus-api/logs/access.log',
      type: 'file',
      sizeBytes: 15420000,
      permissions: '-rw-r--r--',
      owner: 'deploy',
      group: 'www-data',
      modified: '2026-04-06 08:52:00',
      isEditable: true
    },
    {
      name: 'error.log',
      path: '/var/www/nexus-api/logs/error.log',
      type: 'file',
      sizeBytes: 124000,
      permissions: '-rw-r--r--',
      owner: 'deploy',
      group: 'www-data',
      modified: '2026-04-06 08:44:18',
      isEditable: true
    }
  ]
};

export const INITIAL_TUNNELS: PortForwardRule[] = [
  {
    id: 'tun-1',
    name: 'Production PostgreSQL Forward',
    hostId: 'host-2',
    hostName: 'prod-postgres-primary',
    type: 'local',
    bindAddress: '127.0.0.1',
    bindPort: 5432,
    targetHost: '127.0.0.1',
    targetPort: 5432,
    isActive: true,
    activeConnections: 3,
    trafficUpMb: 14.8,
    trafficDownMb: 82.4,
    description: 'Local connection to remote isolated PostgreSQL database for pgAdmin/DBeaver'
  },
  {
    id: 'tun-2',
    name: 'Prometheus & Grafana Dashboard',
    hostId: 'host-1',
    hostName: 'prod-api-cluster-01',
    type: 'local',
    bindAddress: '127.0.0.1',
    bindPort: 9090,
    targetHost: 'internal-monitor.local',
    targetPort: 9090,
    isActive: true,
    activeConnections: 1,
    trafficUpMb: 2.1,
    trafficDownMb: 18.6,
    description: 'Access cluster Prometheus metrics interface through SSH bastion'
  },
  {
    id: 'tun-3',
    name: 'AWS VPC SOCKS5 Dynamic Proxy',
    hostId: 'host-5',
    hostName: 'aws-ingress-us-east',
    type: 'dynamic',
    bindAddress: '127.0.0.1',
    bindPort: 1080,
    isActive: false,
    activeConnections: 0,
    trafficUpMb: 0,
    trafficDownMb: 0,
    description: 'Dynamic SOCKS5 proxy routing browser traffic directly through AWS VPC'
  },
  {
    id: 'tun-4',
    name: 'Remote Webhook Ingress to Localhost',
    hostId: 'host-3',
    hostName: 'staging-edge-proxy',
    type: 'remote',
    bindAddress: '0.0.0.0',
    bindPort: 8888,
    targetHost: '127.0.0.1',
    targetPort: 3000,
    isActive: true,
    activeConnections: 5,
    trafficUpMb: 6.4,
    trafficDownMb: 12.2,
    description: 'Exposes local developer service at port 3000 to public staging server:8888 for stripe webhooks'
  }
];

export const MOCK_FILE_CONTENTS: Record<string, string> = {
  '/var/www/nexus-api/.env.production': `# Nexus API Production Environment
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://app_user:s3cur3p@ssw0rd@10.0.12.8:5432/nexus_prod?sslmode=require
REDIS_URL=redis://:cache_p@ss@127.0.0.1:6379/0
JWT_SECRET=super-secure-production-random-jwt-key-2026
LOG_LEVEL=info
MAX_POOL_SIZE=25
CORS_ORIGIN=https://app.nexusinfra.io
`,
  '/var/www/nexus-api/docker-compose.yml': `version: '3.8'

services:
  api:
    image: nexus-api:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    env_file:
      - .env.production
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2048M
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"

  redis:
    image: redis:7-alpine
    restart: always
    volumes:
      - redis_data:/data
    command: redis-server /usr/local/etc/redis/redis.conf

volumes:
  redis_data:
`,
  '/var/www/nexus-api/nginx.conf': `events {
  worker_connections 2048;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  sendfile on;
  keepalive_timeout 65;
  gzip on;

  upstream backend {
    server 127.0.0.1:3000;
    keepalive 32;
  }

  server {
    listen 80;
    server_name api.nexusinfra.io;

    location / {
      proxy_pass http://backend;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_cache_bypass $http_upgrade;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
  }
}
`,
  '/var/www/nexus-api/deploy.sh': `#!/usr/bin/env bash
set -euo pipefail

echo "==> Deploying Nexus API to production..."
git fetch origin main
git reset --hard origin/main
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --remove-orphans
docker system prune -f --filter "until=24h"
echo "==> Healthcheck verifying..."
curl -fsS http://127.0.0.1:3000/health || exit 1
echo "==> Deployment complete!"
`
};

export const INITIAL_LOCAL_FILES: Record<string, SFTPFile[]> = {
  '~/Developer/nexus-api': [
    {
      name: '..',
      path: '~/Developer',
      type: 'directory',
      sizeBytes: 4096,
      permissions: 'drwxr-xr-x',
      owner: 'akmal',
      group: 'staff',
      modified: '2026-04-06 09:10:00'
    },
    {
      name: 'src',
      path: '~/Developer/nexus-api/src',
      type: 'directory',
      sizeBytes: 4096,
      permissions: 'drwxr-xr-x',
      owner: 'akmal',
      group: 'staff',
      modified: '2026-04-06 08:45:10'
    },
    {
      name: 'dist',
      path: '~/Developer/nexus-api/dist',
      type: 'directory',
      sizeBytes: 4096,
      permissions: 'drwxr-xr-x',
      owner: 'akmal',
      group: 'staff',
      modified: '2026-04-06 09:20:00'
    },
    {
      name: '.env.local',
      path: '~/Developer/nexus-api/.env.local',
      type: 'file',
      sizeBytes: 820,
      permissions: '-rw-------',
      owner: 'akmal',
      group: 'staff',
      modified: '2026-04-05 18:30:00',
      isEditable: true
    },
    {
      name: 'docker-compose.yml',
      path: '~/Developer/nexus-api/docker-compose.yml',
      type: 'file',
      sizeBytes: 2840,
      permissions: '-rw-r--r--',
      owner: 'akmal',
      group: 'staff',
      modified: '2026-04-04 16:40:19',
      isEditable: true
    },
    {
      name: 'package.json',
      path: '~/Developer/nexus-api/package.json',
      type: 'file',
      sizeBytes: 3120,
      permissions: '-rw-r--r--',
      owner: 'akmal',
      group: 'staff',
      modified: '2026-04-06 08:30:00',
      isEditable: true
    },
    {
      name: 'deploy.sh',
      path: '~/Developer/nexus-api/deploy.sh',
      type: 'file',
      sizeBytes: 864,
      permissions: '-rwxr-xr-x',
      owner: 'akmal',
      group: 'staff',
      modified: '2026-03-28 20:15:30',
      isEditable: true
    },
    {
      name: 'README.md',
      path: '~/Developer/nexus-api/README.md',
      type: 'file',
      sizeBytes: 1540,
      permissions: '-rw-r--r--',
      owner: 'akmal',
      group: 'staff',
      modified: '2026-04-02 11:15:00',
      isEditable: true
    }
  ],
  '~/Developer/nexus-api/src': [
    {
      name: '..',
      path: '~/Developer/nexus-api',
      type: 'directory',
      sizeBytes: 4096,
      permissions: 'drwxr-xr-x',
      owner: 'akmal',
      group: 'staff',
      modified: '2026-04-06 09:10:00'
    },
    {
      name: 'server.ts',
      path: '~/Developer/nexus-api/src/server.ts',
      type: 'file',
      sizeBytes: 4210,
      permissions: '-rw-r--r--',
      owner: 'akmal',
      group: 'staff',
      modified: '2026-04-06 08:45:10',
      isEditable: true
    },
    {
      name: 'routes.ts',
      path: '~/Developer/nexus-api/src/routes.ts',
      type: 'file',
      sizeBytes: 6850,
      permissions: '-rw-r--r--',
      owner: 'akmal',
      group: 'staff',
      modified: '2026-04-06 08:40:00',
      isEditable: true
    }
  ],
  '~/Developer/nexus-api/dist': [
    {
      name: '..',
      path: '~/Developer/nexus-api',
      type: 'directory',
      sizeBytes: 4096,
      permissions: 'drwxr-xr-x',
      owner: 'akmal',
      group: 'staff',
      modified: '2026-04-06 09:10:00'
    },
    {
      name: 'bundle.js',
      path: '~/Developer/nexus-api/dist/bundle.js',
      type: 'file',
      sizeBytes: 384000,
      permissions: '-rw-r--r--',
      owner: 'akmal',
      group: 'staff',
      modified: '2026-04-06 09:20:00'
    }
  ]
};


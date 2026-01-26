set -euo pipefail

PROJECT_NAME="asis"
BASE_DIR="/var/www/${PROJECT_NAME}"
PROJECT_DIR="${BASE_DIR}/${PROJECT_NAME}"

SQL_FILE="1_veritabani_tablolari.sql"

log() {
  echo -e "\n[+] $1\n"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}




get_env_value() {
  local key="$1"
  local env_file="$2"
  grep -E "^${key}=" "$env_file" | head -n 1 | sed -E "s/^${key}=//"
}

require_root_sudo() {
  if ! sudo -n true 2>/dev/null; then
    log "Sudo yetkisi gerekiyor. Şunu çalıştırıp tekrar dene: sudo -v"
    exit 1
  fi
}

install_base_packages() {
  log "Sistem güncelleniyor ve temel paketler kuruluyor..."
  sudo apt update -y
  sudo apt upgrade -y
  sudo apt install -y git curl build-essential ca-certificates gnupg lsb-release
}

install_postgres_postgis() {
  log "PostgreSQL + PostGIS kuruluyor..."
  sudo apt install -y postgresql postgresql-contrib postgis
}

install_nginx() {
  log "Nginx kuruluyor..."
  sudo apt install -y nginx
}

setup_firewall() {
  log "UFW kuruluyor ve firewall ayarlanıyor..."
  sudo apt install -y ufw
  sudo ufw allow OpenSSH
  sudo ufw allow "Nginx Full"
  sudo ufw --force enable
}

install_node22() {
  log "Node.js 22 kuruluyor..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs

  log "Node/NPM versiyon kontrol..."
  node -v
  npm -v
}



check_env_file() {
  log ".env kontrol ediliyor..."
  if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo " .env bulunamadı: $PROJECT_DIR/.env"
    echo
    echo " Şimdi şunu yap:"
    echo "   cd $PROJECT_DIR"
    echo "   nano .env"
    echo
    echo "Sonra tekrar çalıştır:"
    echo "   cd ~"
    echo "   ./setup_asis.sh"
    exit 1
  fi
}

read_env_vars() {
  log ".env içinden DB ayarları okunuyor..."
  ENV_FILE="$PROJECT_DIR/.env"

  PGDATABASE="$(get_env_value PGDATABASE "$ENV_FILE")"
  PGPASSWORD="$(get_env_value PGPASSWORD "$ENV_FILE")"
  PGUSER="$(get_env_value PGUSER "$ENV_FILE")"
  PGHOST="$(get_env_value PGHOST "$ENV_FILE")"
  PGPORT="$(get_env_value PGPORT "$ENV_FILE")"
  PORT="$(get_env_value PORT "$ENV_FILE")"

  

  PGDATABASE="${PGDATABASE}"
  PGPASSWORD="${PGPASSWORD}"
  PGUSER="${PGUSER}"
  PGHOST="${PGHOST}"
  PGPORT="${PGPORT}"
  PORT="${PORT}"

  echo "DB_NAME   = $PGDATABASE"
  echo "DB_USER   = $PGUSER"
  echo "DB_HOST   = $PGHOST"
  echo "DB_PORT   = $PGPORT"
  echo "APP_PORT  = $PORT"
}

configure_postgres() {
  log "PostgreSQL kullanıcı şifresi ayarlanıyor + DB oluşturuluyor..."

  # postgres kullanıcısının parolası
  sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '${PGPASSWORD}';"

  # DB var mı kontrolü
  DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${PGDATABASE}'" || true)
  if [ "$DB_EXISTS" = "1" ]; then
    log "Veritabanı zaten var: $PGDATABASE"
  else
    log "Veritabanı oluşturuluyor: $PGDATABASE"
    sudo -u postgres createdb "$PGDATABASE"
  fi

  
  log "PostGIS extension ekleniyor (varsa geçilecek)..."
  sudo -u postgres psql -d "$PGDATABASE" -c "CREATE EXTENSION IF NOT EXISTS postgis;"
}

run_sql_file() {
  log "SQL dosyası çalıştırılıyor..."

  if [ ! -f "$PROJECT_DIR/$SQL_FILE" ]; then
    echo " SQL dosyası bulunamadı: $PROJECT_DIR/$SQL_FILE"
    echo "Repo içinde bu dosyanın olduğundan emin ol."
    echo "Gerekirse scriptte SQL_FILE değişkenini güncelle."
    exit 1
  fi

  sudo -u postgres psql -d "$PGDATABASE" -f "$PROJECT_DIR/$SQL_FILE"
  log "SQL import tamamlandı "
}

install_project_deps() {
  log "NPM paketleri kuruluyor..."
  cd "$PROJECT_DIR"
  npm install
}

setup_pm2() {
  log "PM2 kuruluyor ve uygulama başlatılıyor..."
  sudo npm install -g pm2

  cd "$PROJECT_DIR"


  pm2 delete "$PROJECT_NAME" >/dev/null 2>&1 || true
  pm2 start index.js --name "$PROJECT_NAME"
  pm2 status
  pm2 save
  sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
}

setup_nginx() {
  log "Nginx reverse proxy ayarlanıyor..."

  NGINX_SITE="/etc/nginx/sites-available/${PROJECT_NAME}"

  sudo tee "$NGINX_SITE" >/dev/null <<EOF
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

  sudo ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${PROJECT_NAME}"
  sudo rm -f /etc/nginx/sites-enabled/default || true

  sudo nginx -t
  sudo systemctl reload nginx

  log "Nginx aktif "
}

final_info() {
  log "Kurulum tamamlandı "
  echo " Proje klasörü: $PROJECT_DIR"
  echo " PM2 adı: $PROJECT_NAME"
  echo
  echo "Kontrol komutları:"
  echo "  pm2 status"
  echo "  sudo systemctl status nginx --no-pager"
  echo
  echo "Güncelleme yapmak istersen:"
  echo "  cd $PROJECT_DIR"
  echo "  git pull"
  echo "  npm install"
  echo "  pm2 restart $PROJECT_NAME"
}
main() {
  require_root_sudo
  install_base_packages
  install_postgres_postgis
  install_nginx
  setup_firewall
  install_node22
  check_env_file
  read_env_vars
  configure_postgres
  run_sql_file
  install_project_deps
  setup_pm2
  setup_nginx
  final_info
}

main

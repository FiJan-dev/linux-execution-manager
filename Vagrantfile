# Base autônoma: prepara a VM Linux e clona o repositório.
# Pode ser usado sozinho, sem scripts ou pastas locais adicionais.

Vagrant.configure("2") do |config|
  config.vm.box = "bento/ubuntu-22.04"
  config.vm.hostname = "linux-execution-manager"
  config.vm.boot_timeout = 600
  config.vm.synced_folder ".", "/vagrant", disabled: true

  config.vm.network "forwarded_port", guest: 80, host: 8080, host_ip: "127.0.0.1"

  config.vm.provider "virtualbox" do |vb|
    vb.memory = 4096
    vb.cpus = 2
    vb.gui = false
  end

  config.vm.provision "shell", name: "Preparar Linux e clonar o projeto",
    env: {
      "LEM_REPO_URL" => ENV.fetch("LEM_REPO_URL", "https://github.com/FiJan-dev/linux-execution-manager.git"),
      "LEM_REPO_REF" => ENV.fetch("LEM_REPO_REF", "main")
    }, inline: <<~'BASH'
      #!/usr/bin/env bash
      set -Eeuo pipefail
      trap 'echo "[ERRO] Bootstrap interrompido na linha $LINENO." >&2' ERR
      export DEBIAN_FRONTEND=noninteractive GIT_TERMINAL_PROMPT=0
      PROJECT_DIR=/opt/linux-execution-manager
      PROJECT_USER=lem

      apt-get update
      apt-get install -y --no-install-recommends \
        ca-certificates git curl build-essential python3 openssl \
        util-linux iproute2 iputils-ping procps stress stress-ng tmux

      if [[ "$(stat -fc %T /sys/fs/cgroup)" != cgroup2fs ]]; then
        echo 'O ambiente precisa usar cgroups v2.' >&2
        exit 1
      fi
      for controller in cpu memory io; do
        if ! grep -qw "$controller" /sys/fs/cgroup/cgroup.controllers; then
          echo "Controlador cgroup ausente: $controller" >&2
          exit 1
        fi
      done

      if ! id "$PROJECT_USER" >/dev/null 2>&1; then
        useradd --system --user-group --create-home --home-dir "/home/$PROJECT_USER" \
          --shell /usr/sbin/nologin "$PROJECT_USER"
      fi

      if [[ ! -d "$PROJECT_DIR/.git" ]]; then
        if [[ -d "$PROJECT_DIR" && -n "$(ls -A "$PROJECT_DIR")" ]]; then
          echo "$PROJECT_DIR já contém arquivos. Use uma VM limpa ou salve esses arquivos antes de continuar." >&2
          exit 1
        fi
        install -d -o "$PROJECT_USER" -g "$PROJECT_USER" "$PROJECT_DIR"
        runuser -u "$PROJECT_USER" -- git clone -- "$LEM_REPO_URL" "$PROJECT_DIR"
      fi

      cd "$PROJECT_DIR"
      if [[ -n "$(runuser -u "$PROJECT_USER" -- git status --porcelain)" ]]; then
        echo 'Existem alterações locais no clone da VM. Salve-as antes de reprovisionar.' >&2
        exit 1
      fi
      runuser -u "$PROJECT_USER" -- git remote set-url origin "$LEM_REPO_URL"
      runuser -u "$PROJECT_USER" -- git fetch origin "$LEM_REPO_REF"
      runuser -u "$PROJECT_USER" -- git checkout --detach FETCH_HEAD

      echo "Ambiente base preparado. Repositório disponível em $PROJECT_DIR."
    BASH

  # Node e MySQL
  config.vm.provision "shell", name: "Instalar Node.js e MySQL", inline: <<~'BASH'
    #!/usr/bin/env bash
    set -Eeuo pipefail
    trap 'echo "[ERRO] Instalação do Node.js/MySQL interrompida na linha $LINENO." >&2' ERR
    export DEBIAN_FRONTEND=noninteractive

    if ! node --version 2>/dev/null | grep -q '^v22\.'; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
      apt-get install -y nodejs
    fi

    apt-get install -y --no-install-recommends mysql-server
    systemctl enable --now mysql

    install -d -o root -g root -m 700 /etc/lem
    if [[ ! -s /etc/lem/db.senha ]]; then
      openssl rand -hex 16 > /etc/lem/db.senha
    fi
    chmod 600 /etc/lem/db.senha
    DB_SENHA=$(cat /etc/lem/db.senha)

    mysql <<SQL
    CREATE DATABASE IF NOT EXISTS ambientes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE USER IF NOT EXISTS 'lem'@'localhost' IDENTIFIED BY '${DB_SENHA}';
    ALTER USER 'lem'@'localhost' IDENTIFIED BY '${DB_SENHA}';
    GRANT ALL PRIVILEGES ON ambientes.* TO 'lem'@'localhost';
    SQL

    echo "Node.js $(node --version) e MySQL instalados."
  BASH

  # Aplicação
  config.vm.provision "shell", name: "Instalar a aplicação", inline: <<~'BASH'
    #!/usr/bin/env bash
    set -Eeuo pipefail
    trap 'echo "[ERRO] Instalação da aplicação interrompida na linha $LINENO." >&2' ERR
    APP_DIR=/opt/linux-execution-manager/gerenciador-ambientes
    APP_USER=lem
    DADOS=/var/lib/lem

    if [[ ! -f "$APP_DIR/package.json" ]]; then
      echo "Aplicação não encontrada em $APP_DIR. Confira LEM_REPO_REF." >&2
      exit 1
    fi

    como_app() { runuser -u "$APP_USER" -- env HOME="/home/$APP_USER" "$@"; }

    # script de execução fora do clone, dono root e sem escrita para o lem
    # (se o lem pudesse editá-lo, o sudo abaixo viraria root para qualquer coisa)
    install -d -o root -g root -m 755 /opt/lem
    install -o root -g root -m 755 "$APP_DIR/infra/ambiente.sh" /opt/lem/ambiente.sh

    SUDOERS_TMP=$(mktemp)
    echo "$APP_USER ALL=(root) NOPASSWD: /opt/lem/ambiente.sh" > "$SUDOERS_TMP"
    visudo -cf "$SUDOERS_TMP"
    install -o root -g root -m 440 "$SUDOERS_TMP" /etc/sudoers.d/lem
    rm -f "$SUDOERS_TMP"

    install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$DADOS"

    DB_SENHA=$(cat /etc/lem/db.senha)
    cat > "$APP_DIR/.env" <<EOF
    DATABASE_URL="mysql://lem:${DB_SENHA}@localhost:3306/ambientes"
    LEM_DADOS="$DADOS"
    LEM_SCRIPT="/opt/lem/ambiente.sh"
    EOF
    chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"

    cd "$APP_DIR"
    como_app npm ci --no-audit --no-fund
    como_app npx prisma generate
    como_app npx prisma migrate deploy
    como_app npm run build

    cat > /etc/systemd/system/lem.service <<EOF
    [Unit]
    Description=Linux Execution Manager (Next.js)
    After=network.target mysql.service
    Requires=mysql.service

    [Service]
    Type=simple
    User=$APP_USER
    Group=$APP_USER
    WorkingDirectory=$APP_DIR
    Environment=NODE_ENV=production
    ExecStart=$APP_DIR/node_modules/.bin/next start --hostname 127.0.0.1 --port 3000
    Restart=on-failure

    [Install]
    WantedBy=multi-user.target
    EOF

    systemctl daemon-reload
    systemctl enable lem.service
    systemctl restart lem.service

    echo "Aplicação instalada e rodando em 127.0.0.1:3000."
  BASH

  # Apache
  config.vm.provision "shell", name: "Configurar o Apache", inline: <<~'BASH'
    #!/usr/bin/env bash
    set -Eeuo pipefail
    trap 'echo "[ERRO] Configuração do Apache interrompida na linha $LINENO." >&2' ERR
    export DEBIAN_FRONTEND=noninteractive

    apt-get install -y --no-install-recommends apache2
    a2enmod proxy proxy_http

    cat > /etc/apache2/sites-available/lem.conf <<'EOF'
    <VirtualHost *:80>
      ProxyPreserveHost On
      ProxyPass             / http://127.0.0.1:3000/
      ProxyPassReverse      / http://127.0.0.1:3000/
    </VirtualHost>
    EOF

    a2dissite 000-default
    a2ensite lem
    apache2ctl configtest
    systemctl enable apache2
    systemctl reload-or-restart apache2

    echo "Apache pronto na porta 80."
  BASH

  config.vm.post_up_message = <<~MSG
    Aplicação: http://localhost:8080
    Acesse a VM com vagrant ssh. Repositório /opt/linux-execution-manager
    Logs do Next: sudo journalctl -u lem -f
  MSG
end

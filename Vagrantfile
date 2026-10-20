# Base autônoma: prepara a VM Linux e clona o repositório.
# Pode ser usado sozinho, sem scripts ou pastas locais adicionais.

Vagrant.configure("2") do |config|
  config.vm.box = "bento/ubuntu-22.04"
  config.vm.hostname = "linux-execution-manager"
  config.vm.boot_timeout = 600
  config.vm.synced_folder ".", "/vagrant", disabled: true

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
      PROJECT_USER=vagrant

      apt-get update
      apt-get install -y --no-install-recommends \
        ca-certificates git curl build-essential python3 \
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

  config.vm.post_up_message = "Acesse com vagrant ssh. Repositório: /opt/linux-execution-manager"
end

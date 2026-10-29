#!/bin/bash
#
# Script de execução dos ambientes (cgroup v2 + namespace de PID).
# Chamado pela API como: sudo -n /opt/lem/ambiente.sh <comando> <argumentos>
#
# Comandos (sempre imprimem JSON no stdout; erros vão para o stderr, com código de saída 1):
#   criar    <nome> <cpu> <memMb> <ioMbps>    cria o cgroup, os limites e o namespace
#   executar <nome> <idProcesso> <caminho>    roda um script (.py ou .sh) dentro do ambiente
#   status   <nome>                           informa o estado de cada processo
#   encerrar <nome> <idProcesso>              encerra um processo
#   limpar   <nome>                           libera cgroup e namespace (mantém os logs)
#   remover  <nome>                           faz o "limpar" e apaga os arquivos do ambiente
#
# Pasta de dados (padrão /var/lib/lem), a mesma que o Next usa (LEM_DADOS):
#   scripts/<id>.<ext>                        scripts enviados pelos usuários
#   ambientes/<nome>/logs/<idProcesso>.log    saída de cada processo
#   ambientes/<nome>/estado/                  PIDs e códigos de saída (controle deste script)

# arquivos criados aqui ficam legíveis para o usuário do Next (log em 644, pastas em 755)
umask 022

# variável não definida vira erro, em vez de virar texto vazio sem avisar
set -u

DADOS="${LEM_DADOS:-/var/lib/lem}"
CGROUPS="/sys/fs/cgroup"

# tamanho máximo de um log; passando disso, fica só o final
LOG_MAXIMO_BYTES=$((5 * 1024 * 1024))
LOG_MANTER_BYTES=$((1 * 1024 * 1024))

# ------------------------------------------------------------------ utilitários

# mostra o erro no stderr e sai
falhar() {
  echo "erro: $*" >&2
  exit 1
}

# resposta dos comandos que só confirmam
ok() {
  echo '{"ok": true}'
}

# o nome vai para caminhos e para o rm -rf: só minúsculas, números e hífen (sem barra, sem ponto)
conferir_nome() {
  [[ "$1" =~ ^[a-z0-9][a-z0-9-]{1,30}$ ]] || falhar "nome de ambiente inválido: $1"
}

# id de processo no formato de uuid
conferir_id() {
  [[ "$1" =~ ^[0-9a-f-]{36}$ ]] || falhar "id de processo inválido: $1"
}

conferir_numero() {
  [[ "$1" =~ ^[0-9]+(\.[0-9]+)?$ ]] || falhar "valor inválido para $2: $1"
}

conferir_inteiro() {
  [[ "$1" =~ ^[0-9]+$ ]] || falhar "valor inválido para $2: $1"
}

# define os caminhos do ambiente (variáveis usadas pelos comandos abaixo)
definir_caminhos() {
  CG="$CGROUPS/lem-$1"
  PASTA="$DADOS/ambientes/$1"
  LOGS="$PASTA/logs"
  ESTADO="$PASTA/estado"
}

# descobre o MAJ:MIN do disco físico onde ficam os dados (o io.max precisa do disco, não da partição nem do volume LVM)
disco_de_dados() {
  local fonte nome

  fonte=$(df --output=source "$DADOS" 2>/dev/null | tail -n 1)

  if [ -z "$fonte" ]; then
    return
  fi

  # lsblk -s mostra o dispositivo e tudo o que está por baixo dele (volume, partição, disco)
  # fica com o primeiro item do tipo "disk"
  nome=$(lsblk -snro NAME,TYPE "$fonte" 2>/dev/null | awk '$2 == "disk" { print $1; exit }')

  if [ -z "$nome" ]; then
    return
  fi

  lsblk -dno MAJ:MIN "/dev/$nome" 2>/dev/null | tr -d ' '
}

# mata tudo o que está no cgroup (inclusive o dono do namespace) e apaga a pasta do cgroup
# o namespace some junto, porque o dono (PID 1 dele) morre
liberar() {
  local p

  if [ -d "$CG" ]; then
    if [ -w "$CG/cgroup.kill" ]; then
      echo 1 > "$CG/cgroup.kill" 2>/dev/null
    else
      # kernel sem cgroup.kill: mata um por um
      for p in $(cat "$CG/cgroup.procs" 2>/dev/null); do
        kill -KILL "$p" 2>/dev/null
      done
    fi

    # espera o cgroup esvaziar (até 5 segundos)
    for _ in $(seq 1 50); do
      if grep -q "populated 0" "$CG/cgroup.events" 2>/dev/null; then
        break
      fi

      sleep 0.1
    done

    rmdir "$CG" 2>/dev/null || return 1
  fi

  rm -f "$ESTADO/dono.pid" "$ESTADO/unshare.pid"

  return 0
}

# desfaz uma criação que falhou no meio
desfazer_criacao() {
  liberar
  rm -rf "$PASTA"
}

# ------------------------------------------------------------------ comandos

cmd_criar() {
  [ $# -eq 4 ] || falhar "uso: criar <nome> <cpu> <memMb> <ioMbps>"

  local nome="$1" cpu="$2" mem="$3" io="$4"

  conferir_nome "$nome"
  conferir_numero "$cpu" "cpu"
  conferir_inteiro "$mem" "memória"
  conferir_inteiro "$io" "io"

  definir_caminhos "$nome"

  if [ -d "$CG" ]; then
    falhar "o ambiente já existe: $nome"
  fi

  [ -f "$CGROUPS/cgroup.controllers" ] || falhar "cgroup v2 não encontrado em $CGROUPS"

  # libera os controladores de CPU, memória e IO para os cgroups filhos (se já estiverem liberados, não muda nada)
  echo "+cpu +memory +io" > "$CGROUPS/cgroup.subtree_control" 2>/dev/null

  mkdir "$CG" || falhar "não foi possível criar o cgroup $CG"

  mkdir -p "$LOGS" "$ESTADO" || { desfazer_criacao; falhar "não foi possível criar as pastas de $PASTA"; }

  # CPU: "<quota> <período>" em microssegundos
  # o período é de 1 segundo: com o padrão do Linux (100 ms) o limite freava mais do que devia na VM
  # 0,5 núcleo = 500000 de 1000000
  local quota periodo=1000000
  quota=$(awk -v c="$cpu" -v p="$periodo" 'BEGIN { printf "%d", c * p }')

  echo "$quota $periodo" > "$CG/cpu.max" || { desfazer_criacao; falhar "não foi possível definir cpu.max"; }

  # memória: em bytes
  echo $((mem * 1024 * 1024)) > "$CG/memory.max" || { desfazer_criacao; falhar "não foi possível definir memory.max"; }

  # sem swap, para o limite de memória valer de verdade (se o arquivo não existir, ignora)
  echo 0 > "$CG/memory.swap.max" 2>/dev/null

  # IO: "<MAJ:MIN> rbps=<bytes/s> wbps=<bytes/s>" para leitura e escrita
  local disco bps
  disco=$(disco_de_dados)

  if [ -z "$disco" ]; then
    desfazer_criacao
    falhar "não foi possível descobrir o disco de $DADOS"
  fi

  bps=$((io * 1024 * 1024))

  echo "$disco rbps=$bps wbps=$bps" > "$CG/io.max" || { desfazer_criacao; falhar "não foi possível definir io.max para o disco $disco"; }

  # cria o namespace: um processo "dono" (sleep infinito) que entra no cgroup e depois vira o unshare
  # o setsid separa o processo do Next e do terminal; o $$ dentro do sh é o PID que vira o do unshare (exec mantém o PID)
  setsid sh -c 'echo $$ > "$1/cgroup.procs"; echo $$ > "$2"; exec unshare --pid --fork --mount-proc sleep infinity' \
    sh "$CG" "$ESTADO/unshare.pid" < /dev/null > /dev/null 2>&1 &

  # o PID que interessa é o do sleep, filho do unshare (é o PID 1 do namespace novo)
  local tentativas=0 unshare_pid="" dono=""

  while [ $tentativas -lt 50 ]; do
    if [ -z "$unshare_pid" ] && [ -s "$ESTADO/unshare.pid" ]; then
      unshare_pid=$(cat "$ESTADO/unshare.pid")
    fi

    if [ -n "$unshare_pid" ]; then
      dono=$(pgrep -P "$unshare_pid" | head -n 1)
    fi

    if [ -n "$dono" ]; then
      break
    fi

    sleep 0.1
    tentativas=$((tentativas + 1))
  done

  if [ -z "$dono" ]; then
    desfazer_criacao
    falhar "o namespace não iniciou (confira se unshare e pgrep existem)"
  fi

  echo "$dono" > "$ESTADO/dono.pid"

  ok
}

cmd_executar() {
  [ $# -eq 3 ] || falhar "uso: executar <nome> <idProcesso> <caminho>"

  local nome="$1" id="$2" arquivo="$3"

  conferir_nome "$nome"
  conferir_id "$id"

  definir_caminhos "$nome"

  [ -d "$CG" ] || falhar "o ambiente não existe ou já foi liberado: $nome"
  [ -s "$ESTADO/dono.pid" ] || falhar "o ambiente não tem namespace: $nome"

  local dono
  dono=$(cat "$ESTADO/dono.pid")

  kill -0 "$dono" 2>/dev/null || falhar "o namespace do ambiente não está ativo: $nome"

  if [ -e "$ESTADO/proc-$id.pid" ]; then
    falhar "já existe um processo com este id: $id"
  fi

  # o script precisa existir e estar dentro da pasta dos scripts enviados
  local real base
  real=$(realpath -e "$arquivo" 2>/dev/null) || falhar "script não encontrado: $arquivo"
  base=$(realpath "$DADOS")

  case "$real" in
    "$base"/scripts/*) ;;
    *) falhar "o script precisa estar em $base/scripts" ;;
  esac

  # o interpretador vem da extensão
  local tipo

  case "$real" in
    *.py) tipo="py" ;;
    *.sh) tipo="sh" ;;
    *) falhar "só são aceitos scripts .py e .sh" ;;
  esac

  : > "$LOGS/$id.log"

  # o sh abaixo fica vivo até o script terminar:
  #   1. entra no cgroup (antes de rodar qualquer coisa, para os limites valerem desde o início)
  #   2. guarda o PID dele (é o PID do processo para a API)
  #   3. trap : TERM faz o sh sobreviver ao SIGTERM do "encerrar" para conseguir gravar o código (143)
  #   4. roda o script no namespace do dono (nsenter) em segundo plano, com a saída acrescentada (>>) ao log
  #   5. enquanto o script roda, a cada 2 segundos confere o log: se passou de $8 bytes, guarda só os últimos $9
  #      (o >> faz o programa continuar escrevendo no fim do arquivo depois de ele ser esvaziado)
  #   6. quando o script termina, grava o código de saída
  setsid sh -c '
    echo $$ > "$1/cgroup.procs"
    echo $$ > "$5"
    trap : TERM

    if [ "$7" = "py" ]; then
      nsenter -t "$2" -p -m -- python3 -u "$6" >> "$3" 2>&1 &
    else
      nsenter -t "$2" -p -m -- bash "$6" >> "$3" 2>&1 &
    fi

    filho=$!

    while kill -0 "$filho" 2>/dev/null; do
      sleep 2

      tamanho=$(stat -c %s "$3" 2>/dev/null || echo 0)

      if [ "$tamanho" -gt "$8" ]; then
        tail -c "$9" "$3" > "$3.tmp"
        : > "$3"
        cat "$3.tmp" >> "$3"
        rm -f "$3.tmp"
      fi
    done

    wait "$filho"
    echo $? > "$4"
  ' sh "$CG" "$dono" "$LOGS/$id.log" "$ESTADO/proc-$id.exit" "$ESTADO/proc-$id.pid" "$real" "$tipo" "$LOG_MAXIMO_BYTES" "$LOG_MANTER_BYTES" \
    < /dev/null > /dev/null 2>&1 &

  # espera o PID aparecer (até 5 segundos)
  local tentativas=0

  while [ $tentativas -lt 50 ] && [ ! -s "$ESTADO/proc-$id.pid" ]; do
    sleep 0.1
    tentativas=$((tentativas + 1))
  done

  [ -s "$ESTADO/proc-$id.pid" ] || falhar "o processo não iniciou"

  printf '{"pid": %s}\n' "$(cat "$ESTADO/proc-$id.pid")"
}

cmd_status() {
  [ $# -eq 1 ] || falhar "uso: status <nome>"

  conferir_nome "$1"
  definir_caminhos "$1"

  local primeiro=1 arq id pid codigo status extra

  printf '['

  for arq in "$ESTADO"/proc-*.pid; do
    # sem nenhum processo, o * não é trocado e o arquivo não existe
    [ -e "$arq" ] || continue

    id="${arq##*/proc-}"
    id="${id%.pid}"
    pid=$(cat "$arq" 2>/dev/null)
    extra=""

    # um PID que não seja número vira 0 (para o JSON continuar válido)
    if ! [[ "$pid" =~ ^[0-9]+$ ]]; then
      pid=0
    fi

    if [ "$pid" -gt 0 ] && kill -0 "$pid" 2>/dev/null; then
      status="executando"
    elif [ -s "$ESTADO/proc-$id.exit" ]; then
      codigo=$(cat "$ESTADO/proc-$id.exit")

      if [[ "$codigo" =~ ^[0-9]+$ ]]; then
        # 0 = acabou bem; 143 = encerrado pelo usuário (SIGTERM); o resto é erro
        if [ "$codigo" = "0" ] || [ "$codigo" = "143" ]; then
          status="terminado"
        else
          status="erro"
        fi

        extra=",\"codigoSaida\":$codigo"
      else
        status="erro"
      fi
    else
      # o PID sumiu sem deixar código de saída: algo matou o processo à força
      status="erro"
    fi

    if [ $primeiro -eq 0 ]; then
      printf ','
    fi

    primeiro=0

    printf '{"idProcesso":"%s","pid":%s,"status":"%s"%s}' "$id" "$pid" "$status" "$extra"
  done

  printf ']\n'
}

cmd_encerrar() {
  [ $# -eq 2 ] || falhar "uso: encerrar <nome> <idProcesso>"

  conferir_nome "$1"
  conferir_id "$2"
  definir_caminhos "$1"

  local id="$2" pid

  [ -s "$ESTADO/proc-$id.pid" ] || falhar "processo não encontrado: $id"

  pid=$(cat "$ESTADO/proc-$id.pid")

  # só age se ainda está rodando (encerrar duas vezes não dá erro)
  if [[ "$pid" =~ ^[0-9]+$ ]] && [ "$pid" -gt 0 ] && kill -0 "$pid" 2>/dev/null; then
    # o sh é líder do próprio grupo (setsid): o -PID manda o sinal para o grupo todo (sh, nsenter e o script)
    kill -TERM -- "-$pid" 2>/dev/null

    # espera até 5 segundos para o processo terminar sozinho
    for _ in $(seq 1 50); do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi

      sleep 0.1
    done

    # não terminou: mata à força e registra como encerrado pelo usuário (143), porque o sh morreu sem gravar
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL -- "-$pid" 2>/dev/null
      sleep 0.3
      echo 143 > "$ESTADO/proc-$id.exit"
    fi
  fi

  ok
}

cmd_limpar() {
  [ $# -eq 1 ] || falhar "uso: limpar <nome>"

  conferir_nome "$1"
  definir_caminhos "$1"

  liberar || falhar "não foi possível remover o cgroup $CG (ainda há processos?)"

  ok
}

cmd_remover() {
  [ $# -eq 1 ] || falhar "uso: remover <nome>"

  conferir_nome "$1"
  definir_caminhos "$1"

  liberar || falhar "não foi possível remover o cgroup $CG (ainda há processos?)"

  # o nome já foi conferido (sem barra nem ponto), então o caminho é sempre dentro de ambientes/
  if [ -n "$DADOS" ] && [ -d "$PASTA" ]; then
    rm -rf "$PASTA"
  fi

  ok
}

# ------------------------------------------------------------------ início

[ "$(id -u)" -eq 0 ] || falhar "este script precisa rodar como root (use sudo)"

[ $# -ge 1 ] || falhar "uso: ambiente.sh <criar|executar|status|encerrar|limpar|remover> ..."

comando="$1"
shift

case "$comando" in
  criar)    cmd_criar "$@" ;;
  executar) cmd_executar "$@" ;;
  status)   cmd_status "$@" ;;
  encerrar) cmd_encerrar "$@" ;;
  limpar)   cmd_limpar "$@" ;;
  remover)  cmd_remover "$@" ;;
  *)        falhar "comando desconhecido: $comando" ;;
esac
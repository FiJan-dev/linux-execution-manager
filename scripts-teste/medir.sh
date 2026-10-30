#!/bin/bash
#
# Roda DENTRO de um ambiente: a cada 5 s mostra o uso de CPU do próprio cgroup.
# Suba junto com um script que gaste CPU (ex.: cpu.py), no mesmo ambiente.
# "janela" = últimos 5 s; "média" = desde que este script começou.

INTERVALO=5

# o cgroup deste processo (/proc/self/cgroup tem o formato "0::/lem-<nome>")
CAMINHO=$(sed 's/^0:://' /proc/self/cgroup)
CG="/sys/fs/cgroup$CAMINHO"

# CPU usada pelo cgroup até agora, em microssegundos
cpu_usada() {
  awk '$1 == "usage_usec" { print $2 }' "$CG/cpu.stat"
}

# hora atual em microssegundos (o date dá nanossegundos; divide por 1000)
agora_us() {
  echo $(( $(date +%s%N) / 1000 ))
}

# limite configurado: quota / período, em % de um núcleo
read -r QUOTA PERIODO < "$CG/cpu.max"

if [ "$QUOTA" = "max" ]; then
  LIMITE="sem limite"
else
  LIMITE=$(awk -v q="$QUOTA" -v p="$PERIODO" 'BEGIN { printf "%.0f%%", q / p * 100 }')
fi

echo "cgroup: $CAMINHO | limite de CPU: $LIMITE (cpu.max = $QUOTA $PERIODO)"

cpu_inicio=$(cpu_usada)
relogio_inicio=$(agora_us)
cpu_anterior=$cpu_inicio
relogio_anterior=$relogio_inicio
passo=0

while true; do
  sleep "$INTERVALO"

  passo=$((passo + 1))
  cpu_atual=$(cpu_usada)
  relogio_atual=$(agora_us)

  awk -v dcpu="$((cpu_atual - cpu_anterior))" -v drel="$((relogio_atual - relogio_anterior))" \
      -v tcpu="$((cpu_atual - cpu_inicio))" -v trel="$((relogio_atual - relogio_inicio))" \
      -v n="$passo" -v iv="$INTERVALO" -v lim="$LIMITE" \
      'BEGIN { printf "%4d s | janela: %5.1f%% | média: %5.1f%% | limite: %s\n", n * iv, dcpu / drel * 100, tcpu / trel * 100, lim }'

  cpu_anterior=$cpu_atual
  relogio_anterior=$relogio_atual
done
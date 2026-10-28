#!/bin/bash
# mede a velocidade de escrita e de leitura no disco
# oflag/iflag=direct ignoram o cache de memória, então o io.max do ambiente vale direto
# com io = 10 MB/s no ambiente, as duas velocidades devem ficar perto de 10 MB/s

arquivo=$(mktemp /tmp/lem-disco.XXXXXX)
trap 'rm -f "$arquivo"' EXIT

echo "escrevendo 100 MB..."
dd if=/dev/zero of="$arquivo" bs=1M count=100 oflag=direct 2>&1 | tail -n 1

echo "lendo 100 MB..."
dd if="$arquivo" of=/dev/null bs=1M iflag=direct 2>&1 | tail -n 1

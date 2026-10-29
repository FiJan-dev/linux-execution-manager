#!/bin/bash
# termina com erro depois de 3 segundos (status "erro", código 3)

echo "começando..."
sleep 3
echo "algo deu errado" >&2
exit 3

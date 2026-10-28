#!/bin/bash
# termina sozinho depois de 10 segundos, com sucesso (status "terminado", código 0)

for i in 1 2 3 4 5; do
  echo "olá do ambiente ($i/5)"
  sleep 2
done

echo "fim"

# serviço que nunca termina: escreve uma linha por segundo
# serve para testar o status "executando", o log ao vivo e o botão de encerrar
import time
from datetime import datetime

i = 0

while True:
    i += 1
    print(f"[{datetime.now():%H:%M:%S}] linha {i}", flush=True)
    time.sleep(1)

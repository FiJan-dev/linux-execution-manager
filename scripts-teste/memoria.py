# aloca 10 MB por segundo até estourar o limite de memória do ambiente
# ao passar do memory.max, o kernel mata o processo (OOM) e o status vira "erro" (código 137)
import time

blocos = []

while True:
    # b"x" * n escreve de fato na memória (um bytearray vazio poderia não ocupar nada)
    blocos.append(b"x" * (10 * 1024 * 1024))
    print(f"memória alocada: {len(blocos) * 10} MB", flush=True)
    time.sleep(1)

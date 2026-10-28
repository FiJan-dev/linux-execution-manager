# consome CPU sem parar e mostra, a cada 2 segundos, quanto de CPU conseguiu usar
# com cpu = 0.5 no ambiente, o uso deve ficar perto de 50%
import time


def limite_cpu():
    # /proc/self/cgroup tem o formato "0::/lem-<nome>"
    caminho = open("/proc/self/cgroup").read().strip().split("::")[-1]

    try:
        quota, periodo = open(f"/sys/fs/cgroup{caminho}/cpu.max").read().split()
    except OSError:
        return "desconhecido"

    if quota == "max":
        return "sem limite"

    return f"{int(quota) / int(periodo):.2f} núcleo(s)"


print(f"limite de CPU do ambiente: {limite_cpu()}", flush=True)

while True:
    inicio_real = time.monotonic()
    inicio_cpu = time.process_time()

    # laço vazio: só gasta CPU
    while time.monotonic() - inicio_real < 2:
        pass

    # tempo de CPU recebido / tempo que passou no relógio
    uso = (time.process_time() - inicio_cpu) / (time.monotonic() - inicio_real) * 100
    print(f"uso de CPU: {uso:5.1f}%", flush=True)

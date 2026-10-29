#!/bin/bash
# mostra o isolamento do ambiente: PIDs do namespace, cgroup e limites aplicados

echo "meu PID dentro do namespace: $$"
echo

echo "processos visíveis (só os do próprio ambiente):"
ps -eo pid,ppid,cmd
echo

# /proc/self/cgroup tem o formato "0::/lem-<nome>"
cg=$(cut -d: -f3 /proc/self/cgroup)

echo "cgroup:     $cg"
echo "cpu.max:    $(cat "/sys/fs/cgroup$cg/cpu.max")"
echo "memory.max: $(cat "/sys/fs/cgroup$cg/memory.max")"
echo "io.max:     $(cat "/sys/fs/cgroup$cg/io.max")"

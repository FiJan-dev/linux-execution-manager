"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatarData, formatarMemoria } from "@/lib/format";
import type { AmbienteView } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";
import { StatusBadge } from "./StatusBadge";

//tela inicial: lista de ambientes com o status de cada um e as ações (ver, encerrar, remover)
export function ListaAmbientes() {
  //a lista de ambientes (atualiza a cada 3s)
  const { data, erro, carregando, recarregar } = usePolling<AmbienteView[]>("/api/ambientes");

  //mensagem de erro de uma ação (encerrar ou remover que deu errado)
  const [falha, setFalha] = useState<string | null>(null);

  //molde das ações: limpa o erro, faz a ação, atualiza a lista na hora e mostra o erro se falhar
  //fn é a ação a executar (uma chamada à API)
  async function executar(fn: () => Promise<unknown>) {
    setFalha(null);

    try {
      await fn();
      await recarregar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  //encerra todos os processos do ambiente
  function encerrar(a: AmbienteView) {
    void executar(() => {
      return api(`/api/ambientes/${a.id}/encerrar`, { method: "POST" });
    });
  }

  //remove o ambiente (encerra o que estiver rodando e apaga)
  function remover(a: AmbienteView) {
    //confirm abre a caixinha "OK / Cancelar"; se cancelar, não faz nada
    if (!confirm(`Remover o ambiente "${a.nome}"? Os processos em execução serão encerrados.`)) {
      return;
    }

    void executar(() => {
      return api(`/api/ambientes/${a.id}`, { method: "DELETE" });
    });
  }

  //enquanto a primeira busca não termina, só mostra "Carregando…"
  if (carregando) {
    return <p className="muted">Carregando…</p>;
  }

  //se não veio nada, usa uma lista vazia para o código abaixo não quebrar
  const lista = data ?? [];

  //quantos ambientes têm um determinado status (usado nos três cartões)
  function contar(status: AmbienteView["status"]): number {
    const doStatus = lista.filter((a) => a.status === status);
    return doStatus.length;
  }

  return (
    <>
      {/* quadro vermelho de erro: aparece só se houver erro (falha tem prioridade sobre erro) */}
      {(erro || falha) && (
        <div className="alert">{falha ?? erro}</div>
      )}

      {/* os três cartões com as contagens */}
      <div className="stats">
        <div className="stat">
          <span className="muted">Em execução</span>
          <b>{contar("executando")}</b>
        </div>
        <div className="stat">
          <span className="muted">Terminados</span>
          <b>{contar("terminado")}</b>
        </div>
        <div className="stat">
          <span className="muted">Com erro</span>
          <b>{contar("erro")}</b>
        </div>
      </div>

      <div className="card table-wrap">
        {/* dois casos: lista vazia (mostra um convite para criar) ou a tabela */}
        {lista.length === 0 ? (
          <div className="empty">
            <p>Nenhum ambiente criado ainda.</p>
            <Link className="btn btn-primary" href="/ambientes/novo">
              Criar o primeiro ambiente
            </Link>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ambiente</th>
                <th>Status</th>
                <th>Recursos</th>
                <th>Processos</th>
                <th>Criado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {/* uma linha para cada ambiente */}
              {lista.map((a) => {
                //quantos processos desse ambiente ainda estão rodando
                const processosRodando = a.processos.filter((p) => p.status === "executando");
                const rodando = processosRodando.length;

                return (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/ambientes/${a.id}`}>
                        <b>{a.nome}</b>
                      </Link>
                      <div className="muted mono">{a.namespace}</div>
                    </td>

                    <td>
                      <StatusBadge status={a.status} />
                    </td>

                    <td className="mono">
                      {a.cpu} CPU · {formatarMemoria(a.memoriaMb)} · {a.ioMbps} MB/s
                    </td>

                    <td>
                      {rodando}/{a.processos.length} em execução
                    </td>

                    <td>{formatarData(a.criadoEm)}</td>

                    <td>
                      <div className="acoes">
                        <Link className="btn btn-sm" href={`/ambientes/${a.id}`}>
                          Ver saída
                        </Link>

                        {/* o botão "Encerrar" só aparece se o ambiente está em execução */}
                        {a.status === "executando" && (
                          <button className="btn btn-sm" onClick={() => encerrar(a)}>
                            Encerrar
                          </button>
                        )}

                        <button className="btn btn-sm btn-danger" onClick={() => remover(a)}>
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
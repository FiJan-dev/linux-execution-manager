"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatarData, formatarDuracao, formatarMemoria } from "@/lib/format";
import type { AmbienteView } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";
import { LogViewer } from "./LogViewer";
import { StatusBadge } from "./StatusBadge";

//o que o DetalheAmbiente recebe de quem o usa (a página do ambiente)
interface DetalheAmbienteProps {
  id: string; //id do ambiente, que vem do endereço da página
}

//tela de um ambiente: resumo, tabela de processos, ações e o log (que só abre quando o usuário pede)
export function DetalheAmbiente(props: DetalheAmbienteProps) {
  //separa o valor recebido em uma variável
  const { id } = props;

  //router serve para mudar de página (volta para a lista depois de remover)
  const router = useRouter();

  //busca o ambiente a cada 3s (amb é o ambiente, ainda vazio até a primeira resposta)
  const { data: amb, erro, carregando, recarregar } = usePolling<AmbienteView>(`/api/ambientes/${id}`);

  //id do processo cujo log está aberto (null = log fechado, só abre quando o usuário clica em "Ver saída")
  const [selecionado, setSelecionado] = useState<string | null>(null);

  //mensagem de erro de uma ação (encerrar ou remover que deu errado)
  const [falha, setFalha] = useState<string | null>(null);

  //enquanto a primeira busca não termina, só mostra "Carregando…"
  if (carregando) {
    return <p className="muted">Carregando…</p>;
  }

  //se não veio ambiente (não existe ou a busca falhou), mostra o erro e um botão para voltar
  if (!amb) {
    return (
      <div className="card empty">
        <p>{erro ?? "Ambiente não encontrado."}</p>
        <Link className="btn" href="/">
          Voltar para a lista
        </Link>
      </div>
    );
  }

  //daqui para baixo o ambiente existe com certeza
  //a cópia em "ambiente" é para o TypeScript lembrar disso também dentro das funções abaixo
  const ambiente = amb;

  //o processo cujo log está aberto (null se nenhum)
  const processo = ambiente.processos.find((p) => p.id === selecionado) ?? null;

  //molde das ações: limpa o erro, faz a ação, atualiza na hora e mostra o erro se falhar
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
  function encerrarTudo() {
    void executar(() => {
      return api(`/api/ambientes/${ambiente.id}/encerrar`, { method: "POST" });
    });
  }

  //encerra um processo só
  function encerrarProcesso(processoId: string) {
    void executar(() => {
      return api(`/api/ambientes/${ambiente.id}/processos/${processoId}/encerrar`, { method: "POST" });
    });
  }

  //abre o log de um processo; se ele já estava aberto, fecha
  function alternarSaida(processoId: string) {
    if (processoId === selecionado) {
      setSelecionado(null); //já estava aberto: fecha
      return;
    }

    setSelecionado(processoId); //abre o log deste processo
  }

  //remove o ambiente e volta para a lista
  async function remover() {
    //confirm abre a caixinha "OK / Cancelar"; se cancelar, não faz nada
    if (!confirm(`Remover o ambiente "${ambiente.nome}"? Os processos em execução serão encerrados.`)) {
      return;
    }

    setFalha(null);

    try {
      await api(`/api/ambientes/${ambiente.id}`, { method: "DELETE" });
      router.push("/");
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  return (
    <>
      {/* cabeçalho: nome, status, namespace e os botões do ambiente */}
      <div className="page-head">
        <div>
          <h1>
            {ambiente.nome} <StatusBadge status={ambiente.status} />
          </h1>
          <p className="sub mono">{ambiente.namespace}</p>
        </div>

        <div className="acoes">
          <Link className="btn" href="/">
            ← Ambientes
          </Link>

          {/* o botão "Encerrar tudo" só aparece se o ambiente está em execução */}
          {ambiente.status === "executando" && (
            <button className="btn" onClick={encerrarTudo}>
              Encerrar tudo
            </button>
          )}

          <button className="btn btn-danger" onClick={() => void remover()}>
            Remover ambiente
          </button>
        </div>
      </div>

      {/* quadro vermelho de erro: aparece só se houver erro (falha tem prioridade sobre erro) */}
      {(falha || erro) && (
        <div className="alert">{falha ?? erro}</div>
      )}

      {/* resumo dos recursos do ambiente */}
      <div className="resumo">
        <div>
          <span>CPU</span>
          <b>{ambiente.cpu} núcleo(s)</b>
        </div>
        <div>
          <span>Memória</span>
          <b>{formatarMemoria(ambiente.memoriaMb)}</b>
        </div>
        <div>
          <span>IO</span>
          <b>{ambiente.ioMbps} MB/s</b>
        </div>
        <div>
          <span>Criado em</span>
          <b style={{ fontSize: 14 }}>{formatarData(ambiente.criadoEm)}</b>
        </div>
      </div>

      {/* tabela com os processos do ambiente */}
      <div className="card table-wrap">
        <h2>Processos</h2>
        <table>
          <thead>
            <tr>
              <th>Comando</th>
              <th>PID</th>
              <th>Status</th>
              <th>Duração</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {/* uma linha para cada processo */}
            {ambiente.processos.map((p) => {
              //true se o log deste processo é o que está aberto
              const saidaAberta = p.id === selecionado;

              //o código de saída só aparece depois que o processo terminou
              const terminou = p.status !== "executando";
              const temCodigo = p.codigoSaida !== undefined;

              return (
                <tr key={p.id} className={saidaAberta ? "selecionado" : ""}>
                  <td className="mono">{p.comando}</td>
                  <td className="mono">{p.pid}</td>

                  <td>
                    <StatusBadge status={p.status} />
                    {terminou && temCodigo && (
                      <span className="muted">
                        {" "}código {p.codigoSaida}
                      </span>
                    )}
                  </td>

                  {/* sem finalizadoEm (ainda rodando), a duração conta até agora */}
                  <td>{formatarDuracao(p.iniciadoEm, p.finalizadoEm)}</td>

                  <td>
                    <div className="acoes">
                      <button className="btn btn-sm" onClick={() => alternarSaida(p.id)}>
                        {saidaAberta ? "Fechar saída" : "Ver saída"}
                      </button>

                      {/* o botão "Encerrar" só aparece se o processo está rodando */}
                      {p.status === "executando" && (
                        <button className="btn btn-sm" onClick={() => encerrarProcesso(p.id)}>
                          Encerrar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* o log só aparece se algum processo foi selecionado (key reinicia o quadro ao trocar de processo) */}
      {processo && (
        <LogViewer
          key={processo.id}
          ambienteId={ambiente.id}
          processo={processo}
          onFechar={() => setSelecionado(null)}
        />
      )}
    </>
  );
}
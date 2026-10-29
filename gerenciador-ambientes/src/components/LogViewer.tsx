"use client";

import { useEffect, useRef, useState } from "react";
import type { LogResposta, Processo } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";
import { StatusBadge } from "./StatusBadge";

//o que o LogViewer recebe de quem o usa (a tela de detalhe)
interface LogViewerProps {
  ambienteId: string; //id do ambiente onde o processo está
  processo: Processo; //o processo cujo log será mostrado
  onFechar: () => void; //função que a tela de detalhe passa para fechar este quadro
}

//quadro com a saída (log) de um processo, atualizando sozinho
//use com key={processo.id} para reiniciar ao trocar de processo
export function LogViewer(props: LogViewerProps) {
  //separa os valores recebidos em variáveis
  const { ambienteId, processo, onFechar } = props;

  //endereço da rota do log deste processo
  const base = `/api/ambientes/${ambienteId}/processos/${processo.id}/log`;

  //busca as últimas 300 linhas do log a cada 2s
  const { data, erro } = usePolling<LogResposta>(`${base}?linhas=300`, 2000);

  //true = a rolagem acompanha o fim do log (a caixinha "acompanhar o fim")
  const [seguir, setSeguir] = useState(true);

  //referência ao quadro preto, para poder rolar até o final
  const ref = useRef<HTMLPreElement>(null);

  //roda quando chegam linhas novas (data) ou quando a caixinha muda (seguir)
  useEffect(() => {
    if (seguir && ref.current) {
      //scrollTop é o quanto o quadro foi rolado; scrollHeight é a altura total do conteúdo
      //colocar um no outro rola até o final
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [data, seguir]);

  //status mais recente: o que veio com o log, ou o do processo enquanto o log não chegou
  const status = data?.status ?? processo.status;

  return (
    <div className="card">
      {/* cabeçalho: título, comando e os controles */}
      <div className="log-head">
        <div>
          <h2 style={{ margin: 0 }}>Saída da execução</h2>
          <div className="mono muted">{processo.comando}</div>
        </div>

        <div className="log-opts">
          <StatusBadge status={status} />

          {/* o aviso só aparece enquanto o processo está rodando */}
          {status === "executando" && (
            <span className="muted">atualizando a cada 2s</span>
          )}

          <label>
            <input
              type="checkbox"
              checked={seguir}
              onChange={(e) => setSeguir(e.target.checked)}
            />{" "}
            acompanhar o fim
          </label>

          {/* link para o servidor: devolve o arquivo de log inteiro (formato=txt) e o navegador baixa */}
          <a
            className="btn btn-sm"
            href={`${base}?formato=txt`}
            download={`log-${processo.pid}.txt`}
          >
            Baixar log
          </a>

          <button className="btn btn-sm" onClick={onFechar}>
            Fechar
          </button>
        </div>
      </div>

      {/* quadro vermelho de erro, se a busca do log falhar */}
      {erro && (
        <div className="alert">{erro}</div>
      )}

      {/* o log em si: as linhas separadas por quebra de linha, ou "Carregando…" até a primeira resposta */}
      <pre className="log mono" ref={ref}>
        {data ? data.linhas.join("\n") : "Carregando…"}
      </pre>
    </div>
  );
}
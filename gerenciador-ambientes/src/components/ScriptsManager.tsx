"use client";

import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { formatarBytes, formatarData } from "@/lib/format";
import type { Script, ScriptResumo } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

//tela de scripts: enviar um script novo, ver a lista dos salvos, ver o conteúdo e remover
export function ScriptsManager() {
  //a lista de scripts (atualiza a cada 10s)
  const { data, erro, carregando, recarregar } = usePolling<ScriptResumo[]>("/api/scripts", 10000);

  //referência ao campo de escolher arquivo, para ler o arquivo escolhido e limpar o campo depois
  const inputRef = useRef<HTMLInputElement>(null);

  //mensagem de erro de uma ação (enviar, ver conteúdo ou remover)
  const [falha, setFalha] = useState<string | null>(null);

  //true enquanto o upload está acontecendo (desabilita o botão)
  const [enviando, setEnviando] = useState(false);

  //o script cujo conteúdo está aberto na tela (null = nenhum aberto)
  const [aberto, setAberto] = useState<Script | null>(null);

  //envia o arquivo escolhido
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); //impede o navegador de recarregar a página ao enviar o formulário
    setFalha(null);

    const arquivo = inputRef.current?.files?.[0]; //o primeiro arquivo escolhido (ou nada, se não escolheu)

    if (!arquivo) {
      setFalha("Selecione um arquivo.");
      return;
    }

    //só aceita .sh e .py (o i no final ignora maiúsculas)
    if (!/\.(sh|py)$/i.test(arquivo.name)) {
      setFalha("Envie um arquivo .sh (bash) ou .py (python).");
      return;
    }

    //arquivos são enviados dentro de um FormData, com o nome "arquivo" (é o nome que a API espera)
    const form = new FormData();
    form.append("arquivo", arquivo);

    setEnviando(true);

    try {
      await api<ScriptResumo>("/api/scripts", { method: "POST", body: form });

      //limpa o campo de arquivo para poder escolher outro
      if (inputRef.current) {
        inputRef.current.value = "";
      }

      await recarregar(); //atualiza a lista na hora
    } catch (err) {
      setFalha((err as Error).message);
    } finally {
      setEnviando(false); //com sucesso ou erro, o envio terminou
    }
  }

  //abre ou fecha o conteúdo de um script
  async function visualizar(s: ScriptResumo) {
    //se esse já está aberto, clicar de novo fecha
    if (aberto?.id === s.id) {
      setAberto(null);
      return;
    }

    setFalha(null);

    try {
      //a lista não traz o conteúdo, então busca o script completo
      setAberto(await api<Script>(`/api/scripts/${s.id}`));
    } catch (err) {
      setFalha((err as Error).message);
    }
  }

  //remove um script
  async function remover(s: ScriptResumo) {
    //confirm abre a caixinha "OK / Cancelar"; se cancelar, não faz nada
    if (!confirm(`Remover o script "${s.nome}"?`)) {
      return;
    }

    setFalha(null);

    try {
      await api(`/api/scripts/${s.id}`, { method: "DELETE" });

      //se o script removido era o que estava aberto, fecha o conteúdo
      if (aberto?.id === s.id) {
        setAberto(null);
      }

      await recarregar();
    } catch (err) {
      setFalha((err as Error).message);
    }
  }

  return (
    <>
      {/* quadro vermelho de erro: aparece só se houver erro (falha tem prioridade sobre erro) */}
      {(falha || erro) && <div className="alert">{falha ?? erro}</div>}

      {/* formulário de upload */}
      <form className="card" onSubmit={enviar}>
        <h2>Enviar novo script</h2>
        <div className="prog-row">
          <input ref={inputRef} type="file" accept=".sh,.py" />
          <button className="btn btn-primary" type="submit" disabled={enviando}>
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </div>
        <span className="hint">
          Aceita .sh (executado com bash) e .py (executado com python3). Os scripts ficam guardados
          e podem ser reutilizados em vários ambientes (máx. 1 MB).
        </span>
      </form>

      {/* lista dos scripts salvos */}
      <div className="card table-wrap">
        <h2>Scripts salvos</h2>

        {/* três casos: carregando, lista vazia ou a tabela com os scripts */}
        {carregando ? (
          <p className="muted">Carregando…</p>
        ) : !data || data.length === 0 ? (
          <div className="empty">Nenhum script enviado ainda.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tamanho</th>
                <th>Enviado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {/* uma linha para cada script */}
              {data.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.nome}</td>
                  <td>{formatarBytes(s.tamanhoBytes)}</td>
                  <td>{formatarData(s.criadoEm)}</td>
                  <td>
                    <div className="acoes">
                      <button className="btn btn-sm" onClick={() => void visualizar(s)}>
                        {aberto?.id === s.id ? "Ocultar" : "Ver conteúdo"}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => void remover(s)}>
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* conteúdo do script aberto (só aparece se houver um aberto) */}
        {aberto && <pre className="log preview mono">{aberto.conteudo}</pre>}
      </div>
    </>
  );
}
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { formatarBytes } from "@/lib/format";
import { LIMITES } from "@/lib/limites";
import type { AmbienteView, ScriptResumo } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

//formulário para criar um ambiente: nome, recursos (CPU, memória, IO) e os scripts a executar
export function FormAmbiente() {
  //router serve para mudar de página depois de criar o ambiente
  const router = useRouter();

  //os scripts salvos, para mostrar na lista de escolha (atualiza a cada 15s)
  const { data: scripts } = usePolling<ScriptResumo[]>("/api/scripts", 15000);

  //o que o usuário digitou (os campos de número ficam como texto até enviar)
  const [nome, setNome] = useState("");
  const [cpu, setCpu] = useState("0.5");
  const [memoriaMb, setMemoriaMb] = useState("256");
  const [ioMbps, setIoMbps] = useState("50");

  //ids dos scripts marcados
  const [scriptIds, setScriptIds] = useState<string[]>([]);

  //mensagem de erro ao criar (null = sem erro)
  const [erro, setErro] = useState<string | null>(null);

  //true enquanto o ambiente está sendo criado (desabilita o botão)
  const [enviando, setEnviando] = useState(false);

  //marca ou desmarca um script da seleção
  function alternarScript(id: string) {
    setScriptIds((atual) => {
      if (atual.includes(id)) {
        return atual.filter((x) => x !== id); //já estava marcado: tira da lista
      }

      return [...atual, id]; //não estava marcado: acrescenta na lista
    });
  }

  //true se já chegou no máximo de scripts e este ainda não está marcado (então não dá para marcar mais)
  function bloqueado(id: string): boolean {
    const jaMarcado = scriptIds.includes(id);
    const atingiuLimite = scriptIds.length >= LIMITES.maxProgramas;

    return !jaMarcado && atingiuLimite;
  }

  //envia o formulário para criar o ambiente
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); //impede o navegador de recarregar a página ao enviar o formulário
    setErro(null);
    setEnviando(true);

    try {
      const criado = await api<AmbienteView>("/api/ambientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        //os campos de número são convertidos de texto para número antes de enviar
        body: JSON.stringify({
          nome,
          cpu: Number(cpu),
          memoriaMb: Number(memoriaMb),
          ioMbps: Number(ioMbps),
          scriptIds,
        }),
      });

      //deu certo: vai para a tela do ambiente criado
      router.push(`/ambientes/${criado.id}`);
    } catch (err) {
      setErro((err as Error).message);
      setEnviando(false); //deu erro: libera o botão para tentar de novo
    }
  }

  return (
    <form onSubmit={enviar}>
      {/* quadro vermelho de erro, se houver */}
      {erro && (
        <div className="alert">{erro}</div>
      )}

      {/* nome do ambiente */}
      <div className="card">
        <h2>Identificação</h2>
        <div className="field" style={{ maxWidth: 360 }}>
          <label htmlFor="nome">Nome do ambiente (namespace)</label>
          <input
            id="nome"
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex.: teste-web"
            required
            minLength={2}
            maxLength={31}
            pattern="[a-z0-9][a-z0-9\-]{1,30}"
            title="De 2 a 31 caracteres: letras minúsculas, números e hífen (sem começar com hífen)"
          />
          <span className="hint">
            Letras minúsculas, números e hífen. O namespace será lem-{nome || "nome"}.
          </span>
        </div>
      </div>

      {/* recursos: os limites vêm do arquivo limites.ts */}
      <div className="card">
        <h2>Recursos</h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="cpu">CPU (núcleos)</label>
            <input
              id="cpu"
              type="number"
              value={cpu}
              onChange={(e) => setCpu(e.target.value)}
              min={LIMITES.cpu.min}
              max={LIMITES.cpu.max}
              step={LIMITES.cpu.passo}
              required
            />
            <span className="hint">
              De {LIMITES.cpu.min} a {LIMITES.cpu.max} (cpu.max)
            </span>
          </div>

          <div className="field">
            <label htmlFor="mem">Memória (MB)</label>
            <input
              id="mem"
              type="number"
              value={memoriaMb}
              onChange={(e) => setMemoriaMb(e.target.value)}
              min={LIMITES.memoriaMb.min}
              max={LIMITES.memoriaMb.max}
              step={1}
              required
            />
            <span className="hint">
              De {LIMITES.memoriaMb.min} a {LIMITES.memoriaMb.max} (memory.max)
            </span>
          </div>

          <div className="field">
            <label htmlFor="io">IO (MB/s)</label>
            <input
              id="io"
              type="number"
              value={ioMbps}
              onChange={(e) => setIoMbps(e.target.value)}
              min={LIMITES.ioMbps.min}
              max={LIMITES.ioMbps.max}
              step={1}
              required
            />
            <span className="hint">
              De {LIMITES.ioMbps.min} a {LIMITES.ioMbps.max} (io.max)
            </span>
          </div>
        </div>
      </div>

      {/* escolha dos scripts a executar */}
      <div className="card">
        <h2>O que executar</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Marque um ou mais scripts salvos. Cada script vira um processo separado, executado em
          paralelo dentro do ambiente (máximo {LIMITES.maxProgramas}). Envie novos scripts em{" "}
          <Link href="/scripts">Scripts</Link>.
        </p>

        {/* se já carregou e não há nenhum script, avisa */}
        {scripts && scripts.length === 0 && (
          <p className="muted">Nenhum script salvo ainda.</p>
        )}

        {/* uma caixinha para cada script salvo */}
        {(scripts ?? []).map((s) => (
          <label className="script-opcao" key={s.id}>
            <input
              type="checkbox"
              checked={scriptIds.includes(s.id)}
              disabled={bloqueado(s.id)}
              onChange={() => alternarScript(s.id)}
            />
            <span className="mono">{s.nome}</span>
            <span className="muted">{formatarBytes(s.tamanhoBytes)}</span>
          </label>
        ))}
      </div>

      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={enviando}>
          {enviando ? "Criando…" : "Criar ambiente"}
        </button>

        <Link className="btn" href="/">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
import type { Status } from "@/lib/types";

//traduz o status que a API devolve (executando, terminado ou erro) para o texto da tela
const ROTULOS: Record<Status, string> = {
  executando: "Em execução",
  terminado: "Terminado",
  erro: "Erro",
};

//etiqueta colorida com o status; a cor vem da classe badge-<status> no globals.css
export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{ROTULOS[status]}</span>;
}

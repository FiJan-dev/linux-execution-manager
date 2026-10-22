//funções que transformam valores "crus" em texto legível para mostrar na tela

//memória em MB -> "256 MB" ou "1.5 GB"
export function formatarMemoria(mb: number): string {
  if (mb < 1024) {
    return `${mb} MB`; //menos de 1 GB, mostra em MB
  }

  const gb = mb / 1024;

  //se for número inteiro mostra "2 GB", senão uma casa decimal "1.5 GB"
  if (Number.isInteger(gb)) {
    return `${gb} GB`;
  }

  return `${gb.toFixed(1)} GB`;
}

//tamanho em bytes -> "512 B", "1.5 KB" ou "2.3 MB"
export function formatarBytes(b: number): string {
  if (b < 1024) {
    return `${b} B`;
  }

  if (b < 1024 * 1024) {
    return `${(b / 1024).toFixed(1)} KB`;
  }

  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

//data em formato ISO (como vem da API) -> "20/10/2026, 21:34:44"
export function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

//tempo entre início e fim -> "40s", "2m 10s" ou "1h 5m"
//se o processo ainda não terminou (sem fim), conta até agora
export function formatarDuracao(inicio: string, fim?: string): string {
  const fimMs = fim ? Date.parse(fim) : Date.now(); //Date.parse converte o texto da data em milissegundos

  //diferença em segundos (o Math.max evita número negativo se os relógios estiverem desencontrados)
  const s = Math.max(0, Math.floor((fimMs - Date.parse(inicio)) / 1000));

  const h = Math.floor(s / 3600); //horas inteiras
  const m = Math.floor((s % 3600) / 60); //minutos que sobraram depois das horas (% = resto da divisão)

  if (h > 0) {
    return `${h}h ${m}m`;
  }

  if (m > 0) {
    return `${m}m ${s % 60}s`;
  }

  return `${s}s`;
}